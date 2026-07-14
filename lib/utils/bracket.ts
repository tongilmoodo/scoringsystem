import type { Athlete, Match, Side } from '@/lib/types';

export type Round = Match['round'];

const ROUND_SEQUENCES: Record<number, Round[]> = {
  16: ['round_of_16', 'quarter_final', 'semi_final', 'final'],
  8: ['quarter_final', 'semi_final', 'final'],
  4: ['semi_final', 'final'],
  2: ['final'],
};

export interface DrawMatchRow {
  id: string;
  event_id: string;
  court_number: number | null;
  round: Round;
  match_number: number;
  blue_athlete_id: string | null;
  red_athlete_id: string | null;
  status: 'scheduled' | 'completed';
  winner_id: string | null;
  win_method: 'withdrawal' | null;
  next_match_id: string | null;
  next_match_position: Side | null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generates a single-elimination bracket for 2-16 athletes.
 * - Random lot numbers.
 * - Byes go to the highest seeds first (seed 1 = best) and auto-advance.
 * - Every match is linked to its next match via next_match_id / position so
 *   winners propagate automatically when a match completes.
 *
 * Returns rounds ordered first-round-first. Insert them in REVERSE order so
 * next_match_id foreign keys already exist.
 */
export function generateBracket(eventId: string, athletes: Athlete[]) {
  const n = athletes.length;
  if (n < 2) throw new Error('Need at least 2 athletes');
  if (n > 16) throw new Error('Maximum 16 athletes per bracket');
  const size = n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 16;
  const byes = size - n;

  const bySeed = [...athletes].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
  const byeAthletes = bySeed.slice(0, byes);
  const restShuffled = shuffle(bySeed.slice(byes));

  // First-round pairs: bye pairs plus randomly drawn pairs, in random order.
  const pairs: [Athlete, Athlete | null][] = byeAthletes.map((a) => [a, null] as [Athlete, null]);
  for (let i = 0; i < restShuffled.length; i += 2) {
    pairs.push([restShuffled[i], restShuffled[i + 1] ?? null]);
  }
  const orderedPairs = shuffle(pairs);

  // Lot numbers follow slot order.
  const lots: { id: string; lot_number: number }[] = [];
  orderedPairs.forEach((p, i) => {
    lots.push({ id: p[0].id, lot_number: i * 2 + 1 });
    if (p[1]) lots.push({ id: p[1].id, lot_number: i * 2 + 2 });
  });

  const roundNames = ROUND_SEQUENCES[size];
  const rounds: DrawMatchRow[][] = roundNames.map((round, r) =>
    Array.from({ length: size / Math.pow(2, r + 1) }, () => ({
      id: crypto.randomUUID(),
      event_id: eventId,
      court_number: null,
      round,
      match_number: 0,
      blue_athlete_id: null,
      red_athlete_id: null,
      status: 'scheduled' as const,
      winner_id: null,
      win_method: null,
      next_match_id: null,
      next_match_position: null,
    }))
  );

  // Number matches and link each one to its next match.
  let matchNumber = 1;
  for (let r = 0; r < rounds.length; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      const m = rounds[r][i];
      m.match_number = matchNumber++;
      if (r + 1 < rounds.length) {
        const next = rounds[r + 1][Math.floor(i / 2)];
        m.next_match_id = next.id;
        m.next_match_position = i % 2 === 0 ? 'blue' : 'red';
      }
    }
  }

  // Populate the first round; resolve byes by auto-advancing the athlete.
  orderedPairs.forEach((pair, i) => {
    const m = rounds[0][i];
    m.blue_athlete_id = pair[0].id;
    m.red_athlete_id = pair[1]?.id ?? null;
    m.court_number = (i % 2) + 1; // alternate Court A / Court B
    if (!pair[1]) {
      m.status = 'completed';
      m.winner_id = pair[0].id;
      m.win_method = 'withdrawal'; // recorded as a walkover
      const next = rounds[1]?.[Math.floor(i / 2)];
      if (next) {
        if (i % 2 === 0) next.blue_athlete_id = pair[0].id;
        else next.red_athlete_id = pair[0].id;
      }
    }
  });

  return { lots, rounds };
}
