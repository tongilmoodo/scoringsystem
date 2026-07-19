-- ============================================================
-- 027_fix_end_round.sql
-- Allow end_round to be called when match is paused.
-- ============================================================

CREATE OR REPLACE FUNCTION end_round(p_match_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status NOT IN ('live', 'takedown', 'paused') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not live or paused', 'status', v_match.status);
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
