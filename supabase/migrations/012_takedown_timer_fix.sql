-- ============================================================
-- 012_takedown_timer_fix.sql
-- Fix: ending a takedown reset the main match timer to 3:00.
--
-- Root cause: the controller never persisted timer_seconds when a
-- takedown started, so the realtime reload restored the stale value
-- written at Start (max_time, typically 180).
--
-- This adds a dedicated save slot. The controller writes it on
-- takedown start and clears it on takedown end.
--
-- Run in the Supabase SQL editor (idempotent).
-- ============================================================

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS timer_before_takedown INT;

-- Sanity check: no trigger on matches may reset timer_seconds when
-- status changes back to 'live'. Verify with:
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'matches'::regclass AND NOT tgisinternal;
