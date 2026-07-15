-- ============================================================
-- Tong-Il Moo-Do Scoring System
-- Supabase PostgreSQL Schema v5.0
-- Multi-Tournament + Break Timer + Takedown + Simplified Judge UI
-- ============================================================

-- Drop existing objects
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
DROP TYPE IF EXISTS bracket_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS vote_status CASCADE;
DROP TYPE IF EXISTS event_category CASCADE;
DROP TYPE IF EXISTS gender_type CASCADE;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE tournament_status AS ENUM ('upcoming', 'live', 'completed');
CREATE TYPE event_status AS ENUM ('upcoming', 'live', 'completed');
CREATE TYPE bracket_status AS ENUM ('draft', 'published');
CREATE TYPE match_round AS ENUM ('round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final');
CREATE TYPE match_status AS ENUM ('scheduled', 'assigned', 'live', 'paused', 'break', 'takedown', 'completed');
CREATE TYPE win_method AS ENUM ('points', 'ko', 'disqualification', 'withdrawal', 'forfeit');
CREATE TYPE player_side AS ENUM ('blue', 'red');
CREATE TYPE action_type AS ENUM ('point_1', 'point_2', 'point_3', 'foul', 'win_blue', 'win_red');
CREATE TYPE user_role AS ENUM ('admin', 'controller', 'judge');
CREATE TYPE vote_status AS ENUM ('pending', 'committed', 'cleared');

CREATE TYPE event_category AS ENUM (
  'form_bon_kata',
  'sparring_kumite',
  'special_techniques',
  'two_or_three_categories',
  'team_form_bon_kata',
  'team_special_techniques',
  'team_two_categories',
  'team_sparring_5_person'
);

CREATE TYPE gender_type AS ENUM ('male', 'female', 'mixed');

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Mombasa, Kenya',
  date DATE NOT NULL,
  status tournament_status NOT NULL DEFAULT 'upcoming',
  logo_url TEXT,
  courts_count INT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category event_category NOT NULL,
  gender gender_type NOT NULL,
  age_group TEXT NOT NULL,
  weight_class TEXT,
  match_duration_seconds INT NOT NULL DEFAULT 180,
  break_duration_seconds INT NOT NULL DEFAULT 30,
  max_fouls INT NOT NULL DEFAULT 3,
  rounds_count INT NOT NULL DEFAULT 1,
  status event_status NOT NULL DEFAULT 'upcoming',
  bracket_status bracket_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'judge',
  court_access INT CHECK (court_access IN (1, 2)),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, pin_hash, role)
);

