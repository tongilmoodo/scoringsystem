-- 1. Delete bad events
DELETE FROM events WHERE name LIKE 'Men 36-49 / Ladies%';

-- 2. Add new columns individually
ALTER TABLE events ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS belt_rank TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS rounds INT NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS round_duration_seconds INT NOT NULL DEFAULT 120;

-- 3. Add timer_before_takedown to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS timer_before_takedown INT;

-- ============================================
-- 3b. RPCs for Takedown
-- ============================================

CREATE OR REPLACE FUNCTION start_takedown(p_match_id UUID, p_current_timer INT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  
  IF v_match.status != 'live' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not live');
  END IF;

  UPDATE matches
  SET status = 'takedown',
      timer_before_takedown = COALESCE(p_current_timer, timer_seconds),
      takedown_timer_seconds = 30,
      timer_paused_at = NOW(),
      updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'takedown',
    'match_timer_paused_at', v_match.timer_seconds,
    'message', 'Takedown started. Match timer paused at ' || v_match.timer_seconds || 's.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION end_takedown(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  
  IF v_match.status != 'takedown' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in takedown');
  END IF;

  UPDATE matches
  SET status = 'live',
      timer_seconds = COALESCE(timer_before_takedown, timer_seconds),
      timer_before_takedown = NULL,
      takedown_timer_seconds = NULL,
      timer_paused_at = NULL,
      updated_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'live',
    'timer_restored_to', v_match.timer_before_takedown,
    'message', 'Takedown ended. Match timer resumed from ' || COALESCE(v_match.timer_before_takedown, v_match.timer_seconds) || 's.'
  );
END;
$$;

-- ============================================
-- 4. SEED CORRECTED EVENTS
-- ============================================
-- Replace timer_duration_seconds from the provided script with match_duration_seconds to match the schema

DO $$
DECLARE
  v_tid UUID;
