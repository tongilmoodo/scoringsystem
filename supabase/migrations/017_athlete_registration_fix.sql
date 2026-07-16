-- ============================================================
-- 017_athlete_registration_fix.sql
-- Run AFTER 014_post_reset_hotfix.sql.
--
-- 1. The reset made athletes.country_code NOT NULL with a strict
--    2-letter CHECK, but the registration form and CSV import allow
--    an empty country. Those inserts failed (and the UI swallowed
--    the error), so athletes were never saved. Country is optional
--    again; the format check still applies when provided.
--
-- 2. After a full DROP TABLE ... CASCADE reset, the PostgREST schema
--    cache can be stale, which breaks the embedded joins the app uses
--    to pull athlete data into matches:
--      blue:athletes!matches_blue_athlete_id_fkey(*)
--    The NOTIFY forces a reload.
-- ============================================================

ALTER TABLE athletes ALTER COLUMN country_code DROP NOT NULL;
ALTER TABLE athletes DROP CONSTRAINT IF EXISTS athletes_country_code_check;
ALTER TABLE athletes ADD CONSTRAINT athletes_country_code_check
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

NOTIFY pgrst, 'reload schema';
