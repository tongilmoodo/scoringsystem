-- ============================================================
-- 016_reset_match.sql
-- Complete, atomic match reset. Run AFTER 014_post_reset_hotfix.sql.
--
-- The old frontend-only reset cleared scores/fouls/status/timer but
-- left behind: current_round, round_scores, tko_available, takedown
-- state (timer_before_takedown, takedown_started_at,
-- takedown_timer_seconds), break state, ended_at, and all pending
-- judge votes. This RPC resets everything.
-- ============================================================

CREATE OR REPLACE FUNCTION reset_match(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF v_match IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  DELETE FROM score_events WHERE match_id = p_match_id;
  DELETE FROM judge_votes  WHERE match_id = p_match_id;

  UPDATE matches
  SET blue_score = 0,
      red_score = 0,
      blue_fouls = 0,
      red_fouls = 0,
      status = 'scheduled',
      winner_id = NULL,
      win_method = NULL,
      current_round = 1,
      round_scores = '{}'::jsonb,
      tko_available = false,
      timer_seconds = max_time,
      timer_started_at = NULL,
      timer_paused_at = NULL,
      timer_before_takedown = NULL,
      takedown_started_at = NULL,
      takedown_timer_seconds = NULL,
      break_started_at = NULL,
      break_timer_seconds = 30,
      ended_at = NULL,
      updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'timer_seconds', v_match.max_time,
    'message', 'Match fully reset. Timer back to ' || v_match.max_time || 's, round 1.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reset_match(UUID) TO anon, authenticated, service_role;
