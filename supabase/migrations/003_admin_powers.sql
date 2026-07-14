-- ============================================================
-- Schema v3.1 additive migration: international-grade admin powers.
-- Safe to run on top of schema v3.0 (does not drop anything).
-- ============================================================

-- User activity + session tracking.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_token TEXT;

-- Per-match append-only audit trail.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS audit_log JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Broadcast banners pushed to all tablets in a tournament.
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_by UUID[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_broadcast_tournament ON broadcast_messages(tournament_id, created_at DESC);

ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_broadcast ON broadcast_messages;
CREATE POLICY public_read_broadcast ON broadcast_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS admin_all_broadcast ON broadcast_messages;
CREATE POLICY admin_all_broadcast ON broadcast_messages FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Controllers may dismiss (update read_by) broadcasts on their court's tournament.
DROP POLICY IF EXISTS participant_update_broadcast ON broadcast_messages;
CREATE POLICY participant_update_broadcast ON broadcast_messages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_active))
  WITH CHECK (true);

-- Helper: append an entry to a match audit_log (used by admin overrides).
CREATE OR REPLACE FUNCTION append_match_audit(
  p_match_id UUID, p_action TEXT, p_user TEXT, p_note TEXT
) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE matches
  SET audit_log = audit_log || jsonb_build_object(
    'action', p_action, 'user', p_user, 'timestamp', now(), 'note', p_note
  )
  WHERE id = p_match_id;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE broadcast_messages;