CREATE TABLE athletes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  country_code CHAR(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
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
  current_round INT NOT NULL DEFAULT 1,

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
  break_timer_seconds INT NOT NULL DEFAULT 30,
  takedown_timer_seconds INT NOT NULL DEFAULT 30,
  timer_started_at TIMESTAMPTZ,
  timer_paused_at TIMESTAMPTZ,

  next_match_id UUID REFERENCES matches(id),
  next_match_position player_side,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES athletes(id),
  player_side player_side NOT NULL,
  action_type action_type NOT NULL,
  points INT NOT NULL DEFAULT 0,
  match_time_seconds INT,
  takedown BOOLEAN NOT NULL DEFAULT false,
  scored_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_tournaments_slug ON tournaments(slug);
CREATE INDEX idx_matches_event ON matches(event_id);
CREATE INDEX idx_matches_court ON matches(court_number);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_next ON matches(next_match_id);
CREATE INDEX idx_athletes_event ON athletes(event_id);
CREATE INDEX idx_athletes_lot ON athletes(lot_number);
CREATE INDEX idx_judge_votes_match ON judge_votes(match_id);
CREATE INDEX idx_judge_votes_pending ON judge_votes(match_id, player_side, status) WHERE status = 'pending';
CREATE INDEX idx_judge_votes_judge ON judge_votes(judge_id);
CREATE INDEX idx_score_events_match ON score_events(match_id);
CREATE INDEX idx_score_events_created ON score_events(created_at);
CREATE INDEX idx_events_tournament ON events(tournament_id);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_users_tournament ON users(tournament_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

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

-- ============================================================
-- CONSENSUS FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION cast_vote(
  p_match_id UUID,
  p_judge_id UUID,
  p_player_side player_side,
  p_action_type action_type
)
RETURNS JSONB AS $$
DECLARE
  v_points INT;
  v_count INT;
  v_winning_action action_type;
  v_consensus_threshold INT := 3;
BEGIN
  IF EXISTS (
    SELECT 1 FROM judge_votes 
    WHERE match_id = p_match_id 
      AND judge_id = p_judge_id 
      AND player_side = p_player_side 
      AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object(
      'error', 'pending_vote_exists',
      'message', 'You already have a pending vote for this side.'
    );
  END IF;

  CASE p_action_type
    WHEN 'point_1' THEN v_points := 1;
    WHEN 'point_2' THEN v_points := 2;
    WHEN 'point_3' THEN v_points := 3;
    ELSE v_points := 0;
  END CASE;

  INSERT INTO judge_votes (match_id, judge_id, player_side, action_type, points)
  VALUES (p_match_id, p_judge_id, p_player_side, p_action_type, v_points);

  SELECT action_type, COUNT(*) INTO v_winning_action, v_count
  FROM judge_votes
  WHERE match_id = p_match_id
    AND player_side = p_player_side
    AND status = 'pending'
  GROUP BY action_type
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_count >= v_consensus_threshold THEN
    INSERT INTO score_events (match_id, player_side, action_type, points, scored_by)
    VALUES (p_match_id, p_player_side, v_winning_action, 
      CASE v_winning_action WHEN 'point_1' THEN 1 WHEN 'point_2' THEN 2 WHEN 'point_3' THEN 3 ELSE 0 END,
      'consensus_3of4');

    UPDATE judge_votes
    SET status = 'committed'
    WHERE match_id = p_match_id
      AND player_side = p_player_side
      AND status = 'pending';

    RETURN jsonb_build_object(
      'committed', true,
      'action', v_winning_action,
      'votes', v_count,
      'side', p_player_side
    );
  END IF;

  RETURN jsonb_build_object(
    'committed', false,
    'action', p_action_type,
    'top_votes', v_count,
    'side', p_player_side
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION clear_votes(
  p_match_id UUID,
  p_player_side player_side
)
RETURNS JSONB AS $$
DECLARE
  v_cleared INT;
BEGIN
  UPDATE judge_votes
  SET status = 'cleared'
  WHERE match_id = p_match_id
    AND player_side = p_player_side
    AND status = 'pending';

  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RETURN jsonb_build_object('cleared', true, 'votes_cleared', v_cleared, 'side', p_player_side);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION manual_commit_score(
  p_match_id UUID,
  p_player_side player_side,
  p_action_type action_type,
  p_controller_name TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_points INT;
BEGIN
  CASE p_action_type
    WHEN 'point_1' THEN v_points := 1;
    WHEN 'point_2' THEN v_points := 2;
    WHEN 'point_3' THEN v_points := 3;
    ELSE v_points := 0;
  END CASE;

  INSERT INTO score_events (match_id, player_side, action_type, points, scored_by)
  VALUES (p_match_id, p_player_side, p_action_type, v_points, p_controller_name || '_manual');

  UPDATE judge_votes
  SET status = 'cleared'
  WHERE match_id = p_match_id
    AND player_side = p_player_side
    AND status = 'pending';

  RETURN jsonb_build_object('committed', true, 'action', p_action_type, 'side', p_player_side);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_all" ON tournaments FOR SELECT USING (true);
CREATE POLICY "public_read_all" ON events FOR SELECT USING (true);
CREATE POLICY "public_read_all" ON athletes FOR SELECT USING (true);
CREATE POLICY "public_read_all" ON matches FOR SELECT USING (true);
CREATE POLICY "public_read_all" ON judge_votes FOR SELECT USING (true);
CREATE POLICY "public_read_all" ON score_events FOR SELECT USING (true);

CREATE POLICY "admin_all_tournaments" ON tournaments FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_events" ON events FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_athletes" ON athletes FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_matches" ON matches FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_judge_votes" ON judge_votes FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_score_events" ON score_events FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "controller_court_matches" ON matches FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'controller'
    AND u.court_access = matches.court_number
  )
);
CREATE POLICY "controller_court_votes" ON judge_votes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN matches m ON m.id = judge_votes.match_id
    WHERE u.id = auth.uid()
    AND u.role = 'controller'
    AND u.court_access = m.court_number
  )
);
CREATE POLICY "controller_court_events" ON score_events FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN matches m ON m.id = score_events.match_id
    WHERE u.id = auth.uid()
    AND u.role = 'controller'
    AND u.court_access = m.court_number
  )
);

