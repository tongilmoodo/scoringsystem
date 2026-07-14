export type Side = 'blue' | 'red';
export type Role = 'admin' | 'controller' | 'judge';
export type ScoreActionType = 'point_1' | 'point_2' | 'point_3' | 'foul';

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
  blue_athlete_id: string | null;
  red_athlete_id: string | null;
  blue_score: number;
  red_score: number;
  blue_fouls: number;
  red_fouls: number;
  status: 'scheduled' | 'assigned' | 'live' | 'paused' | 'completed';
  winner_id: string | null;
  win_method: 'points' | 'ko' | 'disqualification' | 'withdrawal' | 'forfeit' | null;
  timer_seconds: number;
  max_time: number;
  timer_started_at: string | null;
  timer_paused_at?: string | null;
  judges_locked: boolean;
  next_match_id: string | null;
  next_match_position: Side | null;
  blue?: Athlete | null;
  red?: Athlete | null;
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
  scored_by: string | null;
  created_at: string;
}

export interface CastVoteResult {
  committed: boolean;
  error?: 'already_voted' | 'locked' | 'match_completed';
  action?: string;
  votes?: number;
  top_action?: string;
  top_votes?: number;
  side?: Side;
}

export const ROUND_LABELS: Record<Match['round'], string> = {
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter Final',
  semi_final: 'Semi Final',
  third_place: 'Third Place',
  final: 'Final',
};

export const ACTION_LABELS: Record<ScoreActionType, string> = {
  point_1: '+1 Punch',
  point_2: '+2 Kick',
  point_3: '+3 Spin',
  foul: 'Foul',
};

export const ATHLETE_SELECT =
  '*, blue:athletes!matches_blue_athlete_id_fkey(*), red:athletes!matches_red_athlete_id_fkey(*)';

export function formatTime(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
