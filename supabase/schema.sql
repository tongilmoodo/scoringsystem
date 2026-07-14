-- ============================================================
-- Mombasa Open Tong-Il Moo-Do Scoring System
-- Supabase PostgreSQL Schema v1.0
-- Run this entire file in the Supabase SQL editor, then run
-- `npm run seed:users` locally to create auth users + PIN hashes.
-- ============================================================

-- Drop existing objects (for clean rebuild)
DROP TABLE IF EXISTS score_events CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS athletes CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS tournaments CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS match_status CASCADE;
DROP TYPE IF EXISTS match_round CASCADE;
DROP TYPE IF EXISTS win_method CASCADE;
DROP TYPE IF EXISTS action_type CASCADE;
DROP TYPE IF EXISTS player_side CASCADE;
DROP TYPE IF EXISTS tournament_status CASCADE;
DROP TYPE IF EXISTS event_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

DROP FUNCTION IF EXISTS advance_winner CASCADE;
DROP FUNCTION IF EXISTS update_match_score CASCADE;
DROP FUNCTION IF EXISTS revert_match_score CASCADE;
DROP FUNCTION IF EXISTS is_admin CASCADE;
DROP FUNCTION IF EXISTS can_score_court CASCADE;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE tournament_status AS ENUM ('upcoming', 'live', 'completed');
CREATE TYPE event_status AS ENUM ('upcoming', 'live', 'completed');
CREATE TYPE match_round AS ENUM ('round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final');
CREATE TYPE match_status AS ENUM ('scheduled', 'assigned', 'live', 'paused', 'completed');
CREATE TYPE win_method AS ENUM ('points', 'ko', 'disqualification', 'withdrawal', 'forfeit');
CREATE TYPE player_side AS ENUM ('blue', 'red');
CREATE TYPE action_type AS ENUM ('point_1', 'point_2', 'point_3', 'foul', 'win_blue', 'win_red');
CREATE TYPE user_role AS ENUM ('admin', 'scorer');

-- ============================================================
-- TABLES
-- ============================================================

-- Users (Admins & Scorers) - PIN-based auth.
-- id must equal the Supabase auth user id (created by scripts/seed-users.mjs).
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'scorer',
  court_access INT CHECK (court_access IN (1, 2)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tournaments
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Mombasa, Kenya',
  date DATE NOT NULL,
  status tournament_status NOT NULL DEFAULT 'upcoming',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Events (Divisions / Weight Classes)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'mixed')),
  weight_class TEXT,
  match_duration_seconds INT NOT NULL DEFAULT 180,
  max_fouls INT NOT NULL DEFAULT 3,
  status event_status NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Athletes
CREATE TABLE athletes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  country_code TEXT,
  photo_url TEXT,
  seed INT,
  lot_number INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matches
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  court_number INT CHECK (court_number IN (1, 2)),
  round match_round NOT NULL,
  match_number INT NOT NULL,

  blue_athlete_id UUID REFERENCES athletes(id),
  red_athlete_id UUID REFERENCES athletes(id),

  blue_score INT NOT NULL DEFAULT 0,
  red_score INT NOT NULL DEFAULT 0,
  blue_fouls INT NOT NULL DEFAULT 0,
  red_fouls INT NOT NULL DEFAULT 0,

  status match_status NOT NULL DEFAULT 'scheduled',
  winner_id UUID REFERENCES athletes(id),
  win_method win_method,

  timer_seconds INT NOT NULL DEFAULT 180,
  max_time INT NOT NULL DEFAULT 180,
  timer_started_at TIMESTAMPTZ,
  timer_paused_at TIMESTAMPTZ,

  next_match_id UUID REFERENCES matches(id),
  next_match_position player_side,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Score Events (Audit Trail)
CREATE TABLE score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES athletes(id),
  player_side player_side NOT NULL,
  action_type action_type NOT NULL,
  points INT NOT NULL DEFAULT 0,
  match_time_seconds INT,
  scored_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_matches_event ON matches(event_id);
