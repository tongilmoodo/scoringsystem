'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';
import Flag from '@/components/Flag';
import { countryName, getFlagEmoji } from '@/lib/countries';
import { ATHLETE_SELECT, ROUND_LABELS, type Match } from '@/lib/types';

interface MedalRow {
  country: string;
  gold: number;
  silver: number;
  bronze: number;
}

export default function ResultsPage() {
  const { user, ready, login, logout } = useAuth();
  const { tournament, ready: tournamentReady } = useActiveTournament();
  const [completed, setCompleted] = useState<Match[]>([]);

  const load = useCallback(async () => {
    if (!tournament) return;
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('tournament_id', tournament.id)
      .eq('status', 'completed')
      .order('match_number');
    setCompleted((data ?? []) as Match[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

  if (!ready || !tournamentReady) return null;
  if (!user) return <PinPad title="Admin Login" onSubmit={(pin) => login(pin)} />;
  if (user.role !== 'admin') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Admin access required.</p>
        <button onClick={logout} className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Switch user</button>
      </main>
    );
  }

  const winnerOf = (m: Match) => (m.winner_id === m.blue_athlete_id ? m.blue : m.red);
  const loserOf = (m: Match) => (m.winner_id === m.blue_athlete_id ? m.red : m.blue);

  // Medal table: final winner = gold, final loser = silver, SF losers = bronze.
  const medalMap: Record<string, MedalRow> = {};
  const add = (country: string | null | undefined, key: 'gold' | 'silver' | 'bronze') => {
    if (!country) return;
    medalMap[country] = medalMap[country] ?? { country, gold: 0, silver: 0, bronze: 0 };
    medalMap[country][key] += 1;
  };
  completed.forEach((m) => {
    if (!m.winner_id) return;
    if (m.round === 'final') {
      add(winnerOf(m)?.country_code, 'gold');
      add(loserOf(m)?.country_code, 'silver');
    }
    if (m.round === 'semi_final') add(loserOf(m)?.country_code, 'bronze');
  });
  const medals = Object.values(medalMap).sort(
    (a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze
  );

  // Excel export: CSV opens directly in Excel.
  function exportExcel() {
    const rows: (string | number)[][] = [
      ['Match', 'Round', 'Blue', 'Red', 'Blue Score', 'Red Score', 'Winner', 'Method'],
      ...completed.map((m) => [
        m.match_number,
        ROUND_LABELS[m.round],
        m.blue?.name ?? 'TBD',
        m.red?.name ?? 'TBD',
        m.blue_score,
        m.red_score,
        winnerOf(m)?.name ?? '',
        m.win_method ?? '',
      ]),
      [],
      ['Country', 'Gold', 'Silver', 'Bronze'],
      ...medals.map((r) => [r.country, r.gold, r.silver, r.bronze]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mombasa-open-results.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">No tournament selected.</p>
        <Link href="/admin" className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Choose a tournament</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-black">Results &amp; Reports</h1>
        <div className="flex gap-3 text-sm">
          <button onClick={() => window.print()} className="rounded-lg bg-green-700 px-4 py-2 font-bold">Export PDF (print)</button>
          <button onClick={exportExcel} className="rounded-lg bg-blue-700 px-4 py-2 font-bold">Export Excel (CSV)</button>
          <Link href="/admin" className="rounded-lg bg-gray-800 px-4 py-2 font-bold">← Dashboard</Link>
        </div>
      </div>

      {/* Medal table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 font-bold">Medal Table by Country</h2>
        {medals.length === 0 ? (
          <p className="text-gray-500">No finals or semi-finals completed yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-gray-400">
              <tr>
                <th className="p-2">Country</th>
                <th className="p-2">Gold</th>
                <th className="p-2">Silver</th>
                <th className="p-2">Bronze</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {medals.map((r) => (
                <tr key={r.country}>
                  <td className="p-2 font-bold">
                    <span className="inline-flex items-center gap-2">
                      <Flag code={r.country} size={22} />
                      {countryName(r.country)}
                    </span>
                  </td>
                  <td className="p-2 tabular-nums">{r.gold}</td>
                  <td className="p-2 tabular-nums">{r.silver}</td>
                  <td className="p-2 tabular-nums">{r.bronze}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Completed match results */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 font-bold">Completed Matches</h2>
        {completed.length === 0 ? (
          <p className="text-gray-500">No completed matches yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800 text-sm">
            {completed.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="text-gray-500">#{m.match_number}</span> {ROUND_LABELS[m.round]}:{' '}
                  <span className="text-blue-400">{m.blue?.country_code ? `${getFlagEmoji(m.blue.country_code)} ` : ''}{m.blue?.name ?? 'TBD'}</span> {m.blue_score} : {m.red_score}{' '}
                  <span className="text-red-400">{m.red?.country_code ? `${getFlagEmoji(m.red.country_code)} ` : ''}{m.red?.name ?? 'TBD'}</span>
                </span>
                <span className="font-bold">
                  {winnerOf(m)?.name} <span className="font-normal text-gray-400">by {m.win_method}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