CREATE POLICY "judge_read_matches" ON matches FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'judge'
    AND u.court_access = matches.court_number
  )
);
CREATE POLICY "judge_insert_votes" ON judge_votes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    JOIN matches m ON m.id = judge_votes.match_id
    WHERE u.id = auth.uid()
    AND u.role = 'judge'
    AND u.court_access = m.court_number
  )
);
CREATE POLICY "judge_read_votes" ON judge_votes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN matches m ON m.id = judge_votes.match_id
    WHERE u.id = auth.uid()
    AND u.role = 'judge'
    AND u.court_access = m.court_number
  )
);
CREATE POLICY "judge_read_score_events" ON score_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN matches m ON m.id = score_events.match_id
    WHERE u.id = auth.uid()
    AND u.role = 'judge'
    AND u.court_access = m.court_number
  )
);

CREATE POLICY "public_read_users" ON users FOR SELECT USING (true);

-- ============================================================
-- REALTIME ENABLEMENT (run after schema)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE athletes;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE judge_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE score_events;

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO tournaments (id, slug, name, location, date, status, courts_count) VALUES
('11111111-1111-1111-1111-111111111111', 'mombasa-open-2026', 'Mombasa Open 2026', 'Mombasa, Kenya', '2026-12-10', 'upcoming', 2);

