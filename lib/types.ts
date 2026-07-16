export type Side = 'blue' | 'red';
export type Role = 'admin' | 'controller' | 'judge';
export type ScoreActionType = 'point_1' | 'point_2' | 'point_3' | 'foul';

export interface Tournament {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  date: string | null;
  status: 'upcoming' | 'live' | 'completed';
  courts_count: number;
  logo_url?: string | null;
}

export interface EventRecord {
  id: string;
  tournament_id: string;
  name: string;
  category: string;
  gender: string;
  age_group: string;
  weight_class: string | null;
  division: string | null;
  belt_rank: string | null;
  rounds: number;
  round_duration_seconds: number;
  description?: string | null;
  status: string;
  bracket_status: 'draft' | 'published';
}

export interface Athlete {
  id: string;
  event_id: string;
  name: string;
  team: string | null;
  country_code: string | null;
  photo_url?: string | null;
  seed: number | null;
  lot_number: number | null;
}

export interface Match {
  id: string;
  event_id: string;
  court_number: number | null;
  round: 'round_of_32' | 'round_of_16' | 'quarter_final' | 'semi_final' | 'third_place' | 'final';
  match_number: number;
  current_round: number;
  blue_athlete_id: string | null;
  red_athlete_id: string | null;
  blue_score: number;
  red_score: number;
  blue_fouls: number;
  red_fouls: number;
  status: 'scheduled' | 'assigned' | 'live' | 'paused' | 'break' | 'takedown' | 'completed';
  winner_id: string | null;
  win_method: 'points' | 'ko' | 'tko' | 'disqualification' | 'withdrawal' | 'forfeit' | null;
  timer_seconds: number;
  max_time: number;
  break_timer_seconds: number;
  takedown_timer_seconds: number;
  timer_before_takedown?: number | null;
  timer_started_at: string | null;
  timer_paused_at?: string | null;
  total_rounds?: number;
  break_started_at?: string | null;
  round_scores?: Record<string, { blue: number; red: number }> | null;
  ended_at?: string | null;
  updated_at?: string | null;
  tournament_id?: string | null;
  tko_available?: boolean | null;
  next_match_id: string | null;
  next_match_position: Side | null;
  blue?: Athlete | null;
  red?: Athlete | null;
  events?: EventRecord | null;
}

export interface JudgeVote {
  id: string;
  match_id: string;
  judge_id: string;
  player_side: Side;
  action_type: ScoreActionType | 'win_blue' | 'win_red';
  points: number;
  status: 'pending' | 'committed' | 'cleared';
  created_at: string;
}

export interface ScoreEvent {
  id: string;
  match_id: string;
  athlete_id?: string | null;
  player_side: Side;
  action_type: ScoreActionType | 'win_blue' | 'win_red';
  points: number;
  match_time_seconds: number | null;
  takedown: boolean;
  scored_by: string | null;
  created_at: string;
}

export interface CastVoteResult {
  success?: boolean;
  committed?: boolean;
  // Legacy error keys (older cast_vote) + new code/error strings.
  error?: string;
  code?: 'MATCH_NOT_FOUND' | 'MATCH_NOT_ACTIVE' | string;
  current_status?: string;
  action?: string;
  action_display?: string;
  points?: number;
  votes?: number;
  top_action?: string;
  top_votes?: number;
  total_votes?: number;
  threshold?: number;
  side?: Side;
  player_side?: Side;
  message?: string;
  takedown?: boolean;
}

export const ROUND_LABELS: Record<Match['round'], string> = {
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter Final',
  semi_final: 'Semi Final',
  third_place: 'Third Place',
  final: 'Final',
};

// Controller/admin-facing labels (technique detail is allowed here).
export const ACTION_LABELS: Record<ScoreActionType, string> = {
  point_1: '+1 Punch',
  point_2: '+2 Kick',
  point_3: '+3 Spin',
  foul: 'Foul',
};

// Judge-facing labels: POINT VALUE ONLY, no technique names.
export const JUDGE_LABELS: Record<ScoreActionType, string> = {
  point_1: '1 Point',
  point_2: '2 Points',
  point_3: '3 Points',
  foul: 'Foul',
};

export interface BroadcastMessage {
  id: string;
  tournament_id: string;
  message: string;
  created_at: string;
  read_by: string[];
}

export interface AuditEntry {
  action: string;
  user: string;
  timestamp: string;
  note?: string;
}

export const ATHLETE_SELECT =
  '*, blue:athletes!matches_blue_athlete_id_fkey(*), red:athletes!matches_red_athlete_id_fkey(*)';

export function formatTime(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
