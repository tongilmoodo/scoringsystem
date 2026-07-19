-- ============================================================
-- 029_system_audit_locks.sql
-- Add FOR UPDATE row-level locking, idempotency checks, and
-- start_takedown RPC to prevent race conditions.
-- ============================================================

-- ------------------------------------------------------------
-- 1. start_takedown
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS start_takedown(UUID, INT);
DROP FUNCTION IF EXISTS start_takedown(UUID);

CREATE OR REPLACE FUNCTION start_takedown(p_match_id UUID, p_takedown_seconds INT DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD;
BEGIN
  -- Lock the match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match.status = 'takedown' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already in takedown');
  END IF;

  IF v_match.status NOT IN ('live', 'paused') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match cannot enter takedown from ' || v_match.status);
  END IF;

  UPDATE matches
  SET status = 'takedown',
      timer_started_at = NULL,
      timer_paused_at = NOW(),
      timer_before_takedown = COALESCE(v_match.timer_seconds, 0),
      takedown_timer_seconds = p_takedown_seconds,
      updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', 'takedown', 'was_status', v_match.status);
END;
$$;
GRANT EXECUTE ON FUNCTION start_takedown(UUID, INT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------
-- 2. end_match idempotency
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
  -- Lock the match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Match already completed', 'winner_id', v_match.winner_id);
  END IF;

  IF p_winner_side = 'blue' THEN
    v_winner_id := v_match.blue_athlete_id;
  ELSIF p_winner_side = 'red' THEN
    v_winner_id := v_match.red_athlete_id;
  END IF;

  v_court_number := v_match.court_number;
  v_tournament_id := v_match.tournament_id;

  UPDATE matches
  SET status = 'completed',
      winner_id = v_winner_id,
      win_method = p_win_method,
      ended_at = NOW(),
      updated_at = NOW()
  WHERE id = p_match_id;

  v_result := jsonb_build_object('success', true, 'status', 'completed', 'winner_id', v_winner_id, 'win_method', p_win_method);

  -- Determine next match
  IF v_match.next_match_id IS NOT NULL THEN
    IF v_match.is_next_match_blue THEN
      UPDATE matches SET blue_athlete_id = v_winner_id WHERE id = v_match.next_match_id;
    ELSE
      UPDATE matches SET red_athlete_id = v_winner_id WHERE id = v_match.next_match_id;
    END IF;
  END IF;

  IF v_tournament_id IS NOT NULL THEN
    SELECT * INTO v_next_scheduled
    FROM matches
    WHERE tournament_id = v_tournament_id
      AND court_number = v_court_number
      AND status = 'scheduled'
      AND blue_athlete_id IS NOT NULL
      AND red_athlete_id IS NOT NULL
    ORDER BY match_number ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE matches SET status = 'assigned', updated_at = NOW() WHERE id = v_next_scheduled.id;
      v_result := v_result || jsonb_build_object('next_assigned', v_next_scheduled.id);
    END IF;
  END IF;

  RETURN v_result;
END;
$$;


-- ------------------------------------------------------------
-- 3. start_next_round idempotency
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_next_round(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD; v_next_round INT;
BEGIN
  -- Lock the match row
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  
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


-- ------------------------------------------------------------
-- 4. cast_vote locking & TKO lockout
-- ------------------------------------------------------------
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
  v_points INT;
  v_committed_points INT;
  v_result JSONB;
  v_match_row RECORD;
BEGIN
  -- Lock the match row to prevent concurrent vote commits
  SELECT * INTO v_match_row FROM matches WHERE id = p_match_id FOR UPDATE;

  IF v_match_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found', 'code', 'MATCH_NOT_FOUND');
  END IF;

  IF v_match_row.status NOT IN ('live', 'takedown') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not active', 'current_status', v_match_row.status, 'code', 'MATCH_NOT_ACTIVE');
  END IF;

  -- Lock out voting if TKO is available and it's not a foul (let fouls be resolved)
  IF v_match_row.tko_available AND p_action_type != 'foul' THEN
    RETURN jsonb_build_object('success', false, 'error', 'TKO gap reached. Awaiting controller decision.');
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
      COALESCE(v_match_row.timer_seconds, 0),
      'consensus_' || v_top_votes || '_of_' || v_max_judges, NOW()
    );

    IF v_top_action = 'foul' THEN
      IF p_player_side = 'blue' THEN
        UPDATE matches SET 
          blue_fouls = blue_fouls + 1, 
          blue_score = CASE WHEN (blue_fouls + 1) % 3 = 0 THEN blue_score - 1 ELSE blue_score END,
          updated_at = NOW() 
        WHERE id = p_match_id
        RETURNING * INTO v_match_row;
      ELSE
        UPDATE matches SET 
          red_fouls = red_fouls + 1, 
          red_score = CASE WHEN (red_fouls + 1) % 3 = 0 THEN red_score - 1 ELSE red_score END,
          updated_at = NOW() 
        WHERE id = p_match_id
        RETURNING * INTO v_match_row;
      END IF;
    ELSE
      IF p_player_side = 'blue' THEN
        UPDATE matches SET blue_score = blue_score + v_committed_points, updated_at = NOW() WHERE id = p_match_id
        RETURNING * INTO v_match_row;
      ELSE
        UPDATE matches SET red_score = red_score + v_committed_points, updated_at = NOW() WHERE id = p_match_id
        RETURNING * INTO v_match_row;
      END IF;
    END IF;
    
    -- TKO available check
    IF v_top_action != 'foul' AND ABS(v_match_row.blue_score - v_match_row.red_score) >= 8 THEN
      UPDATE matches SET tko_available = true WHERE id = p_match_id;
      v_match_row.tko_available := true;
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
      'message', 'Consensus reached!'
    );

    -- Golden Point check
    IF v_match_row.current_round > COALESCE(v_match_row.total_rounds, 1) + 1 THEN
      IF v_committed_points > 0 THEN
        PERFORM end_match(p_match_id, p_player_side, 'points');
      END IF;
    END IF;

  ELSE
    v_result := jsonb_build_object(
      'success', true, 'committed', false,
      'top_action', v_top_action, 'top_action_display', CASE v_top_action WHEN 'point_1' THEN '1 Point' WHEN 'point_2' THEN '2 Points' WHEN 'point_3' THEN '3 Points' WHEN 'foul' THEN 'Foul' END,
      'top_votes', COALESCE(v_top_votes, 0), 'total_votes', COALESCE(v_total_votes, 0),
      'threshold', v_threshold, 'player_side', p_player_side,
      'message', 'Need ' || (v_threshold - COALESCE(v_top_votes, 0)) || ' more vote(s)'
    );
  END IF;

  RETURN v_result;
END;
$$;


-- ------------------------------------------------------------
-- 5. manual_commit_score locking
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION manual_commit_score(
  p_match_id UUID, p_player_side player_side, p_action_type action_type, p_controller_name TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_points INT;
  v_match_row RECORD;
BEGIN
  -- Lock the match row
  SELECT * INTO v_match_row FROM matches WHERE id = p_match_id FOR UPDATE;
  
  IF v_match_row.status NOT IN ('live', 'takedown', 'paused') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not active');
  END IF;

  v_points := CASE p_action_type WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;

  INSERT INTO score_events (match_id, player_side, action_type, points, match_time_seconds, scored_by)
  VALUES (p_match_id, p_player_side, p_action_type, v_points,
          COALESCE(v_match_row.timer_seconds, 0),
          p_controller_name || '_manual');

  IF p_action_type = 'foul' THEN
    IF p_player_side = 'blue' THEN
      UPDATE matches SET 
        blue_fouls = blue_fouls + 1, 
        blue_score = CASE WHEN (blue_fouls + 1) % 3 = 0 THEN blue_score - 1 ELSE blue_score END,
        updated_at = NOW() 
      WHERE id = p_match_id
      RETURNING * INTO v_match_row;
    ELSE
      UPDATE matches SET 
        red_fouls = red_fouls + 1, 
        red_score = CASE WHEN (red_fouls + 1) % 3 = 0 THEN red_score - 1 ELSE red_score END,
        updated_at = NOW() 
      WHERE id = p_match_id
      RETURNING * INTO v_match_row;
    END IF;
  ELSE
    IF p_player_side = 'blue' THEN
      UPDATE matches SET blue_score = blue_score + v_points, updated_at = NOW() WHERE id = p_match_id
      RETURNING * INTO v_match_row;
    ELSE
      UPDATE matches SET red_score = red_score + v_points, updated_at = NOW() WHERE id = p_match_id
      RETURNING * INTO v_match_row;
    END IF;
    IF ABS(v_match_row.blue_score - v_match_row.red_score) >= 8 THEN
      UPDATE matches SET tko_available = true WHERE id = p_match_id;
    END IF;
  END IF;

  DELETE FROM judge_votes
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';

  -- Golden Point check
  IF v_match_row.current_round > COALESCE(v_match_row.total_rounds, 1) + 1 THEN
    IF v_points > 0 THEN
      PERFORM end_match(p_match_id, p_player_side, 'points');
    END IF;
  END IF;

  RETURN jsonb_build_object('committed', true, 'action', p_action_type, 'side', p_player_side);
END;
$$;