INSERT INTO events (id, tournament_id, name, category, gender, age_group, weight_class, match_duration_seconds, break_duration_seconds, max_fouls, rounds_count, status) VALUES
('e0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Fin Weight', 'sparring_kumite', 'male', '18-35', 'fin_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Fly Weight', 'sparring_kumite', 'male', '18-35', 'fly_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Bantam Weight', 'sparring_kumite', 'male', '18-35', 'bantam_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Feather Weight', 'sparring_kumite', 'male', '18-35', 'feather_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Light Weight', 'sparring_kumite', 'male', '18-35', 'light_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Welter Weight', 'sparring_kumite', 'male', '18-35', 'welter_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Middle Weight', 'sparring_kumite', 'male', '18-35', 'middle_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Heavy Weight', 'sparring_kumite', 'male', '18-35', 'heavy_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Super Heavy Weight', 'sparring_kumite', 'male', '18-35', 'super_heavy_weight', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Men 18-35 Super Heavy Weight Level 1', 'sparring_kumite', 'male', '18-35', 'super_heavy_weight_l1', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'Men 36-49 / Ladies 18-49 Fly Weight', 'sparring_kumite', 'mixed', '18-49', 'fly_weight_2', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-00000000000c', '11111111-1111-1111-1111-111111111111', 'Men 36-49 / Ladies 18-49 Middle Weight', 'sparring_kumite', 'mixed', '18-49', 'middle_weight_2', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-00000000000d', '11111111-1111-1111-1111-111111111111', 'Men 36-49 / Ladies 18-49 Heavy Weight', 'sparring_kumite', 'mixed', '18-49', 'heavy_weight_2', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111', 'Men 36-49 / Ladies 18-49 Super Heavy Weight', 'sparring_kumite', 'mixed', '18-49', 'super_heavy_weight_2', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-00000000000f', '11111111-1111-1111-1111-111111111111', 'Men 36-49 / Ladies 18-49 Super Heavy Weight Level 0', 'sparring_kumite', 'mixed', '18-49', 'super_heavy_weight_l0', 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'Individual Form / Bon / Kata', 'form_bon_kata', 'mixed', 'all', NULL, 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'Individual Special Techniques', 'special_techniques', 'mixed', 'all', NULL, 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'Individual All Inclusive', 'two_or_three_categories', 'mixed', 'all', NULL, 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', 'Team Form / Bon / Kata', 'team_form_bon_kata', 'mixed', 'all', NULL, 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'Team Special Techniques', 'team_special_techniques', 'mixed', 'all', NULL, 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', 'Team All Inclusive', 'team_two_categories', 'mixed', 'all', NULL, 180, 30, 3, 1, 'upcoming'),
('e0000001-0000-0000-0000-000000000016', '11111111-1111-1111-1111-111111111111', 'Team Sparring (5 Persons – Open Weight)', 'team_sparring_5_person', 'male', 'all', 'open_weight', 180, 30, 3, 1, 'upcoming');

INSERT INTO athletes (id, event_id, name, team, country_code, seed, lot_number) VALUES
('a0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000006', 'John Kamau', 'Kenya', 'KE', 1, 1),
('a0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000006', 'Lee Min-Jun', 'South Korea', 'KR', 16, 16),
('a0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000006', 'Wambua Otieno', 'Kenya', 'KE', 8, 8),
('a0000001-0000-0000-0000-000000000004', 'e0000001-0000-0000-0000-000000000006', 'Tanaka Hiroshi', 'Japan', 'JP', 9, 9),
('a0000001-0000-0000-0000-000000000005', 'e0000001-0000-0000-0000-000000000006', 'Paul Ochieng', 'Kenya', 'KE', 5, 5),
('a0000001-0000-0000-0000-000000000006', 'e0000001-0000-0000-0000-000000000006', 'David Mutua', 'Kenya', 'KE', 12, 12),
('a0000001-0000-0000-0000-000000000007', 'e0000001-0000-0000-0000-000000000006', 'Eric Njoroge', 'Kenya', 'KE', 4, 4),
('a0000001-0000-0000-0000-000000000008', 'e0000001-0000-0000-0000-000000000006', 'Max Weber', 'Germany', 'DE', 13, 13),
('a0000001-0000-0000-0000-000000000009', 'e0000001-0000-0000-0000-000000000006', 'Ethan Rossi', 'Italy', 'IT', 3, 3),
('a0000001-0000-0000-0000-00000000000a', 'e0000001-0000-0000-0000-000000000006', 'Eason Wang', 'China', 'CN', 14, 14),
('a0000001-0000-0000-0000-00000000000b', 'e0000001-0000-0000-0000-000000000006', 'FAW Hassan', 'Egypt', 'EG', 6, 6),
('a0000001-0000-0000-0000-00000000000c', 'e0000001-0000-0000-0000-000000000006', 'Park Ji-Soo', 'South Korea', 'KR', 11, 11),
('a0000001-0000-0000-0000-00000000000d', 'e0000001-0000-0000-0000-000000000006', 'Alex Dupont', 'France', 'FR', 7, 7),
('a0000001-0000-0000-0000-00000000000e', 'e0000001-0000-0000-0000-000000000006', 'Ivan Petrov', 'Russia', 'RU', 10, 10),
('a0000001-0000-0000-0000-00000000000f', 'e0000001-0000-0000-0000-000000000006', 'Samuel Oduor', 'Kenya', 'KE', 2, 2),
('a0000001-0000-0000-0000-000000000010', 'e0000001-0000-0000-0000-000000000006', 'Chris Brown', 'USA', 'US', 15, 15);

-- Users are seeded via scripts/seed-users.mjs, not here, because they need real bcrypt hashes and Auth linking.

-- ============================================================
-- LOGIN CREDENTIALS (Demo)
-- ============================================================
-- Admin:              PIN 800811
-- Court A Controller: PIN 8118111
-- Court A Judge 1-4:  PIN 8118112, 8118113, 8118114, 8118115
-- Court B Controller: PIN 822822
-- Court B Judge 1-4:  PIN 8228221, 8228222, 8228223, 8228224

-- ============================================================
-- ROUTE STRUCTURE (for Next.js App Router)
-- ============================================================
-- /                          → Redirects to /scoreboard (default landing)
-- /scoreboard                → Public split view (both courts)
-- /scoreboard/[court]        → Public single court display
-- /t/[slug]/scoreboard       → Tournament-specific scoreboard
-- /t/[slug]/scoreboard/[court] → Tournament-specific court display
-- /t/[slug]/judge/[court]    → Judge tablet (4 judges per court)
-- /t/[slug]/controller/[court] → Controller tablet
-- /setup                     → Admin setup page (tournament creation)
-- /setup/admin               → Admin dashboard
-- /setup/admin/athletes      → Athlete registration
-- /setup/admin/draw          → Auto-draw & bracket
-- /setup/admin/matches       → Match management
-- /setup/admin/results       → Reports
-- /bracket                   → Public bracket (auto-detects active tournament)
-- /t/[slug]/bracket          → Tournament-specific bracket