CREATE INDEX idx_matches_court ON matches(court_number);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_next ON matches(next_match_id);
CREATE INDEX idx_athletes_event ON athletes(event_id);
CREATE INDEX idx_athletes_lot ON athletes(lot_number);
CREATE INDEX idx_score_events_match ON score_events(match_id);
CREATE INDEX idx_score_events_created ON score_events(created_at);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Function: Auto-advance winner to next match
CREATE OR REPLACE FUNCTION advance_winner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.winner_id IS NOT NULL AND NEW.next_match_id IS NOT NULL THEN
    IF NEW.next_match_position = 'blue' THEN
      UPDATE matches SET blue_athlete_id = NEW.winner_id, status = 'scheduled'
      WHERE id = NEW.next_match_id;
    ELSIF NEW.next_match_position = 'red' THEN
      UPDATE matches SET red_athlete_id = NEW.winner_id, status = 'scheduled'
      WHERE id = NEW.next_match_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_advance_winner
  AFTER UPDATE ON matches
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION advance_winner();

-- Function: Auto-update match scores from score_events.
-- The frontend only INSERTs score_events; scores/fouls are derived here.
CREATE OR REPLACE FUNCTION update_match_score()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action_type = 'point_1' THEN
    IF NEW.player_side = 'blue' THEN
      UPDATE matches SET blue_score = blue_score + 1 WHERE id = NEW.match_id;
    ELSE
      UPDATE matches SET red_score = red_score + 1 WHERE id = NEW.match_id;
    END IF;
  ELSIF NEW.action_type = 'point_2' THEN
    IF NEW.player_side = 'blue' THEN
      UPDATE matches SET blue_score = blue_score + 2 WHERE id = NEW.match_id;
    ELSE
      UPDATE matches SET red_score = red_score + 2 WHERE id = NEW.match_id;
    END IF;
  ELSIF NEW.action_type = 'point_3' THEN
    IF NEW.player_side = 'blue' THEN
      UPDATE matches SET blue_score = blue_score + 3 WHERE id = NEW.match_id;
    ELSE
      UPDATE matches SET red_score = red_score + 3 WHERE id = NEW.match_id;
    END IF;
  ELSIF NEW.action_type = 'foul' THEN
    IF NEW.player_side = 'blue' THEN
      UPDATE matches SET blue_fouls = blue_fouls + 1 WHERE id = NEW.match_id;
    ELSE
      UPDATE matches SET red_fouls = red_fouls + 1 WHERE id = NEW.match_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_match_score
  AFTER INSERT ON score_events
  FOR EACH ROW
  EXECUTE FUNCTION update_match_score();

-- Function: Revert match scores when a score_event is deleted (Undo).
CREATE OR REPLACE FUNCTION revert_match_score()
RETURNS TRIGGER AS $$
DECLARE
  pts INT := CASE OLD.action_type
    WHEN 'point_1' THEN 1
    WHEN 'point_2' THEN 2
    WHEN 'point_3' THEN 3
    ELSE 0
  END;
BEGIN
  IF pts > 0 THEN
    IF OLD.player_side = 'blue' THEN
      UPDATE matches SET blue_score = GREATEST(0, blue_score - pts) WHERE id = OLD.match_id;
    ELSE
      UPDATE matches SET red_score = GREATEST(0, red_score - pts) WHERE id = OLD.match_id;
    END IF;
  ELSIF OLD.action_type = 'foul' THEN
    IF OLD.player_side = 'blue' THEN
      UPDATE matches SET blue_fouls = GREATEST(0, blue_fouls - 1) WHERE id = OLD.match_id;
    ELSE
      UPDATE matches SET red_fouls = GREATEST(0, red_fouls - 1) WHERE id = OLD.match_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_revert_match_score
  AFTER DELETE ON score_events
  FOR EACH ROW
  EXECUTE FUNCTION revert_match_score();

-- Helper functions (SECURITY DEFINER so RLS policies can consult the users
-- table without exposing PIN hashes to the public).
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin' AND u.is_active
  );
$$;

CREATE OR REPLACE FUNCTION can_score_court(court INT) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.is_active
      AND (u.role = 'admin' OR u.court_access = court)
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Public read access (users is intentionally NOT public: it stores PIN
-- hashes. PIN validation happens server-side with the service role key.)
CREATE POLICY "public_read_tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "public_read_events" ON events FOR SELECT USING (true);
CREATE POLICY "public_read_athletes" ON athletes FOR SELECT USING (true);
CREATE POLICY "public_read_matches" ON matches FOR SELECT USING (true);
CREATE POLICY "public_read_score_events" ON score_events FOR SELECT USING (true);

