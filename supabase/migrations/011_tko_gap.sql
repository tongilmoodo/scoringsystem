-- ============================================================
-- 011_tko_gap.sql
-- Adds TKO support:
--  1. Adds 'tko' to the win_method enum
--  2. Adds tko_available column to matches
--  3. Replaces cast_vote() with a version that sets
--     tko_available = true when blue/red gap >= 8 points
--
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Add 'tko' to win_method enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'win_method' AND e.enumlabel = 'tko'
  ) THEN
    ALTER TYPE win_method ADD VALUE 'tko';
  END IF;
END $$;

-- 2. Add tko_available column to matches (idempotent)
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS tko_available BOOLEAN NOT NULL DEFAULT false;

-- 3. Replace cast_vote() with TKO gap detection
--    (drops and recreates to pick up the new logic)
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
  v_blue_score INT;
  v_red_score INT;
  v_gap INT;
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

    -- ---- TKO GAP CHECK ----
    -- Read the freshly updated scores.
    SELECT blue_score, red_score
    INTO v_blue_score, v_red_score
    FROM matches WHERE id = p_match_id;

    v_gap := ABS(v_blue_score - v_red_score);

    IF v_gap >= 8 THEN
      UPDATE matches SET tko_available = true WHERE id = p_match_id;
    END IF;
    -- ---- END TKO GAP CHECK ----

    v_result := jsonb_build_object(
      'success', true, 'committed', true, 'action', v_top_action,
      'action_display', CASE v_top_action WHEN 'point_1' THEN '1 Point' WHEN 'point_2' THEN '2 Points' WHEN 'point_3' THEN '3 Points' WHEN 'foul' THEN 'Foul' END,
      'points', v_committed_points,
      'top_votes', COALESCE(v_top_votes, 0), 'total_votes', COALESCE(v_total_votes, 0),
      'threshold', v_threshold, 'player_side', p_player_side,
      'tko_available', (v_gap >= 8),
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
