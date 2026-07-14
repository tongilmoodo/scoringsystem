'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import PinPad from '@/components/PinPad';
import { countryName, getFlagEmoji } from '@/lib/countries';
import { ATHLETE_SELECT, formatTime, ROUND_LABELS, type Match } from '@/lib/types';

const ROUNDS = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'] as const;
const STATUSES = ['scheduled', 'assigned', 'live', 'paused', 'completed'] as const;

export default function MatchesPage() {
  const { user, ready, login, logout } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [roundFilter, setRoundFilter] = useState('');
  const [courtFilter, setCourtFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('matches').select(ATHLETE_SELECT).order('match_number');
    setMatches((data ?? []) as Match[]);
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

  useEffect(() => {
    const ch = supabase
      .channel('admin-matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  async function assign(m: Match, court: number) {
    await supabase.from('matches').update({ court_number: court, status: 'assigned' }).eq('id', m.id);
  }

  async function resetMatch(m: Match) {
    if (!confirm(`Reset match #${m.match_number}? All scores will be cleared.`)) return;
    await supabase.from('score_events').delete().eq('match_id', m.id);
    await supabase
      .from('matches')
      .update({
        blue_score: 0,
        red_score: 0,
        blue_fouls: 0,
        red_fouls: 0,
        status: 'scheduled',
        winner_id: null,
        win_method: null,
        timer_seconds: m.max_time,
        timer_started_at: null,
      })
      .eq('id', m.id);
  }

  if (!ready) return null;
  if (!user) return <PinPad title="Admin Login" onSubmit={login} />;
  if (user.role !== 'admin') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Admin access required.</p>
        <button onClick={logout} className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Switch user</button>
      </main>
    );
  }

  const filtered = matches.filter(
    (m) =>
      (!roundFilter || m.round === roundFilter) &&
      (!courtFilter || String(m.court_number) === courtFilter) &&
      (!statusFilter || m.status === statusFilter)
  );

  const winnerName = (m: Match) =>
    m.winner_id === m.blue_athlete_id ? m.blue?.name : m.winner_id === m.red_athlete_id ? m.red?.name : '';

  const select = 'rounded-lg border border-gray-700 bg-gray-800 px-3 py-2';

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      {/* Interactive view (hidden when printing) */}
      <div className="print:hidden">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black">Matches</h1>
          <div className="flex gap-3 text-sm">
            <button onClick={() => window.print()} className="rounded-lg bg-green-700 px-4 py-2 font-bold">
              Print match sheets
            </button>
            <Link href="/admin" className="rounded-lg bg-gray-800 px-4 py-2 font-bold">← Dashboard</Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <select className={select} value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)}>
            <option value="">All rounds</option>
            {ROUNDS.map((r) => (
              <option key={r} value={r}>{ROUND_LABELS[r]}</option>
            ))}
          </select>
          <select className={select} value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)}>
            <option value="">All courts</option>
            <option value="1">Court A</option>
            <option value="2">Court B</option>
          </select>
          <select className={select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Round</th>
                <th className="p-3">Blue</th>
                <th className="p-3">Red</th>
                <th className="p-3">Score</th>
                <th className="p-3">Court</th>
                <th className="p-3">Status</th>
                <th className="p-3">Winner</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="p-3">{m.match_number}</td>
                  <td className="p-3">{ROUND_LABELS[m.round]}</td>
                  <td className="p-3 text-blue-400">{m.blue?.country_code ? `${getFlagEmoji(m.blue.country_code)} ` : ''}{m.blue?.name ?? 'TBD'}</td>
                  <td className="p-3 text-red-400">{m.red?.country_code ? `${getFlagEmoji(m.red.country_code)} ` : ''}{m.red?.name ?? 'TBD'}</td>
                  <td className="p-3 tabular-nums">{m.blue_score} : {m.red_score}</td>
                  <td className="p-3">{m.court_number ? (m.court_number === 1 ? 'A' : 'B') : '-'}</td>
                  <td className="p-3">{m.status}</td>
                  <td className="p-3">{winnerName(m)} {m.win_method ? `(${m.win_method})` : ''}</td>
                  <td className="p-3">
                    {m.status === 'scheduled' && (
                      <>
                        <button onClick={() => assign(m, 1)} className="mr-2 text-green-400 underline">→ A</button>
                        <button onClick={() => assign(m, 2)} className="mr-2 text-green-400 underline">→ B</button>
                      </>
                    )}
                    {['live', 'paused', 'assigned'].includes(m.status) && (
                      <Link href="/admin" className="mr-2 text-yellow-400 underline">Override</Link>
                    )}
                    <button onClick={() => resetMatch(m)} className="text-red-400 underline">Reset</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print-only official match sheets */}
      <div className="hidden print:block">
        {filtered.map((m) => (
          <div key={m.id} className="print-sheet">
            <h1 style={{ fontSize: 20, fontWeight: 900, textAlign: 'center' }}>
              Mombasa Open Tong-Il Moo-Do — Official Match Sheet
            </h1>
            <p style={{ textAlign: 'center', marginBottom: 16 }}>
              {ROUND_LABELS[m.round]} · Match #{m.match_number} · Court{' '}
              {m.court_number ? (m.court_number === 1 ? 'A' : 'B') : '____'} · Time remaining: {formatTime(m.timer_seconds)}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #000', padding: 8 }}>Side</th>
                  <th style={{ border: '1px solid #000', padding: 8 }}>Athlete</th>
                  <th style={{ border: '1px solid #000', padding: 8 }}>Team / Country</th>
                  <th style={{ border: '1px solid #000', padding: 8 }}>Score</th>
                  <th style={{ border: '1px solid #000', padding: 8 }}>Fouls</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #000', padding: 8, fontWeight: 700 }}>BLUE</td>
                  <td style={{ border: '1px solid #000', padding: 8 }}>{m.blue?.name ?? 'TBD'}</td>
                  <td style={{ border: '1px solid #000', padding: 8 }}>{m.blue?.team} {m.blue?.country_code ? `(${countryName(m.blue.country_code)})` : ''}</td>
                  <td style={{ border: '1px solid #000', padding: 8, textAlign: 'center' }}>{m.blue_score}</td>
                  <td style={{ border: '1px solid #000', padding: 8, textAlign: 'center' }}>{m.blue_fouls}</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #000', padding: 8, fontWeight: 700 }}>RED</td>
                  <td style={{ border: '1px solid #000', padding: 8 }}>{m.red?.name ?? 'TBD'}</td>
                  <td style={{ border: '1px solid #000', padding: 8 }}>{m.red?.team} {m.red?.country_code ? `(${countryName(m.red.country_code)})` : ''}</td>
                  <td style={{ border: '1px solid #000', padding: 8, textAlign: 'center' }}>{m.red_score}</td>
                  <td style={{ border: '1px solid #000', padding: 8, textAlign: 'center' }}>{m.red_fouls}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ marginTop: 16 }}>
              Winner: <strong>{winnerName(m) || '______________________'}</strong>
              {m.win_method ? ` by ${m.win_method}` : ' by ______________'}
            </p>
            <div style={{ display: 'flex', gap: 48 }}>
              <p className="signature-line">Referee signature</p>
              <p className="signature-line">Chief official signature</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