-- Admin full access
CREATE POLICY "admin_all_tournaments" ON tournaments FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_events" ON events FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_athletes" ON athletes FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_matches" ON matches FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_score_events" ON score_events FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Scorer court isolation
CREATE POLICY "scorer_update_matches" ON matches FOR UPDATE
  USING (can_score_court(court_number))
  WITH CHECK (can_score_court(court_number));

CREATE POLICY "scorer_insert_score_events" ON score_events FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM matches m
    WHERE m.id = score_events.match_id AND can_score_court(m.court_number)
  )
);

-- Needed for Undo (reverts via trigger_revert_match_score)
CREATE POLICY "scorer_delete_score_events" ON score_events FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM matches m
    WHERE m.id = score_events.match_id AND can_score_court(m.court_number)
  )
);

-- ============================================================
-- REALTIME ENABLEMENT
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE score_events;

-- ============================================================
-- SEED DATA (Demo Tournament)
-- ============================================================

-- Insert demo tournament
INSERT INTO tournaments (id, name, location, date, status) VALUES
('11111111-1111-1111-1111-111111111111', 'Mombasa Open 2026', 'Mombasa, Kenya', '2026-12-10', 'upcoming');

-- Insert demo event
INSERT INTO events (id, tournament_id, name, gender, weight_class, match_duration_seconds, max_fouls, status) VALUES
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Men''s -78kg', 'male', '-78kg', 180, 3, 'upcoming');

-- Insert 16 demo athletes
INSERT INTO athletes (id, event_id, name, team, country_code, seed, lot_number) VALUES
('a0000001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'John Kamau', 'Kenya', 'KE', 1, 1),
('a0000001-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Lee Min-Jun', 'South Korea', 'KR', 16, 16),
('a0000001-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Wambua Otieno', 'Kenya', 'KE', 8, 8),
('a0000001-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Tanaka Hiroshi', 'Japan', 'JP', 9, 9),
('a0000001-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Paul Ochieng', 'Kenya', 'KE', 5, 5),
('a0000001-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'David Mutua', 'Kenya', 'KE', 12, 12),
('a0000001-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'Eric Njoroge', 'Kenya', 'KE', 4, 4),
('a0000001-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'Max Weber', 'Germany', 'DE', 13, 13),
('a0000001-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'Ethan Rossi', 'Italy', 'IT', 3, 3),
('a0000001-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', 'Eason Wang', 'China', 'CN', 14, 14),
('a0000001-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222', 'FAW Hassan', 'Egypt', 'EG', 6, 6),
('a0000001-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222', 'Park Ji-Soo', 'South Korea', 'KR', 11, 11),
('a0000001-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222', 'Alex Dupont', 'France', 'FR', 7, 7),
('a0000001-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222', 'Ivan Petrov', 'Russia', 'RU', 10, 10),
('a0000001-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222', 'Samuel Oduor', 'Kenya', 'KE', 2, 2),
('a0000001-0000-0000-0000-000000000016', '22222222-2222-2222-2222-222222222222', 'Chris Brown', 'USA', 'US', 15, 15);

-- Users are NOT seeded here. Placeholder bcrypt hashes and SQL-generated ids
-- would break PIN login: users.id must equal the Supabase auth user id and
-- pin_hash must be a real bcrypt hash. Run instead:
--   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:users
-- (creates: admin PIN 123456, Court A scorer PIN 1111, Court B scorer PIN 2222)

-- ============================================================
-- SETUP INSTRUCTIONS
-- ============================================================

-- 1. Run this entire file in Supabase SQL Editor.
-- 2. Realtime is enabled above via ALTER PUBLICATION. Verify under
--    Database > Replication > supabase_realtime (tables: matches, score_events).
-- 3. Optional: Storage > Create bucket "athlete-photos" (public) for photo_url.
-- 4. Run `npm run seed:users` with your env vars to create login users.
-- 5. Add environment variables to Vercel (see .env.example).
-- 6. Generate the bracket from /admin/draw, then assign matches to courts.

-- ============================================================
