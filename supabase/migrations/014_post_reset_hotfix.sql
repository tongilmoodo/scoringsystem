-- ============================================================
-- 014_post_reset_hotfix.sql
-- Run AFTER reset_schema.sql, as one block, in the Supabase SQL
-- editor. Idempotent: safe to run more than once.
--
-- Fixes runtime bugs in the reset and restores columns, functions,
-- and policies the deployed app still depends on:
--   A. Missing columns (end_match writes ended_at; the frontend
--      selects tournaments.date/courts_count and
--      events.weight_class/description explicitly)
--   B. Unusable seed users (placeholder bcrypt hashes)
--   C. Functions dropped by the reset but still called by the app
--   D. Bugs in the reset functions (fouls, takedown anchor,
--      auto-advance)
--   E. Missing RLS (admin writes, controller undo)
--   F. Realtime for tables the UI subscribes to
-- ============================================================

-- ------------------------------------------------------------
-- A. Columns
-- ------------------------------------------------------------
ALTER TABLE matches      ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE score_events ADD COLUMN IF NOT EXISTS athlete_id UUID REFERENCES athletes(id) ON DELETE SET NULL;
ALTER TABLE events       ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE events       ADD COLUMN IF NOT EXISTS weight_class TEXT;
ALTER TABLE tournaments  ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE tournaments  ADD COLUMN IF NOT EXISTS courts_count INT NOT NULL DEFAULT 2;

UPDATE tournaments SET date = start_date WHERE date IS NULL;
UPDATE events SET weight_class = division WHERE weight_class IS NULL AND division IS NOT NULL;
UPDATE events SET description =
  CASE
    WHEN category IN ('sparring_kumite', 'team_sparring_5_person') THEN
      rounds || ' round' || CASE WHEN rounds > 1 THEN 's' ELSE '' END ||
      ' x ' || (round_duration_seconds / 60) || ' min' ||
      CASE WHEN rounds > 1 AND break_duration_seconds > 0
           THEN ' / ' || break_duration_seconds || 's break' ELSE '' END
    ELSE 'Max ' || (round_duration_seconds / 60) || ' min'
  END
WHERE description IS NULL;

-- The controller win dialog offers Forfeit.
ALTER TYPE win_method ADD VALUE IF NOT EXISTS 'forfeit';

