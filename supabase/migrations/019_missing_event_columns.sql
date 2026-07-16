-- ============================================================
-- 019_missing_event_columns.sql
-- Run AFTER 018_backfill_weight_class.sql.
--
-- The Draw page queries bracket_status, gender, age_group,
-- division, belt_rank, rounds, round_duration_seconds,
-- break_duration_seconds from events. After a DB reset + 014
-- hotfix, bracket_status (an ENUM type) is missing, causing
-- the Draw page event dropdown to silently return empty.
--
-- This migration safely adds any missing columns to events.
-- ============================================================

-- Recreate bracket_status ENUM if it was dropped
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bracket_status') THEN
    CREATE TYPE bracket_status AS ENUM ('draft', 'published');
  END IF;
END;
$$;

-- Add bracket_status column if missing
ALTER TABLE events ADD COLUMN IF NOT EXISTS bracket_status TEXT NOT NULL DEFAULT 'draft';

-- Add other columns that the app queries, if missing
ALTER TABLE events ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS belt_rank TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS rounds INT NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS round_duration_seconds INT NOT NULL DEFAULT 120;
ALTER TABLE events ADD COLUMN IF NOT EXISTS break_duration_seconds INT NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS timer_duration_seconds INT;

-- Sync timer_duration_seconds from round_duration_seconds
UPDATE events
SET timer_duration_seconds = round_duration_seconds
WHERE timer_duration_seconds IS NULL;

-- Backfill weight_class from division (idempotent)
UPDATE events SET weight_class = division WHERE weight_class IS NULL AND division IS NOT NULL;
UPDATE events SET weight_class = belt_rank  WHERE weight_class IS NULL AND belt_rank IS NOT NULL AND division IS NULL;