BEGIN
  -- Find the first tournament or create a fallback one
  SELECT id INTO v_tid FROM tournaments ORDER BY created_at ASC LIMIT 1;
  IF v_tid IS NULL THEN
    v_tid := 'e0000001-0000-0000-0000-000000000001';
    INSERT INTO tournaments (id, slug, name, date) VALUES (v_tid, 'mombasa-open-2026', 'Mombasa Open 2026', CURRENT_DATE);
  END IF;

  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, match_duration_seconds, status) VALUES
  -- Men 18-35 Sparring (10 divisions, 2 rounds × 2 min, 30s break)
  (v_tid, 'Men 18-35 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Fin Weight (54.9kg & Below)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Fly Weight (55kg–59.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Bantam Weight (60kg–64.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Feather Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Feather Weight (65kg–69.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Light Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Light Weight (70kg–74.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Welter Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Welter Weight (75kg–79.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Middle Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Middle Weight (80kg–84.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Heavy Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Heavy Weight (85kg–89.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Super Heavy Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Super Heavy Weight (90kg–100kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 18-35 — Sparring — Super Heavy Weight L1', 'sparring_kumite', 'male', 'adult_18_24', 'Super Heavy Weight L1 (100kg+)', 2, 120, 30, 120, 'upcoming'),

  -- Men 25-35 Sparring
  (v_tid, 'Men 25-35 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Fin Weight (54.9kg & Below)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Fly Weight (55kg–59.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Bantam Weight (60kg–64.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Feather Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Feather Weight (65kg–69.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Light Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Light Weight (70kg–74.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Welter Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Welter Weight (75kg–79.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Middle Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Middle Weight (80kg–84.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Heavy Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Heavy Weight (85kg–89.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Super Heavy Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Super Heavy Weight (90kg–100kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 25-35 — Sparring — Super Heavy Weight L1', 'sparring_kumite', 'male', 'adult_25_35', 'Super Heavy Weight L1 (100kg+)', 2, 120, 30, 120, 'upcoming'),

  -- Men 36-49 Sparring
  (v_tid, 'Men 36-49 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'adult_36_49', 'Fly Weight (50.9kg–59.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 36-49 — Sparring — Middle Weight', 'sparring_kumite', 'male', 'adult_36_49', 'Middle Weight (60kg–69.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 36-49 — Sparring — Heavy Weight', 'sparring_kumite', 'male', 'adult_36_49', 'Heavy Weight (70kg–79.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 36-49 — Sparring — Super Heavy Weight', 'sparring_kumite', 'male', 'adult_36_49', 'Super Heavy Weight (80kg+)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Men 36-49 — Sparring — Super Heavy Weight L0', 'sparring_kumite', 'male', 'adult_36_49', 'Super Heavy Weight L0 (90kg+)', 2, 120, 30, 120, 'upcoming'),

  -- Ladies 18-24 Sparring
  (v_tid, 'Ladies 18-24 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'adult_18_24', 'Fly Weight (50.9kg–59.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Sparring — Middle Weight', 'sparring_kumite', 'female', 'adult_18_24', 'Middle Weight (60kg–69.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Sparring — Heavy Weight', 'sparring_kumite', 'female', 'adult_18_24', 'Heavy Weight (70kg–79.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Sparring — Super Heavy Weight', 'sparring_kumite', 'female', 'adult_18_24', 'Super Heavy Weight (80kg+)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Sparring — Super Heavy Weight L0', 'sparring_kumite', 'female', 'adult_18_24', 'Super Heavy Weight L0 (90kg+)', 2, 120, 30, 120, 'upcoming'),

  -- Ladies 25-49 Sparring
  (v_tid, 'Ladies 25-49 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'adult_25_35', 'Fly Weight (50.9kg–59.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Ladies 25-49 — Sparring — Middle Weight', 'sparring_kumite', 'female', 'adult_25_35', 'Middle Weight (60kg–69.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Ladies 25-49 — Sparring — Heavy Weight', 'sparring_kumite', 'female', 'adult_25_35', 'Heavy Weight (70kg–79.9kg)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Ladies 25-49 — Sparring — Super Heavy Weight', 'sparring_kumite', 'female', 'adult_25_35', 'Super Heavy Weight (80kg+)', 2, 120, 30, 120, 'upcoming'),
  (v_tid, 'Ladies 25-49 — Sparring — Super Heavy Weight L0', 'sparring_kumite', 'female', 'adult_25_35', 'Super Heavy Weight L0 (90kg+)', 2, 120, 30, 120, 'upcoming'),

  -- Kids Sparring
  (v_tid, 'Boys 9-11 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'kids_9_11', 'Fin Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Boys 9-11 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'kids_9_11', 'Fly Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Boys 9-11 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'kids_9_11', 'Bantam Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Boys 12-14 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'kids_12_14', 'Fin Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Boys 12-14 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'kids_12_14', 'Fly Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Boys 12-14 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'kids_12_14', 'Bantam Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Boys 15-17 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'kids_15_17', 'Fin Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Boys 15-17 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'kids_15_17', 'Fly Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Boys 15-17 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'kids_15_17', 'Bantam Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 9-11 — Sparring — Fin Weight', 'sparring_kumite', 'female', 'kids_9_11', 'Fin Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 9-11 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'kids_9_11', 'Fly Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 9-11 — Sparring — Bantam Weight', 'sparring_kumite', 'female', 'kids_9_11', 'Bantam Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 12-14 — Sparring — Fin Weight', 'sparring_kumite', 'female', 'kids_12_14', 'Fin Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 12-14 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'kids_12_14', 'Fly Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 12-14 — Sparring — Bantam Weight', 'sparring_kumite', 'female', 'kids_12_14', 'Bantam Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 15-17 — Sparring — Fin Weight', 'sparring_kumite', 'female', 'kids_15_17', 'Fin Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 15-17 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'kids_15_17', 'Fly Weight', 1, 120, 0, 120, 'upcoming'),
  (v_tid, 'Girls 15-17 — Sparring — Bantam Weight', 'sparring_kumite', 'female', 'kids_15_17', 'Bantam Weight', 1, 120, 0, 120, 'upcoming');

  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, match_duration_seconds, status) VALUES
  -- Men Form
  (v_tid, 'Men 18-35 — Form — White to Yellow Belt', 'form_bon_kata', 'male', 'adult_18_24', 'White to Yellow Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Men 18-35 — Form — Green to Blue Belt', 'form_bon_kata', 'male', 'adult_18_24', 'Green to Blue Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Men 18-35 — Form — Brown Belt', 'form_bon_kata', 'male', 'adult_18_24', 'Brown Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Men 18-35 — Form — Black Belt', 'form_bon_kata', 'male', 'adult_18_24', 'Black Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'adult_18_24', 'White to Yellow Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Form — Green to Blue Belt', 'form_bon_kata', 'female', 'adult_18_24', 'Green to Blue Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Form — Brown Belt', 'form_bon_kata', 'female', 'adult_18_24', 'Brown Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Form — Black Belt', 'form_bon_kata', 'female', 'adult_18_24', 'Black Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 9-11 — Form — White to Yellow Belt', 'form_bon_kata', 'male', 'kids_9_11', 'White to Yellow Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 9-11 — Form — Green to Blue Belt', 'form_bon_kata', 'male', 'kids_9_11', 'Green to Blue Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 9-11 — Form — Brown Belt', 'form_bon_kata', 'male', 'kids_9_11', 'Brown Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 9-11 — Form — Black Belt', 'form_bon_kata', 'male', 'kids_9_11', 'Black Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 12-14 — Form — White to Yellow Belt', 'form_bon_kata', 'male', 'kids_12_14', 'White to Yellow Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 12-14 — Form — Green to Blue Belt', 'form_bon_kata', 'male', 'kids_12_14', 'Green to Blue Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 12-14 — Form — Brown Belt', 'form_bon_kata', 'male', 'kids_12_14', 'Brown Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 12-14 — Form — Black Belt', 'form_bon_kata', 'male', 'kids_12_14', 'Black Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 15-17 — Form — White to Yellow Belt', 'form_bon_kata', 'male', 'kids_15_17', 'White to Yellow Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 15-17 — Form — Green to Blue Belt', 'form_bon_kata', 'male', 'kids_15_17', 'Green to Blue Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 15-17 — Form — Brown Belt', 'form_bon_kata', 'male', 'kids_15_17', 'Brown Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Boys 15-17 — Form — Black Belt', 'form_bon_kata', 'male', 'kids_15_17', 'Black Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 9-11 — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'kids_9_11', 'White to Yellow Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 9-11 — Form — Green to Blue Belt', 'form_bon_kata', 'female', 'kids_9_11', 'Green to Blue Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 9-11 — Form — Brown Belt', 'form_bon_kata', 'female', 'kids_9_11', 'Brown Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 9-11 — Form — Black Belt', 'form_bon_kata', 'female', 'kids_9_11', 'Black Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 12-14 — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'kids_12_14', 'White to Yellow Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 12-14 — Form — Green to Blue Belt', 'form_bon_kata', 'female', 'kids_12_14', 'Green to Blue Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 12-14 — Form — Brown Belt', 'form_bon_kata', 'female', 'kids_12_14', 'Brown Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 12-14 — Form — Black Belt', 'form_bon_kata', 'female', 'kids_12_14', 'Black Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 15-17 — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'kids_15_17', 'White to Yellow Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 15-17 — Form — Green to Blue Belt', 'form_bon_kata', 'female', 'kids_15_17', 'Green to Blue Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 15-17 — Form — Brown Belt', 'form_bon_kata', 'female', 'kids_15_17', 'Brown Belt', 1, 300, 0, 300, 'upcoming'),
  (v_tid, 'Girls 15-17 — Form — Black Belt', 'form_bon_kata', 'female', 'kids_15_17', 'Black Belt', 1, 300, 0, 300, 'upcoming');

  INSERT INTO events (tournament_id, name, category, gender, age_group, rounds, round_duration_seconds, break_duration_seconds, match_duration_seconds, status) VALUES
  (v_tid, 'Men 18-35 — Special Techniques', 'special_techniques', 'male', 'adult_18_24', 1, 420, 0, 420, 'upcoming'),
  (v_tid, 'Ladies 18-24 — Special Techniques', 'special_techniques', 'female', 'adult_18_24', 1, 420, 0, 420, 'upcoming'),
  (v_tid, 'Team Form — Men', 'team_form_bon_kata', 'male', 'adult_18_24', 1, 420, 0, 420, 'upcoming'),
  (v_tid, 'Team Form — Ladies', 'team_form_bon_kata', 'female', 'adult_18_24', 1, 420, 0, 420, 'upcoming'),
  (v_tid, 'Team Special Techniques — Men', 'team_special_techniques', 'male', 'adult_18_24', 1, 420, 0, 420, 'upcoming'),
  (v_tid, 'Team Special Techniques — Ladies', 'team_special_techniques', 'female', 'adult_18_24', 1, 420, 0, 420, 'upcoming');

  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, match_duration_seconds, status) VALUES
  (v_tid, 'Team Sparring — Men — Open Weight (5 Persons)', 'team_sparring_5_person', 'male', 'adult_18_24', 'Open Weight', 2, 120, 30, 120, 'upcoming');

END $$;
