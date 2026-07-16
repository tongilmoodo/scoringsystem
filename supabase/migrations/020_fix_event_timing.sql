-- ============================================================
-- 020_fix_event_timing.sql
-- Run AFTER 019_missing_event_columns.sql.
--
-- Updates rounds, round_duration_seconds, break_duration_seconds,
-- and timer_duration_seconds for ALL existing events to match the
-- official Tong-Il Moo-Do rules:
--
--   Adult sparring (kumite):   2 rounds × 120s, 30s break
--   Kids sparring (kumite):    1 round  × 120s, 0s break
--   Form / Bon / Kata:         1 round  × 300s, 0s break  (max 5 min)
--   Special Techniques:        1 round  × 420s, 0s break  (max 7 min)
--   Team Sparring (5-person):  2 rounds × 120s, 30s break
--   Team Form / Bon / Kata:    1 round  × 420s, 0s break  (max 7 min)
--   Team Special Techniques:   1 round  × 420s, 0s break  (max 7 min)
--
-- Safe: does NOT delete events or athletes. Idempotent.
-- ============================================================

-- ---- Adult sparring (men, ladies, mixed adults) ----
UPDATE events
SET rounds                 = 2,
    round_duration_seconds = 120,
    break_duration_seconds = 30,
    timer_duration_seconds = 120
WHERE category = 'sparring_kumite'
  AND age_group NOT IN ('kids_9_11', 'kids_12_14', 'kids_15_17', 'kids_all');

-- ---- Kids sparring (all kids age groups) ----
UPDATE events
SET rounds                 = 1,
    round_duration_seconds = 120,
    break_duration_seconds = 0,
    timer_duration_seconds = 120
WHERE category = 'sparring_kumite'
  AND age_group IN ('kids_9_11', 'kids_12_14', 'kids_15_17', 'kids_all');

-- ---- Form / Bon / Kata (all ages) — max 7 min ----
UPDATE events
SET rounds                 = 1,
    round_duration_seconds = 420,
    break_duration_seconds = 0,
    timer_duration_seconds = 420
WHERE category = 'form_bon_kata';

-- ---- Individual Special Techniques — max 7 min ----
UPDATE events
SET rounds                 = 1,
    round_duration_seconds = 420,
    break_duration_seconds = 0,
    timer_duration_seconds = 420
WHERE category = 'special_techniques';

-- ---- Team Sparring (5-person) — 2 × 2 min, 30s break ----
UPDATE events
SET rounds                 = 2,
    round_duration_seconds = 120,
    break_duration_seconds = 30,
    timer_duration_seconds = 120
WHERE category = 'team_sparring_5_person';

-- ---- Team Form / Bon / Kata — max 7 min ----
UPDATE events
SET rounds                 = 1,
    round_duration_seconds = 420,
    break_duration_seconds = 0,
    timer_duration_seconds = 420
WHERE category = 'team_form_bon_kata';

-- ---- Team Special Techniques — max 7 min ----
UPDATE events
SET rounds                 = 1,
    round_duration_seconds = 420,
    break_duration_seconds = 0,
    timer_duration_seconds = 420
WHERE category = 'team_special_techniques';

-- ---- Backfill weight_class from division (keeps legacy field in sync) ----
UPDATE events SET weight_class = division  WHERE weight_class IS NULL AND division IS NOT NULL;
UPDATE events SET weight_class = belt_rank WHERE weight_class IS NULL AND belt_rank IS NOT NULL AND division IS NULL;

-- ---- Verify: show per-category timing summary ----
-- SELECT category,
--        age_group,
--        rounds,
--        round_duration_seconds,
--        break_duration_seconds,
--        COUNT(*) AS event_count
-- FROM events
-- GROUP BY category, age_group, rounds, round_duration_seconds, break_duration_seconds
-- ORDER BY category, age_group;
