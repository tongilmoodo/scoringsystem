-- Mombasa Open Tong-Il Moo-Do Scoring System
-- Run this file in the Supabase SQL editor, then run `npm run seed:users` locally.

create extension if not exists "pgcrypto";

-- ENUMS -----------------------------------------------------------------
create type tournament_status as enum ('upcoming','live','completed');
create type match_round as enum ('round_of_16','quarter_final','semi_final','final');
create type match_status as enum ('scheduled','assigned','live','paused','completed');
create type win_method as enum ('points','ko','disqualification','withdrawal');
create type player_side as enum ('blue','red');
create type score_action as enum ('point_1','point_2','point_3','foul');
create type user_role as enum ('admin','scorer');

-- TABLES ----------------------------------------------------------------
create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date,
  status tournament_status not null default 'upcoming',
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  match_duration_seconds int not null default 180,
  max_fouls int not null default 3,
  status text default 'upcoming',
  created_at timestamptz not null default now()
);

create table athletes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  team text,
  country_code text,
  seed int,
  lot_number int,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  court_number int check (court_number in (1,2)),
  round match_round not null,
  match_number int not null,
  blue_athlete_id uuid references athletes(id),
  red_athlete_id uuid references athletes(id),
  blue_score int not null default 0,
  red_score int not null default 0,
  blue_fouls int not null default 0,
  red_fouls int not null default 0,
  status match_status not null default 'scheduled',
  winner_id uuid references athletes(id),
  win_method win_method,
  timer_seconds int not null default 180,
  max_time int not null default 180,
  timer_started_at timestamptz,
  next_match_id uuid references matches(id),
  next_match_position player_side,
  created_at timestamptz not null default now()
);

create table score_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_side player_side not null,
  action_type score_action not null,
  points int not null default 0,
  match_time_seconds int not null default 0,
  scored_by text,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key, -- equals the Supabase auth user id
  name text not null,
  pin_hash text not null,
  role user_role not null,
  court_access int check (court_access in (1,2)),
  is_active boolean not null default true
);

-- HELPERS (security definer so RLS policies can consult the users table) --
create or replace function is_admin() returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from users u
    where u.id = auth.uid() and u.role = 'admin' and u.is_active
  );
$$;

create or replace function can_score_court(court int) returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from users u
    where u.id = auth.uid() and u.is_active
      and (u.role = 'admin' or u.court_access = court)
  );
$$;

-- ROW LEVEL SECURITY ------------------------------------------------------
alter table tournaments enable row level security;
alter table events enable row level security;
alter table athletes enable row level security;
alter table matches enable row level security;
alter table score_events enable row level security;
alter table users enable row level security;

-- Public read access (users is intentionally excluded: it stores PIN hashes.
-- PIN validation happens server-side with the service role key.)
create policy public_read_tournaments on tournaments for select using (true);
create policy public_read_events on events for select using (true);
create policy public_read_athletes on athletes for select using (true);
create policy public_read_matches on matches for select using (true);
create policy public_read_score_events on score_events for select using (true);

-- Court isolation: scorers may only touch matches on their own court.
create policy update_matches_by_court on matches for update
  using (can_score_court(court_number))
  with check (can_score_court(court_number));

create policy insert_score_events_by_court on score_events for insert
  with check (exists (
    select 1 from matches m
    where m.id = match_id and can_score_court(m.court_number)
  ));

-- Needed for Undo
create policy delete_score_events_by_court on score_events for delete
  using (exists (
    select 1 from matches m
    where m.id = match_id and can_score_court(m.court_number)
  ));

-- Admin full control
create policy admin_all_tournaments on tournaments for all using (is_admin()) with check (is_admin());
create policy admin_all_events on events for all using (is_admin()) with check (is_admin());
create policy admin_all_athletes on athletes for all using (is_admin()) with check (is_admin());
create policy admin_insert_matches on matches for insert with check (is_admin());
create policy admin_delete_matches on matches for delete using (is_admin());

-- REALTIME ---------------------------------------------------------------
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table score_events;

-- SEED DATA: demo tournament, 16 athletes, 8 round-of-16 matches ----------
insert into tournaments (id, name, date, status) values
  ('11111111-1111-1111-1111-111111111111', 'Mombasa Open 2026', '2026-08-15', 'live');

insert into events (id, tournament_id, name) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Men Sparring -75kg');

insert into athletes (id, event_id, name, team, country_code, seed, lot_number) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Juma Otieno', 'Mombasa TMD', 'KE', 1, 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Brian Kiptoo', 'Nairobi TMD', 'KE', 2, 2),
  ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Amani Said', 'Dar es Salaam TMD', 'TZ', 3, 3),
  ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'David Okello', 'Kampala TMD', 'UG', 4, 4),
  ('aaaaaaaa-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Pierre Dubois', 'Paris TMD', 'FR', 5, 5),
  ('aaaaaaaa-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'Carlos Mendez', 'Madrid TMD', 'ES', 6, 6),
  ('aaaaaaaa-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'Hassan Ali', 'Malindi TMD', 'KE', 7, 7),
  ('aaaaaaaa-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'Peter Mwangi', 'Nakuru TMD', 'KE', 8, 8),
  ('aaaaaaaa-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'John Baraka', 'Arusha TMD', 'TZ', 9, 9),
  ('aaaaaaaa-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', 'Samuel Ochieng', 'Kisumu TMD', 'KE', 10, 10),
  ('aaaaaaaa-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222', 'Louis Martin', 'Lyon TMD', 'FR', 11, 11),
  ('aaaaaaaa-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222', 'Miguel Torres', 'Barcelona TMD', 'ES', 12, 12),
  ('aaaaaaaa-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222', 'Ibrahim Noor', 'Lamu TMD', 'KE', 13, 13),
  ('aaaaaaaa-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222', 'Joseph Kamau', 'Thika TMD', 'KE', 14, 14),
  ('aaaaaaaa-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222', 'Emmanuel Ssali', 'Entebbe TMD', 'UG', 15, 15),
  ('aaaaaaaa-0000-0000-0000-000000000016', '22222222-2222-2222-2222-222222222222', 'Ali Mohamed', 'Mombasa TMD', 'KE', 16, 16);

insert into matches (id, event_id, court_number, round, match_number, blue_athlete_id, red_athlete_id, status) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 1, 'round_of_16', 1, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'assigned'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 2, 'round_of_16', 2, 'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000004', 'assigned'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 1, 'round_of_16', 3, 'aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000006', 'scheduled'),
  ('bbbbbbbb-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 2, 'round_of_16', 4, 'aaaaaaaa-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000008', 'scheduled'),
  ('bbbbbbbb-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 1, 'round_of_16', 5, 'aaaaaaaa-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000010', 'scheduled'),
  ('bbbbbbbb-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 2, 'round_of_16', 6, 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000012', 'scheduled'),
  ('bbbbbbbb-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 1, 'round_of_16', 7, 'aaaaaaaa-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000014', 'scheduled'),
  ('bbbbbbbb-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 2, 'round_of_16', 8, 'aaaaaaaa-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000016', 'scheduled');
