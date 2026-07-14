export type Side = 'blue' | 'red';

export interface Athlete {
  id: string;
  event_id: string;
  name: string;
  team: string | null;
  country_code: string | null;
  seed: number | null;
  lot_number: number | null;
}

export interface Match {
  id: string;
  event_id: string;
  court_number: number | null;
  round: 'round_of_16' | 'quarter_final' | 'semi_final' | 'final';
  match_number: number;
  blue_athlete_id: string | null;
  red_athlete_id: string | null;
  blue_score: number;
  red_score: number;
  blue_fouls: number;
  red_fouls: number;
  status: 'scheduled' | 'assigned' | 'live' | 'paused' | 'completed';
  winner_id: string | null;
  win_method: 'points' | 'ko' | 'disqualification' | 'withdrawal' | null;
  timer_seconds: number;
  max_time: number;
  timer_started_at: string | null;
  next_match_id: string | null;
  next_match_position: Side | null;
  blue?: Athlete | null;
  red?: Athlete | null;
}

export interface ScoreEvent {
  id: string;
  match_id: string;
  player_side: Side;
  action_type: 'point_1' | 'point_2' | 'point_3' | 'foul';
  points: number;
  match_time_seconds: number;
  scored_by: string | null;
  created_at: string;
}

export const ROUND_LABELS: Record<Match['round'], string> = {
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter Final',
  semi_final: 'Semi Final',
  final: 'Final',
};

export const ATHLETE_SELECT =
  '*, blue:athletes!matches_blue_athlete_id_fkey(*), red:athletes!matches_red_athlete_id_fkey(*)';

export function formatTime(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
