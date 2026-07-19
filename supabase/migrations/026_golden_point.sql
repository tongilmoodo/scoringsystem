-- ============================================================
-- 026_golden_point.sql
-- Automatically end the match when a point is scored in Golden Round
-- ============================================================

CREATE OR REPLACE FUNCTION manual_commit_score(
  p_match_id UUID, p_player_side player_side, p_action_type action_type, p_controller_name TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_points INT;
  v_match_row RECORD;
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

  -- Golden Point check
  SELECT * INTO v_match_row FROM matches WHERE id = p_match_id;
  IF v_match_row.current_round > COALESCE(v_match_row.total_rounds, 1) + 1 THEN
    IF v_points > 0 THEN
      PERFORM end_match(p_match_id, p_player_side, 'points');
    END IF;
  END IF;

  RETURN jsonb_build_object('committed', true, 'action', p_action_type, 'side', p_player_side);
END;
$$;


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
  v_result JSONB;
  v_match_row RECORD;
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

    v_result := jsonb_build_object(
      'success', true, 'committed', true, 'action', v_top_action,
      'action_display', CASE v_top_action WHEN 'point_1' THEN '1 Point' WHEN 'point_2' THEN '2 Points' WHEN 'point_3' THEN '3 Points' WHEN 'foul' THEN 'Foul' END,
      'points', v_committed_points,
      'message', 'Consensus reached!'
    );

    -- Golden Point check
    SELECT * INTO v_match_row FROM matches WHERE id = p_match_id;
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
