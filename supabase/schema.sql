-- ============================================================
-- Mombasa Open Tong-Il Moo-Do Scoring System
-- Supabase PostgreSQL Schema v2.0 (4-judge consensus scoring)
-- Run this entire file in the Supabase SQL editor, then run
-- `npm run seed:users` locally to create auth users + PIN hashes.
-- ============================================================

-- Drop existing objects (for clean rebuild)
DROP TABLE IF EXISTS judge_votes CASCADE;
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
DROP TYPE IF EXISTS vote_status CASCADE;

DROP FUNCTION IF EXISTS advance_winner CASCADE;
DROP FUNCTION IF EXISTS update_match_score CASCADE;
DROP FUNCTION IF EXISTS revert_match_score CASCADE;
DROP FUNCTION IF EXISTS is_admin CASCADE;
DROP FUNCTION IF EXISTS can_score_court CASCADE;
DROP FUNCTION IF EXISTS can_control_court CASCADE;
DROP FUNCTION IF EXISTS cast_vote CASCADE;
DROP FUNCTION IF EXISTS clear_votes CASCADE;
DROP FUNCTION IF EXISTS manual_commit_score CASCADE;

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
CREATE TYPE user_role AS ENUM ('admin', 'controller', 'judge');
CREATE TYPE vote_status AS ENUM ('pending', 'committed', 'cleared');

-- ============================================================
-- TABLES
-- ============================================================

-- Users (Admin, Controllers, Judges) - PIN-based auth.
-- id must equal the Supabase auth user id (created by scripts/seed-users.mjs).
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'judge',
  court_access INT CHECK (court_access IN (1, 2)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Mombasa, Kenya',
  date DATE NOT NULL,
  status tournament_status NOT NULL DEFAULT 'upcoming',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

  judges_locked BOOLEAN NOT NULL DEFAULT false,

  next_match_id UUID REFERENCES matches(id),
  next_match_position player_side,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Judge votes (consensus buffer)
CREATE TABLE judge_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES users(id),
  player_side player_side NOT NULL,
  action_type action_type NOT NULL,
  points INT NOT NULL DEFAULT 0,
  status vote_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Score Events (committed scores only - the audit trail)
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
CREATE INDEX idx_judge_votes_match ON judge_votes(match_id, player_side, status);
CREATE INDEX idx_judge_votes_judge ON judge_votes(judge_id);

-- ============================================================
-- AUTH HELPERS (SECURITY DEFINER so RLS policies can consult users
-- without exposing PIN hashes publicly)
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin' AND u.is_active
  );
$$;

-- Controllers (or admin) may control a court: timer, votes, overrides.
CREATE OR REPLACE FUNCTION can_control_court(court INT) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.is_active
      AND (u.role = 'admin' OR (u.role = 'controller' AND u.court_access = court))
  );
$$;

-- Judges, controllers, or admin may participate in scoring on a court.
CREATE OR REPLACE FUNCTION can_score_court(court INT) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.is_active
      AND (u.role = 'admin' OR u.court_access = court)
  );
$$;

-- ============================================================
-- CONSENSUS FUNCTIONS
-- ============================================================

