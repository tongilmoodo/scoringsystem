-- ============================================================
-- 015_official_event_catalog.sql
-- COMPLETE EVENT SEED — ALL 90 CATEGORIES
-- Mombasa Open Tong-Il Moo-Do International Championship 2026
-- ============================================================

-- Age brackets the official catalog needs beyond the reset's CHECK.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_age_group_check;
ALTER TABLE events ADD CONSTRAINT events_age_group_check CHECK (age_group IN (
  'kids_9_11', 'kids_12_14', 'kids_15_17', 'kids_all',
  'adult_18_24', 'adult_25_35', 'adult_25_49', 'adult_36_49', 'adult_50_plus', 'adult_all'
));

-- Remove reset sample events that are not part of the official catalog
-- (only when they hold no athletes and no matches).
DELETE FROM events e
WHERE e.name IN (
  'Men 18-24 — Form — Black Belt',
  'Boys 12-14 — Sparring — Fin Weight',
  'Girls 9-11 — Form — White to Yellow Belt'
)
  AND NOT EXISTS (SELECT 1 FROM athletes a WHERE a.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.event_id = e.id);

DO $$
DECLARE
  v_tid UUID;
BEGIN
  -- Get the first available tournament
  SELECT id INTO v_tid FROM tournaments LIMIT 1;

  IF v_tid IS NULL THEN
    RAISE NOTICE 'No tournament found. Skipping event seed.';
    RETURN;
  END IF;

  -- Clear existing events for this tournament
  DELETE FROM events WHERE tournament_id = v_tid;

  -- ============================================
  -- MEN SPARRING — 18-24 (10 divisions)
  -- 2 Rounds × 2 min / 30s break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Men 18-24 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Fin Weight (54.9kg & below)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Fly Weight (55kg–59.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Bantam Weight (60kg–64.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Feather Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Feather Weight (65kg–69.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Light Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Light Weight (70kg–74.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Welter Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Welter Weight (75kg–79.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Middle Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Middle Weight (80kg–84.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Heavy Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Heavy Weight (85kg–89.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Super Heavy Weight', 'sparring_kumite', 'male', 'adult_18_24', 'Super Heavy Weight (90kg–100kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 18-24 — Sparring — Super Heavy Weight L1', 'sparring_kumite', 'male', 'adult_18_24', 'Super Heavy Weight L1 (100kg & above)', 2, 120, 30, 120, 'active');

  -- ============================================
  -- MEN SPARRING — 25-35 (10 divisions)
  -- 2 Rounds × 2 min / 30s break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Men 25-35 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Fin Weight (54.9kg & below)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Fly Weight (55kg–59.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Bantam Weight (60kg–64.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Feather Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Feather Weight (65kg–69.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Light Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Light Weight (70kg–74.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Welter Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Welter Weight (75kg–79.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Middle Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Middle Weight (80kg–84.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Heavy Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Heavy Weight (85kg–89.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Super Heavy Weight', 'sparring_kumite', 'male', 'adult_25_35', 'Super Heavy Weight (90kg–100kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 25-35 — Sparring — Super Heavy Weight L1', 'sparring_kumite', 'male', 'adult_25_35', 'Super Heavy Weight L1 (100kg & above)', 2, 120, 30, 120, 'active');

  -- ============================================
  -- MEN SPARRING — 36-49 (5 divisions)
  -- 2 Rounds × 2 min / 30s break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Men 36-49 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'adult_36_49', 'Fly Weight (50.9kg–59.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 36-49 — Sparring — Middle Weight', 'sparring_kumite', 'male', 'adult_36_49', 'Middle Weight (60kg–69.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 36-49 — Sparring — Heavy Weight', 'sparring_kumite', 'male', 'adult_36_49', 'Heavy Weight (70kg–79.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 36-49 — Sparring — Super Heavy Weight', 'sparring_kumite', 'male', 'adult_36_49', 'Super Heavy Weight (80kg & above)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Men 36-49 — Sparring — Super Heavy Weight L0', 'sparring_kumite', 'male', 'adult_36_49', 'Super Heavy Weight L0 (90kg & above)', 2, 120, 30, 120, 'active');

  -- ============================================
  -- MEN FORM / BON / KATA (4 belt ranks)
  -- Max 5 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Men Adults — Form — White to Yellow Belt', 'form_bon_kata', 'male', 'adult_18_24', 'White to Yellow Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Men Adults — Form — Green to Blue Belt', 'form_bon_kata', 'male', 'adult_18_24', 'Green to Blue Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Men Adults — Form — Brown Belt', 'form_bon_kata', 'male', 'adult_18_24', 'Brown Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Men Adults — Form — Black Belt', 'form_bon_kata', 'male', 'adult_18_24', 'Black Belt', 1, 300, 0, 300, 'active');

  -- ============================================
  -- MEN SPECIAL TECHNIQUES (Weapons & Breaking)
  -- Max 7 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Men Adults — Special Techniques', 'special_techniques', 'male', 'adult_18_24', 1, 420, 0, 420, 'active');

  -- ============================================
  -- LADIES SPARRING — 18-24 (5 divisions)
  -- 2 Rounds × 2 min / 30s break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Ladies 18-24 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'adult_18_24', 'Fly Weight (50.9kg–59.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Ladies 18-24 — Sparring — Middle Weight', 'sparring_kumite', 'female', 'adult_18_24', 'Middle Weight (60kg–69.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Ladies 18-24 — Sparring — Heavy Weight', 'sparring_kumite', 'female', 'adult_18_24', 'Heavy Weight (70kg–79.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Ladies 18-24 — Sparring — Super Heavy Weight', 'sparring_kumite', 'female', 'adult_18_24', 'Super Heavy Weight (80kg & above)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Ladies 18-24 — Sparring — Super Heavy Weight L0', 'sparring_kumite', 'female', 'adult_18_24', 'Super Heavy Weight L0 (90kg & above)', 2, 120, 30, 120, 'active');

  -- ============================================
  -- LADIES SPARRING — 25-49 (5 divisions)
  -- 2 Rounds × 2 min / 30s break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Ladies 25-49 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'adult_25_35', 'Fly Weight (50.9kg–59.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Ladies 25-49 — Sparring — Middle Weight', 'sparring_kumite', 'female', 'adult_25_35', 'Middle Weight (60kg–69.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Ladies 25-49 — Sparring — Heavy Weight', 'sparring_kumite', 'female', 'adult_25_35', 'Heavy Weight (70kg–79.9kg)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Ladies 25-49 — Sparring — Super Heavy Weight', 'sparring_kumite', 'female', 'adult_25_35', 'Super Heavy Weight (80kg & above)', 2, 120, 30, 120, 'active'),
  (v_tid, 'Ladies 25-49 — Sparring — Super Heavy Weight L0', 'sparring_kumite', 'female', 'adult_25_35', 'Super Heavy Weight L0 (90kg & above)', 2, 120, 30, 120, 'active');

  -- ============================================
  -- LADIES FORM / BON / KATA (4 belt ranks)
  -- Max 5 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Ladies Adults — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'adult_18_24', 'White to Yellow Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Ladies Adults — Form — Green to Blue Belt', 'form_bon_kata', 'female', 'adult_18_24', 'Green to Blue Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Ladies Adults — Form — Brown Belt', 'form_bon_kata', 'female', 'adult_18_24', 'Brown Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Ladies Adults — Form — Black Belt', 'form_bon_kata', 'female', 'adult_18_24', 'Black Belt', 1, 300, 0, 300, 'active');

  -- ============================================
  -- LADIES SPECIAL TECHNIQUES (Weapons & Breaking)
  -- Max 7 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Ladies Adults — Special Techniques', 'special_techniques', 'female', 'adult_18_24', 1, 420, 0, 420, 'active');

  -- ============================================
  -- TEAM SPARRING — 5 Persons — Men — Open Weight
  -- 2 Rounds × 2 min / 30s break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Team Sparring — Men — Open Weight', 'team_sparring_5_person', 'male', 'adult_18_24', 'Open Weight (5 Persons)', 2, 120, 30, 120, 'active');

  -- ============================================
  -- TEAM FORM
  -- Duration 7 Minutes Max, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Team Form', 'team_form_bon_kata', 'mixed', 'adult_18_24', 1, 420, 0, 420, 'active');

  -- ============================================
  -- TEAM SPECIAL TECHNIQUES
  -- Duration 7 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Team Special Techniques', 'team_special_techniques', 'mixed', 'adult_18_24', 1, 420, 0, 420, 'active');

  -- ============================================
  -- BOYS SPARRING — 9-11 (3 divisions, open weight implied)
  -- 1 Round × 2 min, no break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Boys 9-11 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'kids_9_11', 'Fin Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Boys 9-11 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'kids_9_11', 'Fly Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Boys 9-11 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'kids_9_11', 'Bantam Weight', 1, 120, 0, 120, 'active');

  -- ============================================
  -- BOYS SPARRING — 12-14 (3 divisions)
  -- 1 Round × 2 min, no break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Boys 12-14 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'kids_12_14', 'Fin Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Boys 12-14 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'kids_12_14', 'Fly Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Boys 12-14 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'kids_12_14', 'Bantam Weight', 1, 120, 0, 120, 'active');

  -- ============================================
  -- BOYS SPARRING — 15-17 (3 divisions)
  -- 1 Round × 2 min, no break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Boys 15-17 — Sparring — Fin Weight', 'sparring_kumite', 'male', 'kids_15_17', 'Fin Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Boys 15-17 — Sparring — Fly Weight', 'sparring_kumite', 'male', 'kids_15_17', 'Fly Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Boys 15-17 — Sparring — Bantam Weight', 'sparring_kumite', 'male', 'kids_15_17', 'Bantam Weight', 1, 120, 0, 120, 'active');

  -- ============================================
  -- BOYS FORM — 9-11 (4 belt ranks)
  -- Max 5 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Boys 9-11 — Form — White to Yellow Belt', 'form_bon_kata', 'male', 'kids_9_11', 'White to Yellow Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 9-11 — Form — Green to Blue Belt', 'form_bon_kata', 'male', 'kids_9_11', 'Green to Blue Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 9-11 — Form — Brown Belt', 'form_bon_kata', 'male', 'kids_9_11', 'Brown Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 9-11 — Form — Black Belt', 'form_bon_kata', 'male', 'kids_9_11', 'Black Belt', 1, 300, 0, 300, 'active');

  -- ============================================
  -- BOYS FORM — 12-14 (4 belt ranks)
  -- Max 5 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Boys 12-14 — Form — White to Yellow Belt', 'form_bon_kata', 'male', 'kids_12_14', 'White to Yellow Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 12-14 — Form — Green to Blue Belt', 'form_bon_kata', 'male', 'kids_12_14', 'Green to Blue Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 12-14 — Form — Brown Belt', 'form_bon_kata', 'male', 'kids_12_14', 'Brown Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 12-14 — Form — Black Belt', 'form_bon_kata', 'male', 'kids_12_14', 'Black Belt', 1, 300, 0, 300, 'active');

  -- ============================================
  -- BOYS FORM — 15-17 (4 belt ranks)
  -- Max 5 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Boys 15-17 — Form — White to Yellow Belt', 'form_bon_kata', 'male', 'kids_15_17', 'White to Yellow Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 15-17 — Form — Green to Blue Belt', 'form_bon_kata', 'male', 'kids_15_17', 'Green to Blue Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 15-17 — Form — Brown Belt', 'form_bon_kata', 'male', 'kids_15_17', 'Brown Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Boys 15-17 — Form — Black Belt', 'form_bon_kata', 'male', 'kids_15_17', 'Black Belt', 1, 300, 0, 300, 'active');

  -- ============================================
  -- GIRLS SPARRING — 9-11 (3 divisions)
  -- 1 Round × 2 min, no break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Girls 9-11 — Sparring — Fin Weight', 'sparring_kumite', 'female', 'kids_9_11', 'Fin Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Girls 9-11 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'kids_9_11', 'Fly Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Girls 9-11 — Sparring — Bantam Weight', 'sparring_kumite', 'female', 'kids_9_11', 'Bantam Weight', 1, 120, 0, 120, 'active');

  -- ============================================
  -- GIRLS SPARRING — 12-14 (3 divisions)
  -- 1 Round × 2 min, no break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Girls 12-14 — Sparring — Fin Weight', 'sparring_kumite', 'female', 'kids_12_14', 'Fin Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Girls 12-14 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'kids_12_14', 'Fly Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Girls 12-14 — Sparring — Bantam Weight', 'sparring_kumite', 'female', 'kids_12_14', 'Bantam Weight', 1, 120, 0, 120, 'active');

  -- ============================================
  -- GIRLS SPARRING — 15-17 (3 divisions)
  -- 1 Round × 2 min, no break
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, division, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Girls 15-17 — Sparring — Fin Weight', 'sparring_kumite', 'female', 'kids_15_17', 'Fin Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Girls 15-17 — Sparring — Fly Weight', 'sparring_kumite', 'female', 'kids_15_17', 'Fly Weight', 1, 120, 0, 120, 'active'),
  (v_tid, 'Girls 15-17 — Sparring — Bantam Weight', 'sparring_kumite', 'female', 'kids_15_17', 'Bantam Weight', 1, 120, 0, 120, 'active');

  -- ============================================
  -- GIRLS FORM — 9-11 (4 belt ranks)
  -- Max 5 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Girls 9-11 — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'kids_9_11', 'White to Yellow Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 9-11 — Form — Green to Blue Belt', 'form_bon_kata', 'female', 'kids_9_11', 'Green to Blue Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 9-11 — Form — Brown Belt', 'form_bon_kata', 'female', 'kids_9_11', 'Brown Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 9-11 — Form — Black Belt', 'form_bon_kata', 'female', 'kids_9_11', 'Black Belt', 1, 300, 0, 300, 'active');

  -- ============================================
  -- GIRLS FORM — 12-14 (4 belt ranks)
  -- Max 5 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Girls 12-14 — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'kids_12_14', 'White to Yellow Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 12-14 — Form — Green to Blue Belt', 'form_bon_kata', 'female', 'kids_12_14', 'Green to Blue Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 12-14 — Form — Brown Belt', 'form_bon_kata', 'female', 'kids_12_14', 'Brown Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 12-14 — Form — Black Belt', 'form_bon_kata', 'female', 'kids_12_14', 'Black Belt', 1, 300, 0, 300, 'active');

  -- ============================================
  -- GIRLS FORM — 15-17 (4 belt ranks)
  -- Max 5 Minutes, 1 Round
  -- ============================================
  INSERT INTO events (tournament_id, name, category, gender, age_group, belt_rank, rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status) VALUES
  (v_tid, 'Girls 15-17 — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'kids_15_17', 'White to Yellow Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 15-17 — Form — Green to Blue Belt', 'form_bon_kata', 'female', 'kids_15_17', 'Green to Blue Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 15-17 — Form — Brown Belt', 'form_bon_kata', 'female', 'kids_15_17', 'Brown Belt', 1, 300, 0, 300, 'active'),
  (v_tid, 'Girls 15-17 — Form — Black Belt', 'form_bon_kata', 'female', 'kids_15_17', 'Black Belt', 1, 300, 0, 300, 'active');

  -- Update descriptions
  UPDATE events SET description =
    CASE
      WHEN category IN ('sparring_kumite', 'team_sparring_5_person') THEN
        rounds || ' round' || CASE WHEN rounds > 1 THEN 's' ELSE '' END ||
        ' x ' || (round_duration_seconds / 60) || ' min' ||
        CASE WHEN rounds > 1 AND break_duration_seconds > 0
             THEN ' / ' || break_duration_seconds || 's break' ELSE '' END
      ELSE 'Max ' || (round_duration_seconds / 60) || ' min'
    END
  WHERE description IS NULL AND tournament_id = v_tid;
END;
$$;
