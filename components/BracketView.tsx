'use client';

import { getFlagEmoji } from '@/lib/countries';
import { ROUND_LABELS, type Match } from '@/lib/types';

const ORDER: Match['round'][] = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'];

// Colour code: scheduled = gray, live = green, completed = blue.
function color(status: string) {
  if (status === 'completed') return 'border-blue-500 bg-blue-950';
  if (status === 'live' || status === 'paused') return 'border-green-500 bg-green-950';
  return 'border-gray-700 bg-gray-900';
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Detect if a draw is for a Form / Solo event (all matches have no red athlete) */
function isFormDraw(matches: Match[]) {
  return matches.length > 0 && matches.every((m) => m.red_athlete_id === null);
}

/** Solo leaderboard for Form / Special Techniques events */
function FormLeaderboardView({ matches, onSelect }: { matches: Match[]; onSelect?: (m: Match) => void }) {
  const sorted = [...matches].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return -1;
    if (a.status !== 'completed' && b.status === 'completed') return 1;
    return b.blue_score - a.blue_score || a.match_number - b.match_number;
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-xs uppercase tracking-widest text-gray-400 mb-2">
        Solo Performance Draw — {matches.length} athlete{matches.length !== 1 ? 's' : ''}
      </p>
      {sorted.map((m, i) => {
        const isCompleted = m.status === 'completed';
        return (
          <button
            key={m.id}
            onClick={() => onSelect?.(m)}
            className={`rounded-lg border p-3 text-left text-sm ${color(m.status)} ${
              onSelect ? 'hover:border-white' : 'cursor-default'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-8 text-center font-bold text-yellow-400 text-lg">
                {isCompleted ? (MEDALS[i] ?? `#${i + 1}`) : `#${m.match_number}`}
              </span>
              <span className="flex-1 text-blue-400 font-bold">
                {m.blue?.country_code ? `${getFlagEmoji(m.blue.country_code)} ` : ''}
                {m.blue?.name ?? 'TBD'}
              </span>
              <span className="text-xs text-gray-400 uppercase">{m.status}</span>
              {isCompleted && (
                <span className="font-mono font-bold tabular-nums text-white">
                  {(m.blue_score / 10).toFixed(1)}
                </span>
              )}
            </div>
            {m.court_number && (
              <p className="mt-1 text-xs text-gray-500">
                Court {m.court_number === 1 ? 'A' : 'B'}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function BracketView({
  matches,
  onSelect,
}: {
  matches: Match[];
  onSelect?: (m: Match) => void;
}) {
  if (matches.length === 0) return <p className="text-gray-500">No bracket generated yet.</p>;

  // Form / Solo events get their own leaderboard-style view
  if (isFormDraw(matches)) {
    return <FormLeaderboardView matches={matches} onSelect={onSelect} />;
  }

  // Standard sparring elimination bracket
  const rounds = ORDER.filter((r) => matches.some((m) => m.round === r));
  return (
    <div className="flex gap-6 overflow-x-auto pb-4">
      {rounds.map((r) => (
        <div key={r} className="flex min-w-[240px] flex-col justify-around gap-3">
          <h3 className="text-center text-sm font-bold text-gray-400">{ROUND_LABELS[r]}</h3>
          {matches
            .filter((m) => m.round === r)
            .sort((a, b) => a.match_number - b.match_number)
            .map((m) => (
              <button
                key={m.id}
                onClick={() => onSelect?.(m)}
                className={`rounded-lg border p-3 text-left text-sm ${color(m.status)} ${
                  onSelect ? 'hover:border-white' : 'cursor-default'
                }`}
              >
                <p className="mb-1 text-xs text-gray-400">
                  #{m.match_number} · {m.status}
                  {m.court_number ? ` · Court ${m.court_number === 1 ? 'A' : 'B'}` : ''}
                </p>
                <p className={m.winner_id && m.winner_id === m.blue_athlete_id ? 'font-black' : ''}>
                  <span className="text-blue-400">{m.blue?.country_code ? `${getFlagEmoji(m.blue.country_code)} ` : ''}{m.blue?.name ?? 'TBD'}</span>
                  <span className="float-right tabular-nums">{m.blue_score}</span>
                </p>
                <p className={m.winner_id && m.winner_id === m.red_athlete_id ? 'font-black' : ''}>
                  <span className="text-red-400">{m.red?.country_code ? `${getFlagEmoji(m.red.country_code)} ` : ''}{m.red?.name ?? 'TBD'}</span>
                  <span className="float-right tabular-nums">{m.red_score}</span>
                </p>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
