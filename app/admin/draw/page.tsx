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
  bracket_status: 'draft' | 'published' | null;
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
  const [totalRounds, setTotalRounds] = useState(1);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournament) return;
    const { data: evs } = await supabase
      .from('events')
      .select('id, name, status, bracket_status')
      .eq('tournament_id', tournament.id)
      .order('created_at');
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
    if (!selected) return;
    if (eventAthletes.length < 2) {
      setError('This event needs at least 2 athletes registered before generating a draw.');
      return;
    }
    if (matches.length > 0 && !confirm('An existing bracket will be deleted and re-drawn. Continue?')) return;
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { lots, rounds } = generateBracket(selected, eventAthletes, totalRounds);

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
          onChange={(e) => { setSelected(e.target.value); setError(null); setSuccessMsg(null); }}
        >
          <option value="">Select event…</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
        {selected && (
          <>
            <span className="text-gray-400">{eventAthletes.length} athletes registered</span>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              Rounds/match
              <select
                className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-2"
                value={totalRounds}
                onChange={(e) => setTotalRounds(Number(e.target.value))}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <button disabled={busy} onClick={generate} className="rounded-lg bg-green-700 px-4 py-2 font-bold disabled:opacity-40">
              {busy ? 'Working…' : matches.length > 0 ? 'Re-draw' : 'Generate Draw'}
            </button>
            {matches.length > 0 && (
              <button onClick={publish} className="rounded-lg bg-blue-700 px-4 py-2 font-bold">
                {currentEvent?.bracket_status === 'published' ? 'Published ✓' : 'Publish Bracket'}
              </button>
            )}
          </>
        )}
      </div>

      {selected && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <BracketView matches={matches} onSelect={setDetail} />
        </div>
      )}

      {detail && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">Match #{detail.match_number} · {ROUND_LABELS[detail.round]}</h2>
            <button onClick={() => setDetail(null)} className="text-gray-400 underline">Close</button>
          </div>
          <p><span className="text-blue-400">{detail.blue?.name ?? 'TBD'}</span> vs <span className="text-red-400">{detail.red?.name ?? 'TBD'}</span></p>
          <p className="text-sm text-gray-400">
            Status: {detail.status} · Score: {detail.blue_score} : {detail.red_score} · Fouls: {detail.blue_fouls} / {detail.red_fouls}
            {detail.court_number ? ` · Court ${detail.court_number === 1 ? 'A' : 'B'}` : ''}
            {detail.win_method ? ` · Won by ${detail.win_method}` : ''}
          </p>
        </div>
      )}
    </main>
  );
}