-- ------------------------------------------------------------
-- B. Seed users: placeholder hashes can never match any PIN.
--    After running this file, re-create real users from a shell:
--      TOURNAMENT_SLUG=mombasa-open-2026 node scripts/seed-users.mjs
--    (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
-- ------------------------------------------------------------
DELETE FROM users WHERE pin_hash LIKE '$2b$10$demo_hash%';

-- ------------------------------------------------------------
-- C. Functions the app calls that the reset dropped
-- ------------------------------------------------------------

-- clear_votes: the new vote_status enum has no 'cleared', so delete
-- pending votes instead of flagging them.
CREATE OR REPLACE FUNCTION clear_votes(p_match_id UUID, p_player_side player_side)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_cleared INT;
BEGIN
  DELETE FROM judge_votes
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RETURN jsonb_build_object('cleared', true, 'votes_cleared', v_cleared, 'side', p_player_side);
END;
$$;

-- manual_commit_score: controller override. Also applies the score /
-- foul to the match (there is no score trigger any more) and runs the
-- 8-point TKO check.
CREATE OR REPLACE FUNCTION manual_commit_score(
  p_match_id UUID, p_player_side player_side, p_action_type action_type, p_controller_name TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_points INT;
BEGIN
  v_points := CASE p_action_type WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;

  INSERT INTO score_events (match_id, player_side, action_type, points, match_time_seconds, scored_by)
  VALUES (p_match_id, p_player_side, p_action_type, v_points,
          COALESCE((SELECT timer_seconds FROM matches WHERE id = p_match_id), 0),
          p_controller_name || '_manual');

  IF p_action_type = 'foul' THEN
    IF p_player_side = 'blue' THEN
      UPDATE matches SET blue_fouls = blue_fouls + 1, updated_at = NOW() WHERE id = p_match_id;
    ELSE
      UPDATE matches SET red_fouls = red_fouls + 1, updated_at = NOW() WHERE id = p_match_id;
    END IF;
  ELSE
    IF p_player_side = 'blue' THEN
      UPDATE matches SET blue_score = blue_score + v_points, updated_at = NOW() WHERE id = p_match_id;
    ELSE
      UPDATE matches SET red_score = red_score + v_points, updated_at = NOW() WHERE id = p_match_id;
    END IF;
    IF ABS((SELECT blue_score FROM matches WHERE id = p_match_id)
         - (SELECT red_score  FROM matches WHERE id = p_match_id)) >= 8 THEN
      UPDATE matches SET tko_available = true WHERE id = p_match_id;
    END IF;
  END IF;

  DELETE FROM judge_votes
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';

  RETURN jsonb_build_object('committed', true, 'action', p_action_type, 'side', p_player_side);
END;
$$;

-- append_match_audit: called by the admin matches page on timer
-- adjustments and status overrides.
CREATE TABLE IF NOT EXISTS match_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE match_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_read_match_audit ON match_audit;
CREATE POLICY public_read_match_audit ON match_audit FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION append_match_audit(
  p_match_id UUID, p_action TEXT, p_user TEXT, p_note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO match_audit (match_id, action, actor, note)
  VALUES (p_match_id, p_action, p_user, p_note);
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------
-- D. Fix bugs in the reset's functions
-- ------------------------------------------------------------

-- cast_vote: the reset version added 0 points for a committed foul
-- but never incremented blue_fouls/red_fouls, so disqualification at
-- 3 fouls could never trigger. Recreated with foul handling.
CREATE OR REPLACE FUNCTION cast_vote(
  p_match_id UUID, p_judge_id UUID, p_player_side player_side, p_action_type action_type
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_threshold INT := 3;
  v_max_judges INT := 4;
  v_top_action action_type;
  v_top_votes INT;
  v_total_votes INT;
  v_match_status match_status;
  v_points INT;
  v_committed_points INT;
  v_gap INT;
  v_result JSONB;
BEGIN
  SELECT status INTO v_match_status FROM matches WHERE id = p_match_id;

  IF v_match_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found', 'code', 'MATCH_NOT_FOUND');
  END IF;
  IF v_match_status NOT IN ('live', 'takedown') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not active', 'current_status', v_match_status, 'code', 'MATCH_NOT_ACTIVE');
  END IF;

  DELETE FROM judge_votes
  WHERE match_id = p_match_id AND judge_id = p_judge_id
    AND player_side = p_player_side AND status = 'pending';

  INSERT INTO judge_votes (match_id, judge_id, player_side, action_type, status, created_at)
  VALUES (p_match_id, p_judge_id, p_player_side, p_action_type, 'pending', NOW());

  SELECT action_type, COUNT(*)::INT INTO v_top_action, v_top_votes
  FROM judge_votes
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending'
  GROUP BY action_type ORDER BY COUNT(*) DESC, action_type LIMIT 1;

  SELECT COUNT(*)::INT INTO v_total_votes
  FROM judge_votes
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';

  v_points := CASE p_action_type WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;
  v_committed_points := CASE v_top_action WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;

  IF v_top_votes >= v_threshold THEN
    INSERT INTO score_events (match_id, player_side, action_type, points, match_time_seconds, scored_by, created_at)
    VALUES (p_match_id, p_player_side, v_top_action, v_committed_points,
      COALESCE((SELECT timer_seconds FROM matches WHERE id = p_match_id), 0),
      'consensus_' || v_top_votes || '_of_' || v_max_judges, NOW());

    IF v_top_action = 'foul' THEN
      IF p_player_side = 'blue' THEN
        UPDATE matches SET blue_fouls = blue_fouls + 1, updated_at = NOW() WHERE id = p_match_id;
      ELSE
        UPDATE matches SET red_fouls = red_fouls + 1, updated_at = NOW() WHERE id = p_match_id;
      END IF;
    ELSE
      IF p_player_side = 'blue' THEN
        UPDATE matches SET blue_score = blue_score + v_committed_points, updated_at = NOW() WHERE id = p_match_id;
      ELSE
        UPDATE matches SET red_score = red_score + v_committed_points, updated_at = NOW() WHERE id = p_match_id;
      END IF;
    END IF;

    UPDATE judge_votes SET status = 'committed'
    WHERE match_id = p_match_id AND player_side = p_player_side
      AND action_type = v_top_action AND status = 'pending';
    DELETE FROM judge_votes
    WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';

    SELECT ABS(blue_score - red_score) INTO v_gap FROM matches WHERE id = p_match_id;
    IF v_gap >= 8 THEN
      UPDATE matches SET tko_available = true WHERE id = p_match_id;
    END IF;

    v_result := jsonb_build_object(
      'success', true, 'committed', true, 'action', v_top_action,
      'action_display', CASE v_top_action WHEN 'point_1' THEN '1 Point' WHEN 'point_2' THEN '2 Points' WHEN 'point_3' THEN '3 Points' WHEN 'foul' THEN 'Foul' END,
      'points', v_committed_points, 'top_votes', v_top_votes, 'total_votes', v_total_votes,
      'threshold', v_threshold, 'player_side', p_player_side,
      'tko_available', (v_gap >= 8),
      'message', 'Score committed! ' || v_committed_points || ' points to ' || p_player_side);
  ELSE
    v_result := jsonb_build_object(
      'success', true, 'committed', false, 'action', p_action_type,
      'action_display', CASE p_action_type WHEN 'point_1' THEN '1 Point' WHEN 'point_2' THEN '2 Points' WHEN 'point_3' THEN '3 Points' WHEN 'foul' THEN 'Foul' END,
      'points', v_points, 'top_votes', COALESCE(v_top_votes, 0), 'total_votes', COALESCE(v_total_votes, 0),
      'threshold', v_threshold, 'player_side', p_player_side,
      'message', 'Need ' || (v_threshold - COALESCE(v_top_votes, 0)) || ' more vote(s)');
  END IF;

  RETURN v_result;
END;
$$;

-- start_takedown: also anchor timer_paused_at, which the controller
-- and scoreboard use for the 30s takedown countdown. Without it the
-- countdown reads 00:00 and auto-ends instantly.
CREATE OR REPLACE FUNCTION start_takedown(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status NOT IN ('live', 'paused', 'break') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot start takedown from status: ' || v_match.status);
  END IF;

  UPDATE matches
  SET status = 'takedown', timer_before_takedown = timer_seconds,
      timer_started_at = NULL, timer_paused_at = NOW(),
      takedown_started_at = NOW(), takedown_timer_seconds = 30, updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', 'takedown', 'saved_timer', v_match.timer_seconds,
    'message', 'Takedown started. Timer paused at ' || v_match.timer_seconds || 's');
END;
$$;

CREATE OR REPLACE FUNCTION end_takedown(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD; v_saved INT;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status != 'takedown' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in takedown');
  END IF;

  v_saved := COALESCE(v_match.timer_before_takedown, v_match.timer_seconds);

  UPDATE matches
  SET status = 'live', timer_seconds = v_saved, timer_before_takedown = NULL,
      timer_started_at = NOW(), timer_paused_at = NULL,
      takedown_started_at = NULL, takedown_timer_seconds = NULL, updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', 'live', 'restored_timer', v_saved,
    'message', 'Takedown ended. Timer resumed at ' || v_saved || 's');
END;
$$;

-- end_match: the reset version crashed on the missing ended_at column
-- and used matches.tournament_id directly, which is NULL for matches
-- created by the draw generator, silently breaking auto-advance.
CREATE OR REPLACE FUNCTION end_match(
  p_match_id UUID, p_winner_side player_side, p_win_method win_method DEFAULT 'points'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match RECORD; v_winner_id UUID; v_court INT;
  v_tournament UUID; v_next_scheduled RECORD; v_result JSONB;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status IN ('completed', 'scheduled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already ended or not started');
  END IF;

  v_court := v_match.court_number;
  v_tournament := COALESCE(v_match.tournament_id,
    (SELECT tournament_id FROM events WHERE id = v_match.event_id));

  IF p_winner_side = 'blue' THEN v_winner_id := v_match.blue_athlete_id;
  ELSIF p_winner_side = 'red' THEN v_winner_id := v_match.red_athlete_id;
  ELSE v_winner_id := NULL;
  END IF;

  UPDATE matches
  SET status = 'completed', winner_id = v_winner_id, win_method = p_win_method,
      ended_at = NOW(), timer_seconds = 0,
      round_scores = COALESCE(round_scores, '{}') || jsonb_build_object(
        'final', jsonb_build_object('blue', blue_score, 'red', red_score)),
      updated_at = NOW()
  WHERE id = p_match_id;

  IF v_match.next_match_id IS NOT NULL AND v_winner_id IS NOT NULL THEN
    IF v_match.next_match_position = 'blue' THEN
      UPDATE matches SET blue_athlete_id = v_winner_id, updated_at = NOW() WHERE id = v_match.next_match_id;
    ELSIF v_match.next_match_position = 'red' THEN
      UPDATE matches SET red_athlete_id = v_winner_id, updated_at = NOW() WHERE id = v_match.next_match_id;
    END IF;
  END IF;

  SELECT * INTO v_next_scheduled
  FROM matches
  WHERE COALESCE(tournament_id, (SELECT tournament_id FROM events e WHERE e.id = matches.event_id)) = v_tournament
    AND status = 'scheduled' AND court_number IS NULL AND event_id = v_match.event_id
  ORDER BY match_number ASC, created_at ASC LIMIT 1;

  IF v_next_scheduled IS NOT NULL THEN
    UPDATE matches SET court_number = v_court, status = 'assigned', updated_at = NOW()
    WHERE id = v_next_scheduled.id;
    v_result := jsonb_build_object('success', true, 'match_id', p_match_id, 'winner_id', v_winner_id,
      'win_method', p_win_method, 'auto_advanced', true, 'next_match_id', v_next_scheduled.id,
      'next_match_number', v_next_scheduled.match_number, 'court', v_court,
      'message', 'Match ended. Next match auto-loaded to Court ' || v_court);
  ELSE
    v_result := jsonb_build_object('success', true, 'match_id', p_match_id, 'winner_id', v_winner_id,
      'win_method', p_win_method, 'auto_advanced', false,
      'message', 'Match ended. No more matches for this event.');
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION cast_vote(UUID, UUID, player_side, action_type) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION clear_votes(UUID, player_side) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION manual_commit_score(UUID, player_side, action_type, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION append_match_audit(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION start_takedown(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION end_takedown(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION end_round(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION start_next_round(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION skip_break(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION end_match(UUID, player_side, win_method) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION assign_match_to_court(UUID, INT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- E. RLS the app needs beyond the reset's policies
-- ------------------------------------------------------------
-- Admin writes: tournament/event creation, athlete registration,
-- draw generation (INSERT/DELETE matches), user management.
DROP POLICY IF EXISTS admin_all_tournaments ON tournaments;
CREATE POLICY admin_all_tournaments ON tournaments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_all_events ON events;
CREATE POLICY admin_all_events ON events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_all_athletes ON athletes;
CREATE POLICY admin_all_athletes ON athletes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_all_matches ON matches;
CREATE POLICY admin_all_matches ON matches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_all_judge_votes ON judge_votes;
CREATE POLICY admin_all_judge_votes ON judge_votes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS admin_all_score_events ON score_events;
CREATE POLICY admin_all_score_events ON score_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Controller 'Undo Last' deletes the latest score event on its court.
DROP POLICY IF EXISTS controller_delete_score_events ON score_events;
CREATE POLICY controller_delete_score_events ON score_events FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users u
    JOIN matches m ON m.id = score_events.match_id
    WHERE u.id = auth.uid() AND u.role = 'controller' AND u.court_access = m.court_number));

-- ------------------------------------------------------------
-- F. Realtime for tables the UI subscribes to
-- ------------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE athletes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
