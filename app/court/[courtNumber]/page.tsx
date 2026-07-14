'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useOfflineQueue } from '@/lib/store';
import PinPad from '@/components/PinPad';
import { ATHLETE_SELECT, formatTime, ROUND_LABELS, type Match, type Side } from '@/lib/types';

const SCORE_ACTIONS = [
  { type: 'point_1', label: '+1 Punch', points: 1 },
  { type: 'point_2', label: '+2 Kick', points: 2 },
  { type: 'point_3', label: '+3 Spin Kick', points: 3 },
] as const;

const WIN_METHODS = ['points', 'ko', 'disqualification', 'withdrawal'] as const;
const MAX_FOULS = 3;

type UndoEntry = { eventId: string; side: Side; points: number; foul: boolean };

export default function CourtPage() {
  const court = Number(useParams().courtNumber);
  const { user, ready, login, logout } = useAuth();
  const { queue, enqueue, clear } = useOfflineQueue();

  const [match, setMatch] = useState<Match | null>(null);
  const [remaining, setRemaining] = useState(180);
  const [running, setRunning] = useState(false);
  const [locked, setLocked] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [dqSide, setDqSide] = useState<Side | null>(null);
  const [winDialog, setWinDialog] = useState<Side | null>(null);
  const [online, setOnline] = useState(true);

  const matchRef = useRef<Match | null>(null);
  matchRef.current = match;
  const runningRef = useRef(false);
  runningRef.current = running;

  const pushLog = (entry: string) => setLog((l) => [entry, ...l].slice(0, 10));

  const loadMatch = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('court_number', court)
      .in('status', ['assigned', 'live', 'paused'])
      .order('match_number')
      .limit(1)
      .maybeSingle();
    const m = (data as Match | null) ?? null;
    setMatch(m);
    // Don't stomp the local countdown while the clock is running.
    if (m && !runningRef.current) setRemaining(m.timer_seconds);
  }, [court]);

  useEffect(() => {
    if (user) loadMatch();
  }, [user, loadMatch]);

  useEffect(() => {
    const ch = supabase
      .channel(`matches:court:${court}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `court_number=eq.${court}` },
        () => loadMatch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [court, loadMatch]);

  // Offline detection + queue replay.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!online || queue.length === 0) return;
    (async () => {
      for (const q of queue) {
        if (q.op === 'insert') await supabase.from(q.table).insert(q.payload);
        else if (q.matchId) await supabase.from(q.table).update(q.payload).eq('id', q.matchId);
      }
      clear();
      pushLog('Offline queue synced');
    })();
  }, [online, queue, clear]);

  // Local countdown; auto-pause at zero.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          const m = matchRef.current;
          if (m) {
            supabase
              .from('matches')
              .update({ status: 'paused', timer_started_at: null, timer_seconds: 0 })
              .eq('id', m.id);
          }
          pushLog('TIME UP');
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  async function record(side: Side, type: 'point_1' | 'point_2' | 'point_3' | 'foul', points: number) {
    if (!match || locked) return;
    const foul = type === 'foul';
    const col = foul
      ? side === 'blue'
        ? 'blue_fouls'
        : 'red_fouls'
      : side === 'blue'
        ? 'blue_score'
        : 'red_score';
    const newVal = (match as unknown as Record<string, number>)[col] + (foul ? 1 : points);
    const updates = { [col]: newVal };
    setMatch({ ...match, ...updates } as Match); // optimistic
    pushLog(`${side.toUpperCase()} ${foul ? 'FOUL' : '+' + points}`);
    const ev = {
      match_id: match.id,
      player_side: side,
      action_type: type,
      points: foul ? 0 : points,
      match_time_seconds: match.max_time - remaining,
      scored_by: user?.name ?? '',
    };
    try {
      const { data, error } = await supabase.from('score_events').insert(ev).select('id').single();
      if (error) throw error;
      const { error: updError } = await supabase.from('matches').update(updates).eq('id', match.id);
      if (updError) throw updError;
      setUndoStack((s) => [...s, { eventId: data.id, side, points, foul }].slice(-20));
    } catch {
      enqueue({ table: 'score_events', op: 'insert', payload: ev });
      enqueue({ table: 'matches', op: 'update', payload: updates, matchId: match.id });
    }
    if (foul && newVal >= MAX_FOULS) setDqSide(side);
  }

  async function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last || !match || locked) return;
    await supabase.from('score_events').delete().eq('id', last.eventId);
    const col = last.foul
      ? last.side === 'blue'
        ? 'blue_fouls'
        : 'red_fouls'
      : last.side === 'blue'
        ? 'blue_score'
        : 'red_score';
    const newVal = Math.max(
      0,
      (match as unknown as Record<string, number>)[col] - (last.foul ? 1 : last.points)
    );
    await supabase.from('matches').update({ [col]: newVal }).eq('id', match.id);
    setMatch({ ...match, [col]: newVal } as Match);
    setUndoStack((s) => s.slice(0, -1));
    pushLog(`UNDO ${last.side.toUpperCase()} ${last.foul ? 'FOUL' : '+' + last.points}`);
  }

  async function startTimer() {
    if (!match || remaining <= 0) return;
    setRunning(true);
    await supabase
      .from('matches')
      .update({ status: 'live', timer_started_at: new Date().toISOString(), timer_seconds: remaining })
      .eq('id', match.id);
    pushLog('Timer started');
  }

  async function pauseTimer() {
    if (!match) return;
    setRunning(false);
    await supabase
      .from('matches')
      .update({ status: 'paused', timer_started_at: null, timer_seconds: remaining })
      .eq('id', match.id);
    pushLog('Timer paused');
  }

  async function resetTimer() {
    if (!match) return;
    setRunning(false);
    setRemaining(match.max_time);
    await supabase
      .from('matches')
      .update({ timer_started_at: null, timer_seconds: match.max_time })
      .eq('id', match.id);
    pushLog('Timer reset');
  }

  async function endMatch(winner: Side, method: (typeof WIN_METHODS)[number]) {
    if (!match) return;
    setRunning(false);
    const winnerId = winner === 'blue' ? match.blue_athlete_id : match.red_athlete_id;
    await supabase
      .from('matches')
      .update({
        status: 'completed',
        winner_id: winnerId,
        win_method: method,
        timer_started_at: null,
        timer_seconds: remaining,
      })
      .eq('id', match.id);
    // Winner auto-advances to the next bracket slot when configured.
    if (match.next_match_id && match.next_match_position && winnerId) {
      const slot = match.next_match_position === 'blue' ? 'blue_athlete_id' : 'red_athlete_id';
      await supabase.from('matches').update({ [slot]: winnerId }).eq('id', match.next_match_id);
    }
    setWinDialog(null);
    setDqSide(null);
    setUndoStack([]);
    setLog([]);
    loadMatch();
  }

  // ---- Render guards -----------------------------------------------------
  if (!ready || Number.isNaN(court) || (court !== 1 && court !== 2)) return null;
  if (!user) return <PinPad title={`Court ${court === 1 ? 'A' : 'B'} Scorer Login`} onSubmit={login} />;
  if (user.role !== 'scorer' || user.court_access !== court) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Access denied: this device is not authorised for Court {court === 1 ? 'A' : 'B'}.</p>
        <button onClick={logout} className="rounded-lg bg-gray-700 px-6 py-3 font-bold">
          Switch user
        </button>
      </main>
    );
  }
  if (!match) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2">
        <h1 className="text-2xl font-bold">Court {court === 1 ? 'A' : 'B'}</h1>
        <p className="text-gray-400">Waiting for the admin to assign a match…</p>
      </main>
    );
  }

  const btn = 'min-h-[80px] rounded-xl text-xl font-bold active:opacity-70 disabled:opacity-40';

  return (
    <main className="flex min-h-screen flex-col gap-3 p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">Court {court === 1 ? 'A' : 'B'}</span>
        <span>{ROUND_LABELS[match.round]} · Match {match.match_number}</span>
        <span className={online ? 'text-green-400' : 'font-bold text-yellow-400'}>
          {online ? 'Online' : `Offline (${queue.length} queued)`}
        </span>
        <button onClick={logout} className="text-gray-400 underline">
          {user.name}
        </button>
      </div>

      {/* Athlete panels */}
      <div className="grid flex-1 grid-cols-2 gap-3">
        {(['blue', 'red'] as const).map((side) => {
          const athlete = side === 'blue' ? match.blue : match.red;
          const score = side === 'blue' ? match.blue_score : match.red_score;
          const fouls = side === 'blue' ? match.blue_fouls : match.red_fouls;
          const base = side === 'blue' ? 'bg-blue-600' : 'bg-red-600';
          const shade = side === 'blue' ? 'bg-blue-800' : 'bg-red-800';
          return (
            <div key={side} className={`flex flex-col gap-3 rounded-xl p-4 ${base}`}>
              <div className="text-center">
                <p className="text-2xl font-bold">{athlete?.name ?? 'TBD'}</p>
                <p className="text-white/80">{athlete?.country_code} {athlete?.team ? `· ${athlete.team}` : ''}</p>
                <p className="text-8xl font-black tabular-nums">{score}</p>
                <p className="text-white/80">Fouls: {fouls} / {MAX_FOULS}</p>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2">
                {SCORE_ACTIONS.map((a) => (
                  <button
                    key={a.type}
                    disabled={locked}
                    onClick={() => record(side, a.type, a.points)}
                    className={`${btn} ${shade}`}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  disabled={locked}
                  onClick={() => record(side, 'foul', 0)}
                  className={`${btn} bg-yellow-500 text-black`}
                >
                  ⚠️ Foul
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timer controls */}
      <div className="flex items-center justify-center gap-3 rounded-xl bg-gray-900 p-3">
        <span className="font-mono text-6xl font-black tabular-nums">{formatTime(remaining)}</span>
        <button disabled={locked || running} onClick={startTimer} className={`${btn} bg-green-700 px-6`}>Start</button>
        <button disabled={locked || !running} onClick={pauseTimer} className={`${btn} bg-gray-700 px-6`}>Pause</button>
        <button disabled={locked} onClick={resetTimer} className={`${btn} bg-gray-700 px-6`}>Reset</button>
        <button disabled={locked} onClick={() => setWinDialog(match.blue_score >= match.red_score ? 'blue' : 'red')} className={`${btn} bg-orange-700 px-6`}>End Match</button>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-4 gap-3">
        <button disabled={locked || undoStack.length === 0} onClick={undo} className={`${btn} bg-gray-700`}>Undo ({undoStack.length})</button>
        <button onClick={() => setLocked(true)} className={`${btn} bg-gray-700`}>Lock</button>
        <button disabled={locked} onClick={() => setWinDialog('blue')} className={`${btn} bg-blue-700`}>Blue Wins</button>
        <button disabled={locked} onClick={() => setWinDialog('red')} className={`${btn} bg-red-700`}>Red Wins</button>
      </div>

      {/* Event log */}
      <div className="rounded-xl bg-gray-900 p-3 text-sm text-gray-300">
        <p className="mb-1 font-bold text-gray-500">Last actions</p>
        {log.length === 0 ? <p className="text-gray-600">No actions yet</p> : (
          <ul className="grid grid-cols-2 gap-x-4">{log.map((e, i) => <li key={i}>{e}</li>)}</ul>
        )}
      </div>

      {/* Lock overlay */}
      {locked && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/90"
          onDoubleClick={() => setLocked(false)}
        >
          <p className="text-6xl font-black tracking-widest">LOCKED</p>
          <p className="mt-4 text-gray-400">Double-tap anywhere to unlock</p>
        </div>
      )}

      {/* Disqualification dialog */}
      {dqSide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 text-center">
            <p className="mb-4 text-2xl font-bold">
              {dqSide.toUpperCase()} has {MAX_FOULS} fouls. Disqualify?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => endMatch(dqSide === 'blue' ? 'red' : 'blue', 'disqualification')} className={`${btn} bg-red-700`}>
                Yes, disqualify
              </button>
              <button onClick={() => setDqSide(null)} className={`${btn} bg-gray-700`}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Win method dialog */}
      {winDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 text-center">
            <p className="mb-4 text-2xl font-bold">{winDialog.toUpperCase()} wins by…</p>
            <div className="grid grid-cols-2 gap-3">
              {WIN_METHODS.map((m) => (
                <button key={m} onClick={() => endMatch(winDialog, m)} className={`${btn} bg-green-700 capitalize`}>
                  {m}
                </button>
              ))}
            </div>
            <button onClick={() => setWinDialog(null)} className={`${btn} mt-3 w-full bg-gray-700`}>Cancel</button>
          </div>
        </div>
      )}
    </main>
  );
}
