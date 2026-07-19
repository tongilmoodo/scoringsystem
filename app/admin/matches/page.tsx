'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';
import { countryName, getFlagEmoji } from '@/lib/countries';
import { ATHLETE_SELECT, formatTime, ROUND_LABELS, type Match, type EventRecord } from '@/lib/types';

const ROUNDS = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final'] as const;
const STATUSES = ['scheduled', 'assigned', 'live', 'paused', 'break', 'takedown', 'completed'] as const;

function MatchesContent() {
  const { user, ready, login, logout } = useAuth();
  const { tournament, ready: tournamentReady } = useActiveTournament();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventFilter = searchParams.get('event') ?? '';

  const [matches, setMatches] = useState<Match[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [roundFilter, setRoundFilter] = useState('');
  const [courtFilter, setCourtFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!tournament) return;
    
    const { data: eventRows } = await supabase
      .from('events')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('name');
    
    setEvents((eventRows ?? []) as EventRecord[]);
    
    const eventIds = (eventRows ?? []).map((e: { id: string }) => e.id);
    if (!eventIds.length) return setMatches([]);
    
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .in('event_id', eventIds)
      .order('match_number');
      
    const loadedMatches = (data ?? []) as Match[];
    setMatches(loadedMatches);

    const newExpanded = new Set<string>();
    for (const m of loadedMatches) {
      if (['live', 'paused', 'assigned', 'break', 'takedown'].includes(m.status)) {
        newExpanded.add(m.event_id);
      }
    }
    setExpandedGroups(prev => {
      const merged = new Set(prev);
      newExpanded.forEach(id => merged.add(id));
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

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
    const activeOnCourt = matches.find(x => 
      x.court_number === court && 
      x.id !== m.id && 
      ['live', 'paused', 'break', 'takedown'].includes(x.status)
    );

    if (activeOnCourt && activeOnCourt.event_id !== m.event_id) {
      const activeEventName = activeOnCourt.events ? `${activeOnCourt.events.name} ${activeOnCourt.events.weight_class ?? ''}`.trim() : 'another event';
      const mEventName = m.events ? `${m.events.name} ${m.events.weight_class ?? ''}`.trim() : 'this event';
      if (!window.confirm(`Court ${court === 1 ? 'A' : 'B'} is currently running ${activeEventName} — assign this ${mEventName} match anyway?`)) {
        return;
      }
    }

    await supabase.from('matches').update({ court_number: court, status: 'assigned' }).eq('id', m.id);
  }

  async function adjustTimer(m: Match, delta: number) {
    const next = Math.max(0, Math.min(m.max_time, m.timer_seconds + delta));
    await supabase.from('matches').update({ timer_seconds: next }).eq('id', m.id);
    await supabase.rpc('append_match_audit', {
      p_match_id: m.id,
      p_action: 'timer_adjust',
      p_user: 'admin',
      p_note: `${delta > 0 ? '+' : ''}${delta}s -> ${next}s`,
    });
  }

  async function setStatus(m: Match, status: string) {
    await supabase.from('matches').update({ status }).eq('id', m.id);
    await supabase.rpc('append_match_audit', { p_match_id: m.id, p_action: 'status_override', p_user: 'admin', p_note: status });
  }

  async function resetMatch(m: Match) {
    if (!confirm(`Reset match #${m.match_number}? Scores, fouls, votes, rounds, and timers will all be cleared.`)) return;
    // Server-side RPC resets everything atomically: scores, fouls, winner,
    // current_round, round_scores, TKO flag, timer/takedown/break state,
    // and deletes score_events + judge_votes.
    const { data, error } = await supabase.rpc('reset_match', { p_match_id: m.id });
    if (error) {
      alert(`Reset failed: ${error.message}`);
      return;
    }
    const res = data as { success?: boolean; error?: string } | null;
    if (res && res.success === false) {
      alert(res.error ?? 'Reset failed');
      return;
    }
    await supabase.rpc('append_match_audit', { p_match_id: m.id, p_action: 'match_reset', p_user: 'admin', p_note: 'full reset' });
  }

  function toggleGroup(eventId: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
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

  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">No tournament selected.</p>
        <Link href="/admin" className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Choose a tournament</Link>
      </main>
    );
  }

  const baseFiltered = matches.filter(
    (m) =>
      (!roundFilter || m.round === roundFilter) &&
      (!courtFilter || String(m.court_number) === courtFilter) &&
      (!statusFilter || m.status === statusFilter) &&
      (!eventFilter || m.event_id === eventFilter)
  );

  const winnerName = (m: Match) =>
    m.winner_id === m.blue_athlete_id ? m.blue?.name : m.winner_id === m.red_athlete_id ? m.red?.name : '';

  const select = 'rounded-lg border border-gray-700 bg-gray-800 px-3 py-2';

  // Group matches if no event filter is set
  const grouped = !eventFilter 
    ? events.map(ev => ({
        event: ev,
        matches: baseFiltered.filter(m => m.event_id === ev.id)
      })).filter(g => g.matches.length > 0)
    : [];

  const MatchRow = ({ m }: { m: Match }) => (
    <tr key={m.id} className="border-b border-gray-800 last:border-0 hover:bg-white/5">
      <td className="p-3">{m.match_number}</td>
      {eventFilter && (
        <td className="p-3 text-xs text-gray-400">
           {m.events ? `${m.events.name} · ${m.events.category}` : 'Unknown'}
        </td>
      )}
      <td className="p-3">{ROUND_LABELS[m.round]}</td>
      <td className="p-3 text-blue-400">{m.blue?.country_code ? `${getFlagEmoji(m.blue.country_code)} ` : ''}{m.blue?.name ?? 'TBD'}</td>
      <td className="p-3 text-red-400">{m.red?.country_code ? `${getFlagEmoji(m.red.country_code)} ` : ''}{m.red?.name ?? 'TBD'}</td>
      <td className="p-3 tabular-nums">{m.blue_score} : {m.red_score}</td>
      <td className="p-3">{m.court_number ? (m.court_number === 1 ? 'A' : 'B') : '-'}</td>
      <td className="p-3">
        <span className={`inline-block rounded px-2 py-1 text-xs font-bold ${
          m.status === 'live' ? 'bg-red-500/20 text-red-500' : 
          m.status === 'completed' ? 'bg-green-500/20 text-green-500' : 
          'bg-gray-800 text-gray-400'
        }`}>
          {m.status.toUpperCase()}
        </span>
      </td>
      <td className="p-3">{winnerName(m)} {m.win_method ? `(${m.win_method})` : ''}</td>
      <td className="p-3 text-right">
        {m.status === 'scheduled' && (
          <>
            <button onClick={() => assign(m, 1)} className="mr-2 text-green-400 underline hover:text-green-300">→ A</button>
            <button onClick={() => assign(m, 2)} className="mr-2 text-green-400 underline hover:text-green-300">→ B</button>
          </>
        )}
        {['live', 'paused', 'assigned'].includes(m.status) && (
          <>
            <button onClick={() => adjustTimer(m, 10)} className="mr-2 text-yellow-400 underline">+10s</button>
            <button onClick={() => adjustTimer(m, -10)} className="mr-2 text-yellow-400 underline">-10s</button>
          </>
        )}
        <select
          onChange={(e) => { if (e.target.value) setStatus(m, e.target.value); e.target.value = ''; }}
          className="mr-2 rounded bg-gray-800 px-1 py-1 text-xs"
          defaultValue=""
        >
          <option value="">Set state…</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => resetMatch(m)} className="text-red-400 underline hover:text-red-300">Reset</button>
      </td>
    </tr>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
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
          <select 
            className={select} 
            value={eventFilter} 
            onChange={(e) => {
              const url = new URL(window.location.href);
              if (e.target.value) url.searchParams.set('event', e.target.value);
              else url.searchParams.delete('event');
              router.push(url.pathname + url.search);
            }}
          >
            <option value="">All Events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name} &middot; {ev.category} &middot; {ev.division ?? ev.weight_class ?? ''}</option>
            ))}
          </select>
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

        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/50">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="p-3">#</th>
                {eventFilter && <th className="p-3">Event</th>}
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
            
            {eventFilter ? (
              <tbody className="divide-y divide-gray-800">
                {baseFiltered.map(m => <MatchRow key={m.id} m={m} />)}
              </tbody>
            ) : (
              grouped.map(group => {
                const isExpanded = expandedGroups.has(group.event.id);
                const completed = group.matches.filter(m => m.status === 'completed').length;
                const total = group.matches.length;
                return (
                  <tbody key={group.event.id}>
                    <tr 
                      className="cursor-pointer border-y border-gray-800 bg-gray-800/40 hover:bg-gray-800"
                      onClick={() => toggleGroup(group.event.id)}
                    >
                      <td colSpan={10} className="p-3 font-bold">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-4 text-center">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            <span>{group.event.name}</span>
                            <span className="text-gray-400 font-normal">
                              &middot; {group.event.category} &middot; {group.event.weight_class ?? 'N/A'}
                            </span>
                          </div>
                          <div className="text-xs font-normal text-gray-400">
                            {completed} / {total} matches completed
                          </div>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && group.matches.map(m => <MatchRow key={m.id} m={m} />)}
                  </tbody>
                );
              })
            )}
            
            {baseFiltered.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-500">
                    No matches found matching the criteria.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>

      {/* Print-only official match sheets */}
      <div className="hidden print:block">
        {baseFiltered.map((m) => (
          <div key={m.id} className="print-sheet">
            <h1 style={{ fontSize: 20, fontWeight: 900, textAlign: 'center' }}>
              {tournament.name} &mdash; Official Match Sheet
            </h1>
            <p style={{ textAlign: 'center', marginBottom: 16 }}>
              {m.events ? `${m.events.name} · ${m.events.category} · ${m.events.weight_class} · ` : ''}
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

export default function MatchesPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading matches...</div>}>
      <MatchesContent />
    </Suspense>
  );
