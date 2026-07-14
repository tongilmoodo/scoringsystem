'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import PinPad from '@/components/PinPad';
import { ATHLETE_SELECT, formatTime, ROUND_LABELS, type Match, type ScoreEvent } from '@/lib/types';

export default function AdminPage() {
  const { user, ready, login, logout } = useAuth();
  const [courtMatches, setCourtMatches] = useState<Record<number, Match | null>>({ 1: null, 2: null });
  const [scheduled, setScheduled] = useState<Match[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);

  const load = useCallback(async () => {
    const [{ data: active }, { data: sched }, { data: evs }] = await Promise.all([
      supabase.from('matches').select(ATHLETE_SELECT).in('status', ['assigned', 'live', 'paused']),
      supabase.from('matches').select(ATHLETE_SELECT).eq('status', 'scheduled').order('match_number'),
      supabase.from('score_events').select('*').order('created_at', { ascending: false }).limit(15),
    ]);
    const map: Record<number, Match | null> = { 1: null, 2: null };
    (active ?? []).forEach((m) => {
      if (m.court_number) map[m.court_number] = m as Match;
    });
    setCourtMatches(map);
    setScheduled((sched ?? []) as Match[]);
    setEvents((evs ?? []) as ScoreEvent[]);
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

  useEffect(() => {
    const ch = supabase
      .channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_events' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  async function override(m: Match, col: 'blue_score' | 'red_score' | 'blue_fouls' | 'red_fouls', delta: number) {
    await supabase
      .from('matches')
      .update({ [col]: Math.max(0, (m as unknown as Record<string, number>)[col] + delta) })
      .eq('id', m.id);
  }

  async function assign(matchId: string, court: number) {
    if (courtMatches[court]) {
      alert(`Court ${court === 1 ? 'A' : 'B'} already has an active match.`);
      return;
    }
    await supabase.from('matches').update({ court_number: court, status: 'assigned' }).eq('id', matchId);
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

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Admin Dashboard</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/athletes" className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Manage Athletes</Link>
          <Link href="/scoreboard" className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Scoreboard</Link>
          <button onClick={logout} className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Logout ({user.name})</button>
        </div>
      </div>

      {/* Live court status with score override */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((court) => {
          const m = courtMatches[court];
          return (
            <div key={court} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h2 className="mb-2 font-bold">Court {court === 1 ? 'A' : 'B'}</h2>
              {!m ? (
                <p className="text-gray-500">No active match</p>
              ) : (
                <>
                  <p className="text-sm text-gray-400">
                    {ROUND_LABELS[m.round]} · Match {m.match_number} · {m.status.toUpperCase()} · {formatTime(m.timer_seconds)}
                  </p>
                  {(['blue', 'red'] as const).map((side) => {
                    const scoreCol = side === 'blue' ? 'blue_score' : 'red_score';
                    const foulCol = side === 'blue' ? 'blue_fouls' : 'red_fouls';
                    const athlete = side === 'blue' ? m.blue : m.red;
                    return (
                      <div key={side} className="mt-2 flex items-center justify-between gap-2">
                        <span className={side === 'blue' ? 'font-bold text-blue-400' : 'font-bold text-red-400'}>
                          {athlete?.name ?? 'TBD'}
                        </span>
                        <span className="flex items-center gap-1">
                          <button onClick={() => override(m, scoreCol, -1)} className="h-8 w-8 rounded bg-gray-700">-</button>
                          <span className="w-10 text-center text-xl font-black tabular-nums">
                            {side === 'blue' ? m.blue_score : m.red_score}
                          </span>
                          <button onClick={() => override(m, scoreCol, 1)} className="h-8 w-8 rounded bg-gray-700">+</button>
                          <span className="ml-2 text-xs text-gray-400">Fouls</span>
                          <button onClick={() => override(m, foulCol, -1)} className="h-8 w-8 rounded bg-gray-700">-</button>
                          <span className="w-6 text-center tabular-nums">{side === 'blue' ? m.blue_fouls : m.red_fouls}</span>
                          <button onClick={() => override(m, foulCol, 1)} className="h-8 w-8 rounded bg-gray-700">+</button>
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Scheduled matches: assign to a court */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 font-bold">Scheduled Matches</h2>
        {scheduled.length === 0 ? (
          <p className="text-gray-500">No scheduled matches</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {scheduled.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="text-gray-500">#{m.match_number}</span> {ROUND_LABELS[m.round]}:{' '}
                  <span className="text-blue-400">{m.blue?.name ?? 'TBD'}</span> vs{' '}
                  <span className="text-red-400">{m.red?.name ?? 'TBD'}</span>
                </span>
                <span className="flex gap-2">
                  <button onClick={() => assign(m.id, 1)} className="rounded bg-gray-700 px-3 py-1 text-sm font-bold">→ Court A</button>
                  <button onClick={() => assign(m.id, 2)} className="rounded bg-gray-700 px-3 py-1 text-sm font-bold">→ Court B</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* System log */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 font-bold">System Log</h2>
        {events.length === 0 ? (
          <p className="text-gray-500">No score events yet</p>
        ) : (
          <ul className="space-y-1 text-sm text-gray-300">
            {events.map((e) => (
              <li key={e.id}>
                <span className="text-gray-500">{new Date(e.created_at).toLocaleTimeString()}</span>{' '}
                {e.player_side.toUpperCase()} {e.action_type === 'foul' ? 'FOUL' : `+${e.points}`}
                {e.scored_by ? ` · by ${e.scored_by}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
