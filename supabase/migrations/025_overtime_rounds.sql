-- ============================================================
-- 025_overtime_rounds.sql
-- Allow overtime rounds (Round 3) and Golden Point (Round 4)
-- when scores are tied at the end of the match.
-- ============================================================

CREATE OR REPLACE FUNCTION start_next_round(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD; v_next_round INT; v_timer INT;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status != 'break' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in break', 'status', v_match.status);
  END IF;

  v_next_round := v_match.current_round + 1;
  v_timer := v_match.max_time;

  -- If we've finished the standard rounds, check for a tie.
  IF v_next_round > COALESCE(v_match.total_rounds, 1) THEN
    IF v_match.blue_score != v_match.red_score THEN
      RETURN jsonb_build_object('success', false, 'error', 'All rounds complete and scores are not tied. Use End Match.');
    END IF;
    -- It's a tie! Overtime/Golden rounds are exactly 1 minute (60s)
    v_timer := 60;
  END IF;

  UPDATE matches
  SET status = 'live', current_round = v_next_round, timer_seconds = v_timer,
      timer_started_at = NOW(), timer_paused_at = NULL,
      break_timer_seconds = NULL, break_started_at = NULL, updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', 'live', 'current_round', v_next_round,
    'total_rounds', v_match.total_rounds, 'message', 'Round ' || v_next_round || ' started (Overtime)!');
END;
$$;

CREATE OR REPLACE FUNCTION skip_break(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status != 'break' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in break');
  END IF;
  
  -- Use start_next_round directly to benefit from tie-validation
  RETURN start_next_round(p_match_id);
END;
$$;
