-- ============================================================
-- 010_rounds_breaks_autoadvance.sql
-- Multi-round matches, 30s breaks, match auto-advance, and a
-- consensus cast_vote() that returns a clean JSON result.
--
-- Run this in the Supabase SQL editor (idempotent where possible).
-- ============================================================

-- ------------------------------------------------------------
-- A. Columns
-- ------------------------------------------------------------
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_rounds INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS break_timer_seconds INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS break_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS round_scores JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  -- Additive + nullable. The app resolves a match's tournament via
  -- events(event_id).tournament_id; only end_match() uses this column
  -- directly (for the auto-advance lookup). Do NOT refactor other queries
  -- onto it.
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES tournaments(id);

-- 'break' already exists in the enum; guard just in case.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'match_status' AND e.enumlabel = 'break'
  ) THEN
    ALTER TYPE match_status ADD VALUE 'break';
  END IF;
END $$;

-- Backfill tournament_id from the owning event.
UPDATE matches m
SET tournament_id = e.tournament_id
FROM events e
WHERE e.id = m.event_id
  AND m.tournament_id IS NULL;

-- ------------------------------------------------------------
-- B. Drop the triggers that would now double-apply
--    cast_vote() writes the score_event AND updates blue/red_score;
--    end_match() advances the bracket winner. Keeping the old triggers
--    (update_match_score / advance_winner) would double-count and
--    double-advance.
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_update_match_score ON score_events;
DROP FUNCTION IF EXISTS update_match_score() CASCADE;
DROP TRIGGER IF EXISTS trigger_advance_winner ON matches;
DROP FUNCTION IF EXISTS advance_winner() CASCADE;

