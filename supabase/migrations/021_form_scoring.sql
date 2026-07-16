-- ============================================================
-- 021_form_scoring.sql
-- Adds support for Form and Special Techniques scoring (deductions from 10.0)
-- ============================================================

-- 1. Add new action_types for form deductions
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'deduct_0_1';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'deduct_0_2';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'deduct_0_3';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'add_0_1';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'add_0_2';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'add_0_3';

-- 2. Add form_score field to judge_votes to store the decimal score * 10
-- We use an integer to avoid floating point issues (10.0 = 100, 9.7 = 97)
ALTER TABLE judge_votes ADD COLUMN IF NOT EXISTS form_score INT;

-- 3. Update manual_commit_score to handle these new action types safely
CREATE OR REPLACE FUNCTION manual_commit_score(
  p_match_id UUID, p_player_side player_side, p_action_type action_type, p_controller_name TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
  v_points INT;
BEGIN
  -- Convert form deduction action types to point changes
  -- (Currently, this RPC is for sparring, but if the controller needs to manually adjust 
  -- a form score, they can. However, form scores are primarily submitted by judges.)
  v_points := CASE 
    WHEN p_action_type = 'point_1' THEN 1 
    WHEN p_action_type = 'point_2' THEN 2 
    WHEN p_action_type = 'point_3' THEN 3 
    WHEN p_action_type = 'add_0_1' THEN 1
    WHEN p_action_type = 'add_0_2' THEN 2
    WHEN p_action_type = 'add_0_3' THEN 3
    WHEN p_action_type = 'deduct_0_1' THEN -1
    WHEN p_action_type = 'deduct_0_2' THEN -2
    WHEN p_action_type = 'deduct_0_3' THEN -3
    ELSE 0 
  END;

  INSERT INTO score_events (match_id, player_side, action_type, points, match_time_seconds, scored_by)
  VALUES (p_match_id, p_player_side, p_action_type, v_points,
          COALESCE((SELECT timer_seconds FROM matches WHERE id = p_match_id), 0),
          p_controller_name || '_manual');

  -- Update match scores based on action type
  IF p_action_type = 'foul' THEN
    IF p_player_side = 'blue' THEN
      UPDATE matches SET blue_fouls = blue_fouls + 1, updated_at = NOW() WHERE id = p_match_id;
    ELSE
      UPDATE matches SET red_fouls = red_fouls + 1, updated_at = NOW() WHERE id = p_match_id;
    END IF;
  ELSE
    IF p_player_side = 'blue' THEN
      UPDATE matches SET blue_score = blue_score + v_points, updated_at = NOW() WHERE id = p_match_id;
      
      -- TKO gap check for sparring matches
      PERFORM 1 FROM matches m 
      JOIN events e ON m.event_id = e.id 
      WHERE m.id = p_match_id AND e.category = 'sparring_kumite' AND (m.blue_score - m.red_score >= 8);
      IF FOUND THEN
        UPDATE matches SET tko_available = true WHERE id = p_match_id;
      END IF;
    ELSE
      UPDATE matches SET red_score = red_score + v_points, updated_at = NOW() WHERE id = p_match_id;
      
      -- TKO gap check for sparring matches
      PERFORM 1 FROM matches m 
      JOIN events e ON m.event_id = e.id 
      WHERE m.id = p_match_id AND e.category = 'sparring_kumite' AND (m.red_score - m.blue_score >= 8);
      IF FOUND THEN
        UPDATE matches SET tko_available = true WHERE id = p_match_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
