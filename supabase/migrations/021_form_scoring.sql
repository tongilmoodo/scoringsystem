-- ============================================================
-- 021_form_scoring.sql
-- Run AFTER 020_fix_event_timing.sql.
--
-- Adds table and RPCs for Form / Special Techniques scoring.
-- In Form events, judges submit a single final score (0.0 to 10.0, 
-- scaled x10 as an INT, e.g., 9.7 = 97).
-- The controller reviews the 4 submitted scores and commits the average.
-- ============================================================

CREATE TABLE IF NOT EXISTS form_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(match_id, judge_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'form_scores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE form_scores;
  END IF;
END $$;

-- RPC for judges to submit their final form score
CREATE OR REPLACE FUNCTION submit_form_score(
  p_match_id UUID, p_judge_id UUID, p_score INT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Insert or update the judge's score for this match
  INSERT INTO form_scores (match_id, judge_id, score)
  VALUES (p_match_id, p_judge_id, p_score)
  ON CONFLICT (match_id, judge_id) 
  DO UPDATE SET score = EXCLUDED.score, created_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC for the controller to commit the final average score and end the match
CREATE OR REPLACE FUNCTION commit_form_average(
  p_match_id UUID, p_controller_name TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg_score INT;
  v_count INT;
BEGIN
  -- Calculate average of submitted scores
  SELECT ROUND(AVG(score)), COUNT(*)
  INTO v_avg_score, v_count
  FROM form_scores
  WHERE match_id = p_match_id;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'No judge scores submitted');
  END IF;

  -- Update match: store the average in blue_score, mark completed
  UPDATE matches 
  SET blue_score = v_avg_score,
      status = 'completed',
      ended_at = now(),
      updated_at = now()
  WHERE id = p_match_id;

  -- Add an audit log entry in score_events (optional, but good for tracking)
  INSERT INTO score_events (match_id, player_side, action_type, points, match_time_seconds, scored_by)
  VALUES (p_match_id, 'blue', 'point_1', v_avg_score, 0, p_controller_name || '_form_average');

  RETURN jsonb_build_object('success', true, 'average_score', v_avg_score, 'judges_counted', v_count);
END;
$$;
