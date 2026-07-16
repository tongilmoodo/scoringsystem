-- ============================================================
-- 015_official_event_catalog.sql
-- Official Tong-Il Moo-Do categories and durations.
-- Run AFTER 014_post_reset_hotfix.sql (needs events.weight_class
-- and events.description).
-- Idempotent: only inserts events that do not already exist.
--
-- Durations:
--   Adult sparring: 2 rounds x 2 min, 30s break
--   Kids sparring:  1 round  x 2 min, no break
--   Individual/kids form: max 5 min
--   Special techniques + team form/special: max 7 min
--   Team sparring (5 persons, open weight): 2 x 2 min, 30s break
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

-- Official catalog.
INSERT INTO events (tournament_id, name, category, gender, age_group, division, belt_rank,
                    rounds, round_duration_seconds, break_duration_seconds, timer_duration_seconds, status)
SELECT t.id, v.name, v.category, v.gender, v.age_group, v.division, v.belt_rank,
       v.rounds, v.round_secs, v.break_secs, v.round_secs, 'active'
FROM tournaments t,
(VALUES
  -- ---- Men 18-24 sparring: 2 x 2 min, 30s break ----
  ('Men 18-24 — Sparring — Fin Weight',                 'sparring_kumite', 'male', 'adult_18_24', 'Fin Weight (54.9kg & below)'::TEXT,          NULL::TEXT, 2, 120, 30),
  ('Men 18-24 — Sparring — Fly Weight',                 'sparring_kumite', 'male', 'adult_18_24', 'Fly Weight (55kg–59.9kg)',                   NULL, 2, 120, 30),
  ('Men 18-24 — Sparring — Bantam Weight',              'sparring_kumite', 'male', 'adult_18_24', 'Bantam Weight (60kg–64.9kg)',                NULL, 2, 120, 30),
  ('Men 18-24 — Sparring — Feather Weight',             'sparring_kumite', 'male', 'adult_18_24', 'Feather Weight (65kg–69.9kg)',               NULL, 2, 120, 30),
  ('Men 18-24 — Sparring — Light Weight',               'sparring_kumite', 'male', 'adult_18_24', 'Light Weight (70kg–74.9kg)',                 NULL, 2, 120, 30),
  ('Men 18-24 — Sparring — Welter Weight',              'sparring_kumite', 'male', 'adult_18_24', 'Welter Weight (75kg–79.9kg)',                NULL, 2, 120, 30),
  ('Men 18-24 — Sparring — Middle Weight',              'sparring_kumite', 'male', 'adult_18_24', 'Middle Weight (80kg–84.9kg)',                NULL, 2, 120, 30),
  ('Men 18-24 — Sparring — Heavy Weight',               'sparring_kumite', 'male', 'adult_18_24', 'Heavy Weight (85kg–89.9kg)',                 NULL, 2, 120, 30),
  ('Men 18-24 — Sparring — Super Heavy Weight',         'sparring_kumite', 'male', 'adult_18_24', 'Super Heavy Weight (90kg–100kg)',            NULL, 2, 120, 30),
  ('Men 18-24 — Sparring — Super Heavy Weight Level 1', 'sparring_kumite', 'male', 'adult_18_24', 'Super Heavy Weight Level 1 (100kg & above)', NULL, 2, 120, 30),
  -- ---- Men 25-35 sparring ----
  ('Men 25-35 — Sparring — Fin Weight',                 'sparring_kumite', 'male', 'adult_25_35', 'Fin Weight (54.9kg & below)',                NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Fly Weight',                 'sparring_kumite', 'male', 'adult_25_35', 'Fly Weight (55kg–59.9kg)',                   NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Bantam Weight',              'sparring_kumite', 'male', 'adult_25_35', 'Bantam Weight (60kg–64.9kg)',                NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Feather Weight',             'sparring_kumite', 'male', 'adult_25_35', 'Feather Weight (65kg–69.9kg)',               NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Light Weight',               'sparring_kumite', 'male', 'adult_25_35', 'Light Weight (70kg–74.9kg)',                 NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Welter Weight',              'sparring_kumite', 'male', 'adult_25_35', 'Welter Weight (75kg–79.9kg)',                NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Middle Weight',              'sparring_kumite', 'male', 'adult_25_35', 'Middle Weight (80kg–84.9kg)',                NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Heavy Weight',               'sparring_kumite', 'male', 'adult_25_35', 'Heavy Weight (85kg–89.9kg)',                 NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Super Heavy Weight',         'sparring_kumite', 'male', 'adult_25_35', 'Super Heavy Weight (90kg–100kg)',            NULL, 2, 120, 30),
  ('Men 25-35 — Sparring — Super Heavy Weight Level 1', 'sparring_kumite', 'male', 'adult_25_35', 'Super Heavy Weight Level 1 (100kg & above)', NULL, 2, 120, 30),
  -- ---- Men 36-49 sparring ----
  ('Men 36-49 — Sparring — Fly Weight',                 'sparring_kumite', 'male', 'adult_36_49', 'Fly Weight (50.9kg–59.9kg)',                 NULL, 2, 120, 30),
  ('Men 36-49 — Sparring — Middle Weight',              'sparring_kumite', 'male', 'adult_36_49', 'Middle Weight (60kg–69.9kg)',                NULL, 2, 120, 30),
  ('Men 36-49 — Sparring — Heavy Weight',               'sparring_kumite', 'male', 'adult_36_49', 'Heavy Weight (70kg–79.9kg)',                 NULL, 2, 120, 30),
  ('Men 36-49 — Sparring — Super Heavy Weight',         'sparring_kumite', 'male', 'adult_36_49', 'Super Heavy Weight (80kg & above)',          NULL, 2, 120, 30),
  ('Men 36-49 — Sparring — Super Heavy Weight Level 0', 'sparring_kumite', 'male', 'adult_36_49', 'Super Heavy Weight Level 0 (90kg & above)',  NULL, 2, 120, 30),
  -- ---- Ladies 18-24 sparring ----
  ('Ladies 18-24 — Sparring — Fly Weight',                 'sparring_kumite', 'female', 'adult_18_24', 'Fly Weight (50.9kg–59.9kg)',                NULL, 2, 120, 30),
  ('Ladies 18-24 — Sparring — Middle Weight',              'sparring_kumite', 'female', 'adult_18_24', 'Middle Weight (60kg–69.9kg)',               NULL, 2, 120, 30),
  ('Ladies 18-24 — Sparring — Heavy Weight',               'sparring_kumite', 'female', 'adult_18_24', 'Heavy Weight (70kg–79.9kg)',                NULL, 2, 120, 30),
  ('Ladies 18-24 — Sparring — Super Heavy Weight',         'sparring_kumite', 'female', 'adult_18_24', 'Super Heavy Weight (80kg & above)',         NULL, 2, 120, 30),
  ('Ladies 18-24 — Sparring — Super Heavy Weight Level 0', 'sparring_kumite', 'female', 'adult_18_24', 'Super Heavy Weight Level 0 (90kg & above)', NULL, 2, 120, 30),
  -- ---- Ladies 25-49 sparring ----
  ('Ladies 25-49 — Sparring — Fly Weight',                 'sparring_kumite', 'female', 'adult_25_49', 'Fly Weight (50.9kg–59.9kg)',                NULL, 2, 120, 30),
  ('Ladies 25-49 — Sparring — Middle Weight',              'sparring_kumite', 'female', 'adult_25_49', 'Middle Weight (60kg–69.9kg)',               NULL, 2, 120, 30),
  ('Ladies 25-49 — Sparring — Heavy Weight',               'sparring_kumite', 'female', 'adult_25_49', 'Heavy Weight (70kg–79.9kg)',                NULL, 2, 120, 30),
  ('Ladies 25-49 — Sparring — Super Heavy Weight',         'sparring_kumite', 'female', 'adult_25_49', 'Super Heavy Weight (80kg & above)',         NULL, 2, 120, 30),
  ('Ladies 25-49 — Sparring — Super Heavy Weight Level 0', 'sparring_kumite', 'female', 'adult_25_49', 'Super Heavy Weight Level 0 (90kg & above)', NULL, 2, 120, 30),
  -- ---- Adult form (max 5 min) ----
  ('Men Adults — Form — White to Yellow Belt',    'form_bon_kata', 'male',   'adult_all', NULL, 'White to Yellow Belt', 1, 300, 0),
  ('Men Adults — Form — Green to Blue Belt',      'form_bon_kata', 'male',   'adult_all', NULL, 'Green to Blue Belt',   1, 300, 0),
  ('Men Adults — Form — Brown Belt',              'form_bon_kata', 'male',   'adult_all', NULL, 'Brown Belt',           1, 300, 0),
  ('Men Adults — Form — Black Belt',              'form_bon_kata', 'male',   'adult_all', NULL, 'Black Belt',           1, 300, 0),
  ('Ladies Adults — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'adult_all', NULL, 'White to Yellow Belt', 1, 300, 0),
  ('Ladies Adults — Form — Green to Blue Belt',   'form_bon_kata', 'female', 'adult_all', NULL, 'Green to Blue Belt',   1, 300, 0),
  ('Ladies Adults — Form — Brown Belt',           'form_bon_kata', 'female', 'adult_all', NULL, 'Brown Belt',           1, 300, 0),
  ('Ladies Adults — Form — Black Belt',           'form_bon_kata', 'female', 'adult_all', NULL, 'Black Belt',           1, 300, 0),
  -- ---- Adult special techniques (max 7 min) ----
  ('Men Adults — Special Techniques',    'special_techniques', 'male',   'adult_all', NULL, NULL, 1, 420, 0),
  ('Ladies Adults — Special Techniques', 'special_techniques', 'female', 'adult_all', NULL, NULL, 1, 420, 0),
  -- ---- Team events ----
  ('Team Sparring — 5 Persons — Open Weight', 'team_sparring_5_person',  'male',  'adult_all', 'Open Weight', NULL, 2, 120, 30),
  ('Team Form / Bon / Kata',                  'team_form_bon_kata',      'mixed', 'adult_all', NULL,          NULL, 1, 420, 0),
  ('Team Special Techniques',                 'team_special_techniques', 'mixed', 'adult_all', NULL,          NULL, 1, 420, 0),
  -- ---- Kids sparring: 1 round x 2 min, no break ----
  ('Girls 9-11 — Sparring',  'sparring_kumite', 'female', 'kids_9_11',  NULL, NULL, 1, 120, 0),
  ('Girls 12-14 — Sparring', 'sparring_kumite', 'female', 'kids_12_14', NULL, NULL, 1, 120, 0),
  ('Girls 15-17 — Sparring', 'sparring_kumite', 'female', 'kids_15_17', NULL, NULL, 1, 120, 0),
  ('Boys 9-11 — Sparring',   'sparring_kumite', 'male',   'kids_9_11',  NULL, NULL, 1, 120, 0),
  ('Boys 12-14 — Sparring',  'sparring_kumite', 'male',   'kids_12_14', NULL, NULL, 1, 120, 0),
  ('Boys 15-17 — Sparring',  'sparring_kumite', 'male',   'kids_15_17', NULL, NULL, 1, 120, 0),
  -- ---- Kids form (max 5 min) ----
  ('Girls Children — Form — White to Yellow Belt', 'form_bon_kata', 'female', 'kids_all', NULL, 'White to Yellow Belt', 1, 300, 0),
  ('Girls Children — Form — Green to Blue Belt',   'form_bon_kata', 'female', 'kids_all', NULL, 'Green to Blue Belt',   1, 300, 0),
  ('Girls Children — Form — Brown Belt',           'form_bon_kata', 'female', 'kids_all', NULL, 'Brown Belt',           1, 300, 0),
  ('Girls Children — Form — Black Belt',           'form_bon_kata', 'female', 'kids_all', NULL, 'Black Belt',           1, 300, 0),
  ('Boys Children — Form — White to Yellow Belt',  'form_bon_kata', 'male',   'kids_all', NULL, 'White to Yellow Belt', 1, 300, 0),
  ('Boys Children — Form — Green to Blue Belt',    'form_bon_kata', 'male',   'kids_all', NULL, 'Green to Blue Belt',   1, 300, 0),
  ('Boys Children — Form — Brown Belt',            'form_bon_kata', 'male',   'kids_all', NULL, 'Brown Belt',           1, 300, 0),
  ('Boys Children — Form — Black Belt',            'form_bon_kata', 'male',   'kids_all', NULL, 'Black Belt',           1, 300, 0)
) AS v(name, category, gender, age_group, division, belt_rank, rounds, round_secs, break_secs)
WHERE t.slug = 'mombasa-open-2026'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.tournament_id = t.id AND e.name = v.name);

-- Compat + display backfills.
UPDATE events SET weight_class = division WHERE weight_class IS NULL AND division IS NOT NULL;
UPDATE events SET description =
  CASE
    WHEN category IN ('sparring_kumite', 'team_sparring_5_person') THEN
      rounds || ' round' || CASE WHEN rounds > 1 THEN 's' ELSE '' END ||
      ' x ' || (round_duration_seconds / 60) || ' min' ||
      CASE WHEN rounds > 1 AND break_duration_seconds > 0
           THEN ' / ' || break_duration_seconds || 's break' ELSE '' END
    ELSE 'Max ' || (round_duration_seconds / 60) || ' min'
  END
WHERE description IS NULL;