-- cast_vote: a judge votes; when 3+ pending votes agree on the same action
-- for a side, the score commits to score_events and all pending votes for
-- that side are marked 'committed'.
CREATE OR REPLACE FUNCTION cast_vote(
  p_match_id UUID,
  p_judge_id UUID,
  p_player_side player_side,
  p_action_type action_type
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_existing INT;
  v_count INT;
  v_points INT;
  v_top RECORD;
BEGIN
  IF p_judge_id IS DISTINCT FROM auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Cannot vote on behalf of another judge';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT can_score_court(v_match.court_number) THEN
    RAISE EXCEPTION 'Not authorised for this court';
  END IF;
  IF v_match.judges_locked THEN
    RETURN jsonb_build_object('committed', false, 'error', 'locked');
  END IF;
  IF v_match.status = 'completed' THEN
    RETURN jsonb_build_object('committed', false, 'error', 'match_completed');
  END IF;

  -- One pending vote per judge per side.
  SELECT count(*) INTO v_existing FROM judge_votes
  WHERE match_id = p_match_id AND judge_id = p_judge_id
    AND player_side = p_player_side AND status = 'pending';
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('committed', false, 'error', 'already_voted');
  END IF;

  v_points := CASE p_action_type
    WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;

  INSERT INTO judge_votes (match_id, judge_id, player_side, action_type, points, status)
  VALUES (p_match_id, p_judge_id, p_player_side, p_action_type, v_points, 'pending');

  SELECT count(*) INTO v_count FROM judge_votes
  WHERE match_id = p_match_id AND player_side = p_player_side
    AND action_type = p_action_type AND status = 'pending';

  IF v_count >= 3 THEN
    INSERT INTO score_events (match_id, athlete_id, player_side, action_type, points, match_time_seconds, scored_by)
    VALUES (
      p_match_id,
      CASE WHEN p_player_side = 'blue' THEN v_match.blue_athlete_id ELSE v_match.red_athlete_id END,
      p_player_side, p_action_type, v_points,
      v_match.max_time - v_match.timer_seconds,
      'consensus_3of4'
    );
    UPDATE judge_votes SET status = 'committed'
    WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';
    RETURN jsonb_build_object('committed', true, 'action', p_action_type, 'votes', v_count, 'side', p_player_side);
  ELSE
    SELECT action_type, count(*) AS c INTO v_top FROM judge_votes
    WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending'
    GROUP BY action_type ORDER BY c DESC LIMIT 1;
    RETURN jsonb_build_object(
      'committed', false, 'action', p_action_type, 'votes', v_count,
      'top_action', v_top.action_type, 'top_votes', v_top.c, 'side', p_player_side
    );
  END IF;
END;
$$;

-- clear_votes: controller clears pending votes for a side.
CREATE OR REPLACE FUNCTION clear_votes(p_match_id UUID, p_player_side player_side)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_court INT;
BEGIN
  SELECT court_number INTO v_court FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT can_control_court(v_court) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  UPDATE judge_votes SET status = 'cleared'
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';
END;
$$;

-- manual_commit_score: controller overrides consensus and commits directly.
-- Also clears pending votes for that side.
CREATE OR REPLACE FUNCTION manual_commit_score(
  p_match_id UUID,
  p_player_side player_side,
  p_action_type action_type,
  p_controller_name TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match matches%ROWTYPE;
  v_points INT;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT can_control_court(v_match.court_number) THEN RAISE EXCEPTION 'Not authorised'; END IF;

  v_points := CASE p_action_type
    WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;

  INSERT INTO score_events (match_id, athlete_id, player_side, action_type, points, match_time_seconds, scored_by)
  VALUES (
    p_match_id,
    CASE WHEN p_player_side = 'blue' THEN v_match.blue_athlete_id ELSE v_match.red_athlete_id END,
    p_player_side, p_action_type, v_points,
    v_match.max_time - v_match.timer_seconds,
    p_controller_name || ' (manual override)'
  );
  UPDATE judge_votes SET status = 'cleared'
  WHERE match_id = p_match_id AND player_side = p_player_side AND status = 'pending';
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update match scores from committed score_events.
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

-- Revert match scores when a score_event is deleted (Undo Last).
CREATE OR REPLACE FUNCTION revert_match_score()
RETURNS TRIGGER AS $$
DECLARE
  pts INT := CASE OLD.action_type
    WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END;
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

-- Auto-advance winner to the next bracket match.
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

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Public read access (users is intentionally NOT public: it stores PIN
-- hashes. PIN validation happens server-side with the service role key.)
CREATE POLICY "public_read_tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "public_read_events" ON events FOR SELECT USING (true);
CREATE POLICY "public_read_athletes" ON athletes FOR SELECT USING (true);
CREATE POLICY "public_read_matches" ON matches FOR SELECT USING (true);
CREATE POLICY "public_read_score_events" ON score_events FOR SELECT USING (true);
CREATE POLICY "public_read_judge_votes" ON judge_votes FOR SELECT USING (true);

-- Admin full access
CREATE POLICY "admin_all_tournaments" ON tournaments FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_events" ON events FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_athletes" ON athletes FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_matches" ON matches FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_score_events" ON score_events FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_all_judge_votes" ON judge_votes FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Controller court isolation: timer/status updates on their court only.
CREATE POLICY "controller_update_matches" ON matches FOR UPDATE
  USING (can_control_court(court_number))
  WITH CHECK (can_control_court(court_number));

-- Controller manages votes and committed scores on their court.
CREATE POLICY "controller_all_judge_votes" ON judge_votes FOR ALL
  USING (EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND can_control_court(m.court_number)))
  WITH CHECK (EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND can_control_court(m.court_number)));

CREATE POLICY "controller_insert_score_events" ON score_events FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND can_control_court(m.court_number)));

CREATE POLICY "controller_delete_score_events" ON score_events FOR DELETE
  USING (EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND can_control_court(m.court_number)));

-- Judges: may only INSERT their own votes for matches on their court.
-- (Normal flow goes through cast_vote(), which enforces consensus rules.)
CREATE POLICY "judge_insert_own_votes" ON judge_votes FOR INSERT
  WITH CHECK (
    judge_id = auth.uid()
    AND EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND can_score_court(m.court_number))
  );

-- ============================================================
-- REALTIME ENABLEMENT
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE score_events;
ALTER PUBLICATION supabase_realtime ADD TABLE judge_votes;

-- ============================================================
-- SEED DATA (Demo Tournament)
-- ============================================================

INSERT INTO tournaments (id, name, location, date, status) VALUES
('11111111-1111-1111-1111-111111111111', 'Mombasa Open 2026', 'Mombasa, Kenya', '2026-12-10', 'upcoming');

INSERT INTO events (id, tournament_id, name, gender, weight_class, match_duration_seconds, max_fouls, status) VALUES
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Men''s -78kg', 'male', '-78kg', 180, 3, 'upcoming');

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
--
-- LOGIN CREDENTIALS (Demo):
--   Admin (Tournament Director):  PIN 800811
--   Court A Controller:           PIN 8118111
--   Court A Judges 1-4:           PINs 8118112, 8118113, 8118114, 8118115
--   Court B Controller:           PIN 822822
--   Court B Judges 1-4:           PINs 8228221, 8228222, 8228223, 8228224

-- ============================================================
-- SETUP INSTRUCTIONS
-- ============================================================

-- 1. Run this entire file in Supabase SQL Editor.
-- 2. Realtime is enabled above via ALTER PUBLICATION. Verify under
--    Database > Replication (tables: matches, score_events, judge_votes).
-- 3. Optional: Storage > Create bucket "athlete-photos" (public).
-- 4. Run `npm run seed:users` with your env vars to create the 10 login users.
-- 5. Add environment variables to Vercel (see .env.example).
-- 6. Generate the bracket from /admin/draw, assign matches to courts,
--    then judges vote at /judge/[court] and controllers run /controller/[court].

-- ============================================================
