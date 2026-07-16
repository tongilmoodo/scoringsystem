-- ============================================================
-- 018_backfill_weight_class.sql
-- Run AFTER 017_athlete_registration_fix.sql.
--
-- The new 015 event catalog populates `division` but not `weight_class`
-- (which is the legacy column). The Matches page event dropdown was
-- displaying "N/A" for all new events. This backfills weight_class from
-- division so both old and new UI paths show the correct label.
-- ============================================================

-- Backfill weight_class from division where missing
UPDATE events
SET weight_class = division
WHERE weight_class IS NULL
  AND division IS NOT NULL;

-- Also backfill for belt_rank events that had no division
UPDATE events
SET weight_class = belt_rank
WHERE weight_class IS NULL
  AND belt_rank IS NOT NULL
  AND division IS NULL;
