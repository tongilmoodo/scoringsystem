-- ============================================================
-- 013_event_name_cleanup.sql
-- Fix corrupted event names and duration drift:
--   * Duration text concatenated into event names
--     ("Sparring / Kumite MenTwo Rounds Of 2 minutes...")
--   * Duplicate event rows ("... Heavy Weight" x 8)
--
-- Rules going forward:
--   * events.name        = division name only (no duration text)
--   * events.description = duration text, auto-derived from
--     rounds_count / match_duration_seconds / break_duration_seconds
--
-- NOTE: events.id cascades to athletes and matches, so this migration
-- never blanket-deletes events. Duplicates are removed only when they
-- have no athletes and no matches.
--
-- Run in the Supabase SQL editor (idempotent).
-- ============================================================

-- 1. Description column so duration text never lives in the name again.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Strip duration text that leaked into names.
UPDATE events
SET name = trim(regexp_replace(name, '(?i)(Two Rounds.*|Just 1 Round.*|One Round.*|Maximum Duration.*)$', ''))
WHERE name ~* '(Two Rounds|Just 1 Round|One Round|Maximum Duration)';

-- 3. Remove duplicate events (same tournament/name/category/weight class),
--    keeping the oldest row. Only rows with no athletes and no matches are
--    deleted.
DELETE FROM events e
USING events keeper
WHERE e.tournament_id = keeper.tournament_id
  AND e.name = keeper.name
  AND e.category = keeper.category
  AND coalesce(e.weight_class, '') = coalesce(keeper.weight_class, '')
  AND (e.created_at, e.id) > (keeper.created_at, keeper.id)
  AND NOT EXISTS (SELECT 1 FROM athletes a WHERE a.event_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.event_id = e.id);

-- 4. Duration presets.
-- Kids sparring: 1 round x 2 min, no break.
UPDATE events SET rounds_count = 1, match_duration_seconds = 120, break_duration_seconds = 0
WHERE category = 'sparring_kumite' AND age_group ILIKE 'kids%';

-- Adult sparring: 2 rounds x 2 min, 30s break.
UPDATE events SET rounds_count = 2, match_duration_seconds = 120, break_duration_seconds = 30
WHERE category = 'sparring_kumite' AND age_group NOT ILIKE 'kids%';

-- Form (kids and adults): 1 round x 5 min.
UPDATE events SET rounds_count = 1, match_duration_seconds = 300
WHERE category IN ('form_bon_kata', 'team_form_bon_kata');

-- Special techniques: 1 round x 7 min.
UPDATE events SET rounds_count = 1, match_duration_seconds = 420
WHERE category IN ('special_techniques', 'team_special_techniques');

-- 5. Regenerate description for every event from the numeric fields.
UPDATE events
SET description =
  CASE
    WHEN category IN ('sparring_kumite', 'team_sparring_5_person') THEN
      rounds_count || ' round' || CASE WHEN rounds_count > 1 THEN 's' ELSE '' END ||
      ' x ' || (match_duration_seconds / 60) || ' min' ||
      CASE WHEN rounds_count > 1 AND break_duration_seconds > 0
           THEN ' / ' || break_duration_seconds || 's break' ELSE '' END
    ELSE 'Max ' || (match_duration_seconds / 60) || ' min'
  END;
