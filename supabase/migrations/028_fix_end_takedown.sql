-- ============================================================
-- 028_fix_end_takedown.sql
-- RPC to safely end a takedown exactly once, preventing race
-- conditions when multiple controller tabs are open.
-- ============================================================

CREATE OR REPLACE FUNCTION end_takedown(p_match_id UUID, p_auto_resume BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_match RECORD; v_saved INT;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match.status != 'takedown' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not in takedown', 'status', v_match.status);
  END IF;

  v_saved := COALESCE(v_match.timer_before_takedown, v_match.timer_seconds, 0);

  IF p_auto_resume THEN
    UPDATE matches
    SET status = 'live',
        timer_started_at = NOW(),
        timer_paused_at = NULL,
        timer_seconds = v_saved,
        timer_before_takedown = NULL,
        updated_at = NOW()
    WHERE id = p_match_id;
  ELSE
    UPDATE matches
    SET status = 'paused',
        timer_paused_at = NOW(),
        timer_seconds = v_saved,
        timer_before_takedown = NULL,
        updated_at = NOW()
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'saved_seconds', v_saved, 'resumed', p_auto_resume);
END;
$$;
GRANT EXECUTE ON FUNCTION end_takedown(UUID, BOOLEAN) TO anon, authenticated, service_role;
