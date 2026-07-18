-- ============================================================
-- 022_form_auto_advance.sql
-- Upgrades commit_form_average to auto-advance the next Form
-- match in the same event when the current one is completed.
-- ============================================================

CREATE OR REPLACE FUNCTION commit_form_average(
  p_match_id UUID, p_controller_name TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg_score INT;
  v_count INT;
  v_event_id UUID;
  v_court_number INT;
  v_next_match_id UUID;
BEGIN
  -- Calculate average of submitted scores
  SELECT ROUND(AVG(score)), COUNT(*)
  INTO v_avg_score, v_count
  FROM form_scores
  WHERE match_id = p_match_id;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'No judge scores submitted');
  END IF;

  -- Get event_id and court_number for auto-advance
  SELECT event_id, court_number
  INTO v_event_id, v_court_number
  FROM matches
  WHERE id = p_match_id;

  -- Update match: store the average in blue_score, mark completed
  UPDATE matches 
  SET blue_score = v_avg_score,
      status = 'completed',
      ended_at = now(),
      updated_at = now()
  WHERE id = p_match_id;

  -- Add an audit log entry in score_events
  INSERT INTO score_events (match_id, player_side, action_type, points, match_time_seconds, scored_by)
  VALUES (p_match_id, 'blue', 'point_1', v_avg_score, 0, p_controller_name || '_form_average');

  -- Auto-advance: find the next scheduled match in the same event and same court
  -- (pick the one with the lowest match_number that's still scheduled)
  SELECT id INTO v_next_match_id
  FROM matches
  WHERE event_id = v_event_id
    AND status = 'scheduled'
    AND id != p_match_id
  ORDER BY match_number ASC
  LIMIT 1;

  IF v_next_match_id IS NOT NULL THEN
    UPDATE matches
    SET status = 'assigned',
        court_number = v_court_number,
        updated_at = now()
    WHERE id = v_next_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'average_score', v_avg_score,
    'judges_counted', v_count,
    'next_match_id', v_next_match_id
  );
END;
$$;
