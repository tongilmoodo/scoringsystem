'use client';

import { ROUND_LABELS, type Match } from '@/lib/types';

const ORDER: Match['round'][] = ['round_of_16', 'quarter_final', 'semi_final', 'final'];

// Colour code: scheduled = gray, live = green, completed = blue.
function color(status: string) {
  if (status === 'completed') return 'border-blue-500 bg-blue-950';
  if (status === 'live' || status === 'paused') return 'border-green-500 bg-green-950';
  return 'border-gray-700 bg-gray-900';
}

export default function BracketView({
  matches,
  onSelect,
}: {
  matches: Match[];
  onSelect?: (m: Match) => void;
}) {
  if (matches.length === 0) return <p className="text-gray-500">No bracket generated yet.</p>;
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
                  <span className="text-blue-400">{m.blue?.name ?? 'TBD'}</span>
                  <span className="float-right tabular-nums">{m.blue_score}</span>
                </p>
                <p className={m.winner_id && m.winner_id === m.red_athlete_id ? 'font-black' : ''}>
                  <span className="text-red-400">{m.red?.name ?? 'TBD'}</span>
                  <span className="float-right tabular-nums">{m.red_score}</span>
                </p>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
