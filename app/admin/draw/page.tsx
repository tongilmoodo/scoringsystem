'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';
import BracketView from '@/components/BracketView';
import { generateBracket } from '@/lib/utils/bracket';
import { ATHLETE_SELECT, ROUND_LABELS, type Athlete, type Match } from '@/lib/types';

interface EventRow {
  id: string;
  name: string;
  status: string | null;
  category: string;
  bracket_status: 'draft' | 'published' | null;
  gender: string | null;
  age_group: string | null;
  division: string | null;
  belt_rank: string | null;
  rounds: number;
  round_duration_seconds: number;
  break_duration_seconds: number;
}

export default function DrawPage() {
  const { user, ready, login, logout } = useAuth();
  const { tournament, ready: tournamentReady } = useActiveTournament();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournament) return;
    const { data: evs, error: evErr } = await supabase
      .from('events')
      .select('id, name, category, status, bracket_status, rounds, round_duration_seconds, break_duration_seconds, gender, age_group, division, belt_rank')
      .eq('tournament_id', tournament.id)
      .order('gender')
      .order('age_group')
      .order('division')
      .order('name');
    if (evErr) {
      console.error('[Draw] events load failed:', evErr.message, evErr.code, evErr.details);
    }
    const evList = (evs ?? []) as EventRow[];
    setEvents(evList);
    const ids = evList.map((e) => e.id);
    const { data: ath } = ids.length
      ? await supabase.from('athletes').select('*').in('event_id', ids)
      : { data: [] };
    setAthletes((ath ?? []) as Athlete[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  const loadMatches = useCallback(async () => {
    if (!selected) return setMatches([]);
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('event_id', selected)
      .order('match_number');
    setMatches((data ?? []) as Match[]);
  }, [selected]);

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const eventAthletes = athletes.filter((a) => a.event_id === selected);
  const currentEvent = events.find((e) => e.id === selected);

  async function generate() {
    if (!selected || !currentEvent) return;
    
    const isFormEvent = currentEvent.category.includes('form_bon_kata') || currentEvent.category.includes('special_techniques');
    
    if (isFormEvent && eventAthletes.length < 1) {
      setError('This event needs at least 1 athlete registered before generating a draw.');
      return;
    } else if (!isFormEvent && eventAthletes.length < 2) {
      setError('This event needs at least 2 athletes registered before generating a draw.');
      return;
    }
    
    if (matches.length > 0 && !confirm('An existing bracket will be deleted and re-drawn. Continue?')) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const ev = events.find((e) => e.id === selected);
      if (!ev) throw new Error('Event not found');

      const eventAthletes = athletes.filter((a) => a.event_id === selected);
      const { lots, rounds } = generateBracket(selected, ev.category, eventAthletes, {
        rounds: ev.rounds,
        round_duration_seconds: ev.round_duration_seconds,
        break_duration_seconds: ev.break_duration_seconds,
      });

      // 1. Delete existing matches
      const { error: delErr } = await supabase.from('matches').delete().eq('event_id', selected);
      if (delErr) throw new Error(`Delete failed: ${delErr.message} (code: ${delErr.code})`);

      // 2. Update lot numbers
      for (const lot of lots) {
        const { error: lotErr } = await supabase.from('athletes').update({ lot_number: lot.lot_number }).eq('id', lot.id);
        if (lotErr) throw new Error(`Lot assignment failed: ${lotErr.message}`);
      }

      // 3. Insert later rounds first so next_match_id foreign keys resolve.
      let totalInserted = 0;
      for (let r = rounds.length - 1; r >= 0; r--) {
        const { data: inserted, error: insErr } = await supabase
          .from('matches')
          .insert(rounds[r])
          .select('id');
        if (insErr) {
          throw new Error(
            `Insert failed for round ${r + 1} (${rounds[r][0]?.round}): ${insErr.message} (code: ${insErr.code}, details: ${insErr.details ?? 'none'})`
          );
        }
        totalInserted += (inserted ?? []).length;
      }

      await Promise.all([load(), loadMatches()]);
      setDetail(null);
      setSuccessMsg(
        `✓ ${totalInserted} match${totalInserted !== 1 ? 'es' : ''} created for "${currentEvent?.name ?? selected}"`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Draw generation failed: ${msg}`);
      console.error('[generate draw]', err);
    } finally {
      setBusy(false);
    }
  }

  async function clearBracket() {
    if (!selected) return;
    if (!confirm('Are you sure you want to completely delete all matches for this event? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // 1. Delete existing matches
      const { error: delErr } = await supabase.from('matches').delete().eq('event_id', selected);
      if (delErr) throw new Error(`Delete matches failed: ${delErr.message}`);

      // 2. Reset event bracket status
      const { error: evErr } = await supabase.from('events').update({ bracket_status: null }).eq('id', selected);
      if (evErr) throw new Error(`Status update failed: ${evErr.message}`);

      // 3. Clear lot numbers from athletes
      const { error: lotErr } = await supabase.from('athletes').update({ lot_number: null }).eq('event_id', selected);
      if (lotErr) console.error('Failed to clear lot numbers:', lotErr);

      await loadMatches();
      await load(); // refresh event status
      setSuccessMsg('Bracket deleted successfully.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function assignFormToCourt(courtNum: number) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const sorted = [...matches].sort((a, b) => a.match_number - b.match_number);
      if (sorted.length === 0) throw new Error('No matches to assign. Generate the draw first.');

      // Set court number for all matches in this event
      const { error: courtErr } = await supabase
        .from('matches')
        .update({ court_number: courtNum })
        .eq('event_id', selected);
      if (courtErr) throw new Error(`Court assignment failed: ${courtErr.message}`);

      // Mark only the first (lowest match_number) match as 'assigned' so the controller picks it up
      const firstMatch = sorted.find(m => m.status === 'scheduled') ?? sorted[0];
      const { error: assignErr } = await supabase
        .from('matches')
        .update({ status: 'assigned' })
        .eq('id', firstMatch.id);
      if (assignErr) throw new Error(`Status update failed: ${assignErr.message}`);

      await loadMatches();
      setSuccessMsg(`✓ All matches assigned to Court ${courtNum === 1 ? 'A' : 'B'}. Match #${firstMatch.match_number} (${firstMatch.blue?.name ?? 'Athlete'}) is now live on the controller and scoreboard.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!selected) return;
    setError(null);
    setSuccessMsg(null);
    const { error: pubErr } = await supabase
      .from('events')
      .update({ bracket_status: 'published' })
      .eq('id', selected);
    if (pubErr) {
      setError(`Publish failed: ${pubErr.message} (code: ${pubErr.code})`);
    } else {
      setSuccessMsg(`✓ Bracket for "${currentEvent?.name}" is now published and visible to the public.`);
      load();
    }
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

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">{tournament.name} &middot; Draw &amp; Bracket</h1>
        <Link href="/admin" className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold">← Dashboard</Link>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-700 bg-red-950 p-4 text-red-300">
          <p className="font-bold text-red-400">Error</p>
          <p className="mt-1 font-mono text-sm">{error}</p>
          <button onClick={() => setError(null)} className="mt-2 text-xs text-red-400 underline">Dismiss</button>
        </div>
      )}

      {/* Success banner */}
      {successMsg && (
        <div className="rounded-xl border border-green-700 bg-green-950 p-4 text-green-300">
          <p className="font-mono text-sm">{successMsg}</p>
          <button onClick={() => setSuccessMsg(null)} className="mt-1 text-xs text-green-400 underline">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <select
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setError(null);
            setSuccessMsg(null);
          }}
        >
          <option value="">Select event…</option>
          {Array.from(new Set(events.map(ev => `${ev.gender ?? 'Unspecified'} | ${ev.age_group ?? 'Any Age'} | ${ev.division ?? 'Open'}`))).map(group => (
            <optgroup key={group} label={group}>
              {events
                .filter(ev => `${ev.gender ?? 'Unspecified'} | ${ev.age_group ?? 'Any Age'} | ${ev.division ?? 'Open'}` === group)
                .map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name} {ev.belt_rank ? `(${ev.belt_rank})` : ''}</option>
                ))}
            </optgroup>
          ))}
        </select>
        {selected && (
          <>
            <span className="text-gray-400">{eventAthletes.length} athletes registered</span>
            <button disabled={busy} onClick={generate} className="rounded-lg bg-green-700 px-4 py-2 font-bold disabled:opacity-40">
              {busy ? 'Working…' : matches.length > 0 ? 'Re-draw' : 'Generate Draw'}
            </button>
            {matches.length > 0 && (
              <>
                <button onClick={publish} className="rounded-lg bg-blue-700 px-4 py-2 font-bold">
                  {currentEvent?.bracket_status === 'published' ? 'Published ✓' : 'Publish Bracket'}
                </button>
                <button disabled={busy} onClick={clearBracket} className="rounded-lg bg-red-800 px-4 py-2 font-bold disabled:opacity-40 ml-auto">
                  Clear Bracket
                </button>
              </>
            )}
          </>
        )}
      </div>

      {selected && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <BracketView matches={matches} onSelect={setDetail} />
        </div>
      )}

      {/* Form event: court assignment panel */}
      {selected && currentEvent && (currentEvent.category.includes('form_bon_kata') || currentEvent.category.includes('special_techniques')) && matches.length > 0 && (
        <div className="rounded-xl border border-yellow-700 bg-yellow-950 p-4">
          <h2 className="mb-3 font-bold text-yellow-300">📋 Form Event — Court Assignment</h2>
          <p className="mb-4 text-sm text-yellow-200">
            Assign all matches to a court so the Controller, Judge, and Scoreboard can pick them up.
            The first <strong>scheduled</strong> match will be automatically set to <strong>assigned</strong>.
          </p>
          <div className="flex gap-3 mb-6">
            <button
              disabled={busy}
              onClick={() => assignFormToCourt(1)}
              className="rounded-lg bg-green-700 px-6 py-3 font-bold text-white disabled:opacity-40 hover:bg-green-600"
            >
              {busy ? 'Working…' : '→ Assign to Court A'}
            </button>
            <button
              disabled={busy}
              onClick={() => assignFormToCourt(2)}
              className="rounded-lg bg-blue-700 px-6 py-3 font-bold text-white disabled:opacity-40 hover:bg-blue-600"
            >
              {busy ? 'Working…' : '→ Assign to Court B'}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-yellow-400 border-b border-yellow-800">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Athlete</th>
                <th className="pb-2 pr-4">Court</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...matches].sort((a, b) => a.match_number - b.match_number).map(m => (
                <tr key={m.id} className="border-b border-yellow-900/50">
                  <td className="py-2 pr-4 font-mono text-yellow-300">{m.match_number}</td>
                  <td className="py-2 pr-4 text-white font-semibold">{m.blue?.name ?? 'TBD'}</td>
                  <td className="py-2 pr-4 text-gray-300">{m.court_number ? `Court ${m.court_number === 1 ? 'A' : 'B'}` : '—'}</td>
                  <td className="py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                      m.status === 'completed' ? 'bg-green-800 text-green-300' :
                      m.status === 'assigned' ? 'bg-yellow-700 text-yellow-200 animate-pulse' :
                      m.status === 'live' ? 'bg-red-700 text-red-200 animate-pulse' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {m.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">Match #{detail.match_number} · {detail.red_athlete_id === null ? 'Solo Performance' : ROUND_LABELS[detail.round]}</h2>
            <button onClick={() => setDetail(null)} className="text-gray-400 underline">Close</button>
          </div>
          {detail.red_athlete_id === null ? (
            // Form / Solo event detail
            <div className="flex items-center gap-3">
              <span className="text-blue-400 font-bold text-lg">{detail.blue?.name ?? 'TBD'}</span>
              {detail.status === 'completed' && (
                <span className="ml-auto font-mono text-2xl font-black text-white">
                  {(detail.blue_score / 10).toFixed(1)}
                </span>
              )}
            </div>
          ) : (
            // Sparring match detail
            <p><span className="text-blue-400">{detail.blue?.name ?? 'TBD'}</span> vs <span className="text-red-400">{detail.red?.name ?? 'TBD'}</span></p>
          )}
          <p className="text-sm text-gray-400 mt-1">
            Status: {detail.status}
            {detail.court_number ? ` · Court ${detail.court_number === 1 ? 'A' : 'B'}` : ''}
            {detail.win_method ? ` · Won by ${detail.win_method}` : ''}
          </p>
        </div>
      )}
    </main>
  );
}