-- ------------------------------------------------------------
-- C. cast_vote() — consensus + clean JSON result
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cast_vote(
  p_match_id UUID,
  p_judge_id UUID,
  p_player_side player_side,
  p_action_type action_type
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_threshold INT := 3;
  v_max_judges INT := 4;
  v_top_action action_type;
  v_top_votes INT;
  v_total_votes INT;
  v_match_status match_status;
  v_points INT;
  v_committed_points INT;
  v_result JSONB;
BEGIN
  SELECT status INTO v_match_status FROM matches WHERE id = p_match_id;

  IF v_match_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found', 'code', 'MATCH_NOT_FOUND');
  END IF;

  IF v_match_status NOT IN ('live', 'takedown') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not active', 'current_status', v_match_status, 'code', 'MATCH_NOT_ACTIVE');
  END IF;

  -- Replace this judge's pending vote for this side.
  DELETE FROM judge_votes
  WHERE match_id = p_match_id AND judge_id = p_judge_id
    AND player_side = p_player_side AND status = 'pending';

  INSERT INTO judge_votes (match_id, judge_id, player_side, action_type, status, created_at)
  VALUES (p_match_id, p_judge_id, p_player_side, p_action_type, 'pending', NOW());

  SELECT action_type, COUNT(*)::INT
  INTO v_top_action, v_top_votes
  FROM judge_votes
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending'
  GROUP BY action_type
  ORDER BY COUNT(*) DESC, action_type
  LIMIT 1;

  SELECT COUNT(*)::INT INTO v_total_votes
  FROM judge_votes
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';

  v_points := CASE p_action_type
    WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;
  v_committed_points := CASE v_top_action
    WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;

  IF v_top_votes >= v_threshold THEN
    INSERT INTO score_events (match_id, player_side, action_type, points, match_time_seconds, scored_by, created_at)
    VALUES (
      p_match_id, p_player_side, v_top_action, v_committed_points,
      COALESCE((SELECT timer_seconds FROM matches WHERE id = p_match_id), 0),
      'consensus_' || v_top_votes || '_of_' || v_max_judges, NOW()
    );

    IF p_player_side = 'blue' THEN
      UPDATE matches SET blue_score = blue_score + v_committed_points, updated_at = NOW() WHERE id = p_match_id;
    ELSE
      UPDATE matches SET red_score = red_score + v_committed_points, updated_at = NOW() WHERE id = p_match_id;
    END IF;

    UPDATE judge_votes SET status = 'committed'
    WHERE match_id = p_match_id AND player_side = p_player_side
      AND action_type = v_top_action AND status = 'pending';

    DELETE FROM judge_votes
    WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';

    v_result := jsonb_build_object(
      'success', true, 'committed', true, 'action', v_top_action,
      'action_display', CASE v_top_action WHEN 'point_1' THEN '1 Point' WHEN 'point_2' THEN '2 Points' WHEN 'point_3' THEN '3 Points' WHEN 'foul' THEN 'Foul' END,
      'points', v_committed_points,
      'top_votes', COALESCE(v_top_votes, 0), 'total_votes', COALESCE(v_total_votes, 0),
      'threshold', v_threshold, 'player_side', p_player_side,
      'message', 'Score committed! ' || v_committed_points || ' points to ' || p_player_side
    );
  ELSE
    v_result := jsonb_build_object(
      'success', true, 'committed', false, 'action', p_action_type,
      'action_display', CASE p_action_type WHEN 'point_1' THEN '1 Point' WHEN 'point_2' THEN '2 Points' WHEN 'point_3' THEN '3 Points' WHEN 'foul' THEN 'Foul' END,
      'points', v_points,
      'top_votes', COALESCE(v_top_votes, 0), 'total_votes', COALESCE(v_total_votes, 0),
      'threshold', v_threshold, 'player_side', p_player_side,
      'message', 'Need ' || (v_threshold - COALESCE(v_top_votes, 0)) || ' more vote(s)'
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION cast_vote(UUID, UUID, player_side, action_type) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- D. end_round — save round scores, enter 30s break
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION end_round(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status NOT IN ('live', 'takedown') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not live', 'status', v_match.status);
  END IF;

  UPDATE matches
  SET round_scores = COALESCE(round_scores, '{}') || jsonb_build_object(
        v_match.current_round::TEXT,
        jsonb_build_object('blue', v_match.blue_score, 'red', v_match.red_score)),
      status = 'break', break_timer_seconds = 30, break_started_at = NOW(),
      timer_seconds = 0, updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', 'break', 'break_seconds', 30,
    'current_round', v_match.current_round,
    'message', 'Round ' || v_match.current_round || ' ended. 30-second break started.');
END;
$$;
GRANT EXECUTE ON FUNCTION end_round(UUID) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- E. start_next_round — leave break, begin next round
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_next_round(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD; v_next_round INT;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status != 'break' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in break', 'status', v_match.status);
  END IF;

  v_next_round := v_match.current_round + 1;
  IF v_next_round > COALESCE(v_match.total_rounds, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'All rounds complete. Use End Match.');
  END IF;

  UPDATE matches
  SET status = 'live', current_round = v_next_round, timer_seconds = max_time,
      timer_started_at = NOW(), timer_paused_at = NULL,
      break_timer_seconds = NULL, break_started_at = NULL, updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', 'live', 'current_round', v_next_round,
    'total_rounds', v_match.total_rounds, 'message', 'Round ' || v_next_round || ' started!');
END;
$$;
GRANT EXECUTE ON FUNCTION start_next_round(UUID) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- F. skip_break
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION skip_break(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status != 'break' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in break');
  END IF;
  IF v_match.current_round < COALESCE(v_match.total_rounds, 1) THEN
    RETURN start_next_round(p_match_id);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Use End Match instead');
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION skip_break(UUID) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- G. end_match — complete, advance bracket, auto-load next
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION end_match(
  p_match_id UUID,
  p_winner_side player_side,
  p_win_method win_method DEFAULT 'points'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match RECORD; v_winner_id UUID; v_court_number INT;
  v_tournament_id UUID; v_next_scheduled RECORD; v_result JSONB;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status IN ('completed', 'scheduled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already ended or not started');
  END IF;

  v_court_number := v_match.court_number;
  v_tournament_id := COALESCE(v_match.tournament_id,
    (SELECT tournament_id FROM events WHERE id = v_match.event_id));

  IF p_winner_side = 'blue' THEN v_winner_id := v_match.blue_athlete_id;
  ELSIF p_winner_side = 'red' THEN v_winner_id := v_match.red_athlete_id;
  ELSE v_winner_id := NULL; END IF;

  UPDATE matches
  SET status = 'completed', winner_id = v_winner_id, win_method = p_win_method,
      ended_at = NOW(), timer_seconds = 0,
      round_scores = COALESCE(round_scores, '{}') || jsonb_build_object(
        'final', jsonb_build_object('blue', blue_score, 'red', red_score)),
      updated_at = NOW()
  WHERE id = p_match_id;

  -- Advance winner into the next bracket slot.
  IF v_match.next_match_id IS NOT NULL AND v_winner_id IS NOT NULL THEN
    IF v_match.next_match_position = 'blue' THEN
      UPDATE matches SET blue_athlete_id = v_winner_id, updated_at = NOW() WHERE id = v_match.next_match_id;
    ELSIF v_match.next_match_position = 'red' THEN
      UPDATE matches SET red_athlete_id = v_winner_id, updated_at = NOW() WHERE id = v_match.next_match_id;
    END IF;
  END IF;

  -- Auto-advance: next scheduled, unassigned match in the same event.
  SELECT * INTO v_next_scheduled
  FROM matches
  WHERE COALESCE(tournament_id, (SELECT tournament_id FROM events WHERE id = matches.event_id)) = v_tournament_id
    AND status = 'scheduled' AND court_number IS NULL AND event_id = v_match.event_id
  ORDER BY match_number ASC, created_at ASC
  LIMIT 1;

  IF v_next_scheduled IS NOT NULL THEN
    UPDATE matches SET court_number = v_court_number, status = 'assigned', updated_at = NOW()
    WHERE id = v_next_scheduled.id;
    v_result := jsonb_build_object('success', true, 'match_id', p_match_id, 'winner_id', v_winner_id,
      'win_method', p_win_method, 'auto_advanced', true, 'next_match_id', v_next_scheduled.id,
      'next_match_number', v_next_scheduled.match_number, 'court', v_court_number,
      'message', 'Match ended. Next match auto-loaded to Court ' || v_court_number);
  ELSE
    v_result := jsonb_build_object('success', true, 'match_id', p_match_id, 'winner_id', v_winner_id,
      'win_method', p_win_method, 'auto_advanced', false,
      'message', 'Match ended. No more matches for this event.');
  END IF;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION end_match(UUID, player_side, win_method) TO anon, authenticated, service_role;
