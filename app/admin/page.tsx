'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament, type ActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';
import Logo from '@/components/ui/Logo';
import { ATHLETE_SELECT, formatTime, ROUND_LABELS, type Match, type ScoreEvent, type Tournament } from '@/lib/types';

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const EMPTY_FORM = { name: '', date: '', location: '', courts_count: 2 };

export default function AdminPage() {
  const { user, ready, login, logout } = useAuth();
  const { tournament, ready: tournamentReady, setTournament } = useActiveTournament();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [courtMatches, setCourtMatches] = useState<Record<number, Match | null>>({ 1: null, 2: null });
  const [scheduled, setScheduled] = useState<Match[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);

  const loadTournaments = useCallback(async () => {
    const { data } = await supabase.from('tournaments').select('*').order('date', { ascending: false });
    setTournaments((data ?? []) as Tournament[]);
  }, []);

  const load = useCallback(async () => {
    if (!tournament) return;
    const [{ data: active }, { data: sched }, { data: evs }] = await Promise.all([
      supabase.from('matches').select(ATHLETE_SELECT).eq('tournament_id', tournament.id).in('status', ['assigned', 'live', 'paused']),
      supabase.from('matches').select(ATHLETE_SELECT).eq('tournament_id', tournament.id).eq('status', 'scheduled').order('match_number'),
      supabase
        .from('score_events')
        .select('*, match:matches!inner(tournament_id)')
        .eq('match.tournament_id', tournament.id)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);
    const map: Record<number, Match | null> = { 1: null, 2: null };
    (active ?? []).forEach((m) => {
      if (m.court_number) map[m.court_number] = m as Match;
    });
    setCourtMatches(map);
    setScheduled((sched ?? []) as Match[]);
    setEvents((evs ?? []) as ScoreEvent[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadTournaments();
      load();
    }
  }, [user, loadTournaments, load]);

  useEffect(() => {
    if (!tournament) return;
    const ch = supabase
      .channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_events' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, tournament?.id]);

  async function createTournament() {
    if (!form.name || !form.date) return;
    const slug = slugify(form.name);
    const { data, error } = await supabase
      .from('tournaments')
      .insert({ name: form.name, slug, date: form.date, location: form.location, courts_count: form.courts_count })
      .select()
      .single();
    if (error) {
      alert(`Failed to create tournament: ${error.message}`);
      return;
    }
    setForm(EMPTY_FORM);
    await loadTournaments();
    setTournament(data as ActiveTournament);
  }

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

  const input = 'rounded-lg border border-gray-700 bg-gray-800 px-3 py-2';

  // ---- Tournament selection / creation ------------------------------------
  if (!tournament) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">Tong-Il Moo-Do Scoring &mdash; Tournaments</h1>
          <button onClick={logout} className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold">Logout ({user.name})</button>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-3 font-bold">Select a tournament to manage</h2>
          {tournaments.length === 0 ? (
            <p className="text-gray-500">No tournaments yet. Create one below.</p>
          ) : (
            <ul className="divide-y divide-gray-800">
              {tournaments.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-bold">{t.name}</span>{' '}
                    <span className="text-sm text-gray-400">{t.location} &middot; {t.date} &middot; {t.status} &middot; /t/{t.slug}</span>
                  </span>
                  <button
                    onClick={() => setTournament({ id: t.id, slug: t.slug, name: t.name, courts_count: t.courts_count })}
                    className="rounded bg-green-700 px-4 py-1 text-sm font-bold"
                  >
                    Manage
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-3 font-bold">Create a new tournament</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={input} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <input className={input} placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <select className={input} value={form.courts_count} onChange={(e) => setForm({ ...form, courts_count: Number(e.target.value) })}>
              <option value={1}>1 court</option>
              <option value={2}>2 courts</option>
            </select>
          </div>
          {form.name && <p className="mt-2 text-sm text-gray-400">URL slug: /t/{slugify(form.name)}</p>}
          <button onClick={createTournament} className="mt-3 rounded-lg bg-green-700 px-6 py-2 font-bold">Create tournament</button>
        </div>
      </main>
    );
  }

  // ---- Dashboard for the active tournament --------------------------------
  const courts = Array.from({ length: tournament.courts_count }, (_, i) => i + 1);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 bg-navy p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <h1 className="font-headline text-2xl font-bold uppercase tracking-widest">{tournament.name}</h1>
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-success animate-live-pulse" />
              /t/{tournament.slug} &middot; {tournament.location} &middot; Admin dashboard
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <button onClick={() => setTournament(null)} className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Switch tournament</button>
          <Link href="/admin/draw" className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Draw &amp; Bracket</Link>
          <Link href="/admin/matches" className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Manage Matches</Link>
          <Link href="/admin/results" className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Results</Link>
          <Link href="/admin/athletes" className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Manage Athletes</Link>
          <Link href={`/t/${tournament.slug}/scoreboard`} className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Scoreboard</Link>
          <button onClick={logout} className="rounded-lg bg-gray-800 px-4 py-2 font-bold">Logout ({user.name})</button>
        </div>
      </div>

      {/* Live court status with score override */}
      <div className="grid gap-4 md:grid-cols-2">
        {courts.map((court) => {
          const m = courtMatches[court];
          return (
            <div key={court} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h2 className="mb-2 font-bold">Court {court === 1 ? 'A' : 'B'}</h2>
              {!m ? (
                <p className="text-gray-500">No active match</p>
              ) : (
                <>
                  <p className="text-sm text-gray-400">
                    {ROUND_LABELS[m.round]} &middot; Match {m.match_number} &middot; Round {m.current_round} &middot; {m.status.toUpperCase()} &middot; {formatTime(m.timer_seconds)}
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
                  {courts.map((c) => (
                    <button key={c} onClick={() => assign(m.id, c)} className="rounded bg-gray-700 px-3 py-1 text-sm font-bold">
                      &rarr; Court {c === 1 ? 'A' : 'B'}
                    </button>
                  ))}
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
                {e.takedown ? ' [TAKEDOWN]' : ''}
                {e.scored_by ? ` \u00b7 by ${e.scored_by}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
