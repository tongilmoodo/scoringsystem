'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useOfflineQueue } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';
import { playBeep, playBuzzer, playChime } from '@/lib/sounds';
import PinPad from '@/components/PinPad';
import VoiceScoring from '@/components/VoiceScoring';
import { ATHLETE_SELECT, formatTime, ROUND_LABELS, type Match, type Side } from '@/lib/types';

const SCORE_ACTIONS = [
  { type: 'point_1', label: '+1 Punch', points: 1 },
  { type: 'point_2', label: '+2 Kick', points: 2 },
  { type: 'point_3', label: '+3 Spin Kick', points: 3 },
] as const;

const WIN_METHODS = ['points', 'ko', 'disqualification', 'withdrawal', 'forfeit'] as const;
const MAX_FOULS = 3;

const LABELS = [
  'Start', 'Pause', 'Reset', 'End Match', 'Undo', 'Lock', 'Blue Wins', 'Red Wins',
  'Fouls', 'Online', 'Offline', 'LOCKED', 'Cancel', 'Last actions', 'No actions yet',
  'Match', 'Court', '+1 Punch', '+2 Kick', '+3 Spin Kick', 'Foul',
  'Double-tap anywhere to unlock', 'Waiting for the admin to assign a match',
];

type UndoEntry = { eventId: string; side: Side; points: number; foul: boolean };
type ScoreType = 'point_1' | 'point_2' | 'point_3' | 'foul';

export default function CourtPage() {
  const court = Number(useParams().courtNumber);
  const { user, ready, login, logout } = useAuth();
  const { queue, enqueue, clear } = useOfflineQueue();
  const { t } = useTranslation(LABELS);

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
  const lockedRef = useRef(false);
  lockedRef.current = locked;
  const remainingRef = useRef(180);
  remainingRef.current = remaining;

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

  // Local countdown; auto-pause + buzzer at zero.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          playBuzzer();
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
    return () => clearInterval(timer);
  }, [running]);

  // Scores/fouls are derived by DB triggers from score_events inserts;
  // the UI only inserts events and applies an optimistic local update.
  async function record(side: Side, type: ScoreType, points: number) {
    const m = matchRef.current;
    if (!m || lockedRef.current) return;
    const foul = type === 'foul';
    if (foul) playBeep();
    else playChime();
    const col = foul
      ? side === 'blue'
        ? 'blue_fouls'
        : 'red_fouls'
      : side === 'blue'
        ? 'blue_score'
        : 'red_score';
    const newVal = (m as unknown as Record<string, number>)[col] + (foul ? 1 : points);
    setMatch({ ...m, [col]: newVal } as Match); // optimistic; realtime confirms
    pushLog(`${side.toUpperCase()} ${foul ? 'FOUL' : '+' + points}`);
    const ev = {
      match_id: m.id,
      athlete_id: side === 'blue' ? m.blue_athlete_id : m.red_athlete_id,
      player_side: side,
      action_type: type,
      points: foul ? 0 : points,
      match_time_seconds: m.max_time - remainingRef.current,
      scored_by: user?.name ?? '',
    };
    try {
      const { data, error } = await supabase.from('score_events').insert(ev).select('id').single();
      if (error) throw error;
      setUndoStack((s) => [...s, { eventId: data.id, side, points, foul }].slice(-20));
    } catch {
      enqueue({ table: 'score_events', op: 'insert', payload: ev });
    }
    if (foul && newVal >= MAX_FOULS) setDqSide(side);
  }

  // Deleting the event triggers the DB to revert the score.
  async function undo() {
    const last = undoStack[undoStack.length - 1];
    const m = matchRef.current;
    if (!last || !m || lockedRef.current) return;
    const col = last.foul
      ? last.side === 'blue'
        ? 'blue_fouls'
        : 'red_fouls'
      : last.side === 'blue'
        ? 'blue_score'
        : 'red_score';
    const newVal = Math.max(
      0,
      (m as unknown as Record<string, number>)[col] - (last.foul ? 1 : last.points)
    );
    setMatch({ ...m, [col]: newVal } as Match); // optimistic
    await supabase.from('score_events').delete().eq('id', last.eventId);
    setUndoStack((s) => s.slice(0, -1));
    pushLog(`UNDO ${last.side.toUpperCase()} ${last.foul ? 'FOUL' : '+' + last.points}`);
  }

  async function startTimer() {
    const m = matchRef.current;
    if (!m || remainingRef.current <= 0) return;
    setRunning(true);
    await supabase
      .from('matches')
      .update({
        status: 'live',
        timer_started_at: new Date().toISOString(),
        timer_paused_at: null,
        timer_seconds: remainingRef.current,
      })
      .eq('id', m.id);
    pushLog('Timer started');
  }

  async function pauseTimer() {
    const m = matchRef.current;
    if (!m) return;
    setRunning(false);
    await supabase
      .from('matches')
      .update({
        status: 'paused',
        timer_started_at: null,
        timer_paused_at: new Date().toISOString(),
        timer_seconds: remainingRef.current,
      })
      .eq('id', m.id);
    pushLog('Timer paused');
  }

  async function resetTimer() {
    const m = matchRef.current;
    if (!m) return;
    setRunning(false);
    setRemaining(m.max_time);
    await supabase
      .from('matches')
      .update({ timer_started_at: null, timer_paused_at: null, timer_seconds: m.max_time })
      .eq('id', m.id);
    pushLog('Timer reset');
  }

  // Winner advancement to the next bracket slot is handled by the DB
  // trigger_advance_winner trigger.
  async function endMatch(winner: Side, method: (typeof WIN_METHODS)[number]) {
    const m = matchRef.current;
    if (!m) return;
    setRunning(false);
    const winnerId = winner === 'blue' ? m.blue_athlete_id : m.red_athlete_id;
    await supabase
      .from('matches')
      .update({
        status: 'completed',
        winner_id: winnerId,
        win_method: method,
        timer_started_at: null,
        timer_seconds: remainingRef.current,
      })
      .eq('id', m.id);
    setWinDialog(null);
    setDqSide(null);
    setUndoStack([]);
    setLog([]);
    loadMatch();
  }

  // Keyboard shortcuts. Refs keep the listener stable across renders.
  const recordRef = useRef(record);
  recordRef.current = record;
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const startRef = useRef(startTimer);
  startRef.current = startTimer;
  const pauseRef = useRef(pauseTimer);
  pauseRef.current = pauseTimer;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (runningRef.current) pauseRef.current();
        else startRef.current();
        return;
      }
      const side: Side = e.shiftKey ? 'red' : 'blue';
      switch (e.key) {
        case '1':
        case '!':
          recordRef.current(side, 'point_1', 1);
          break;
        case '2':
        case '@':
          recordRef.current(side, 'point_2', 2);
          break;
        case '3':
        case '#':
          recordRef.current(side, 'point_3', 3);
          break;
        case 'f':
        case 'F':
          recordRef.current(side, 'foul', 0);
          break;
        case 'u':
        case 'U':
          undoRef.current();
          break;
        case 'l':
        case 'L':
          setLocked(true);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Render guards -----------------------------------------------------
  if (!ready || Number.isNaN(court) || (court !== 1 && court !== 2)) return null;
  if (!user) return <PinPad title={`${t('Court')} ${court === 1 ? 'A' : 'B'} Scorer Login`} onSubmit={login} />;
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
        <h1 className="text-2xl font-bold">{t('Court')} {court === 1 ? 'A' : 'B'}</h1>
        <p className="text-gray-400">{t('Waiting for the admin to assign a match')}&hellip;</p>
      </main>
    );
  }

  const btn = 'min-h-[80px] rounded-xl text-xl font-bold active:opacity-70 disabled:opacity-40';

  return (
    <main className="flex min-h-screen flex-col gap-3 p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">{t('Court')} {court === 1 ? 'A' : 'B'}</span>
        <span>{ROUND_LABELS[match.round]} &middot; {t('Match')} {match.match_number}</span>
        <span className={online ? 'text-green-400' : 'font-bold text-yellow-400'}>
          {online ? t('Online') : `${t('Offline')} (${queue.length})`}
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
                <p className="text-white/80">{athlete?.country_code} {athlete?.team ? `- ${athlete.team}` : ''}</p>
                <p className="text-8xl font-black tabular-nums">{score}</p>
                <p className="text-white/80">{t('Fouls')}: {fouls} / {MAX_FOULS}</p>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2">
                {SCORE_ACTIONS.map((a) => (
                  <button
                    key={a.type}
                    disabled={locked}
                    onClick={() => record(side, a.type, a.points)}
                    className={`${btn} ${shade}`}
                  >
                    {t(a.label)}
                  </button>
                ))}
                <button
                  disabled={locked}
                  onClick={() => record(side, 'foul', 0)}
                  className={`${btn} bg-yellow-500 text-black`}
                >
                  &#9888;&#65039; {t('Foul')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timer controls + voice scoring */}
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl bg-gray-900 p-3">
        <span className="font-mono text-6xl font-black tabular-nums">{formatTime(remaining)}</span>
        <button disabled={locked || running} onClick={startTimer} className={`${btn} bg-green-700 px-6`}>{t('Start')}</button>
        <button disabled={locked || !running} onClick={pauseTimer} className={`${btn} bg-gray-700 px-6`}>{t('Pause')}</button>
        <button disabled={locked} onClick={resetTimer} className={`${btn} bg-gray-700 px-6`}>{t('Reset')}</button>
        <button disabled={locked} onClick={() => setWinDialog(match.blue_score >= match.red_score ? 'blue' : 'red')} className={`${btn} bg-orange-700 px-6`}>{t('End Match')}</button>
        <VoiceScoring disabled={locked} onScore={(side, action, points) => record(side, action, points)} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-4 gap-3">
        <button disabled={locked || undoStack.length === 0} onClick={undo} className={`${btn} bg-gray-700`}>{t('Undo')} ({undoStack.length})</button>
        <button onClick={() => setLocked(true)} className={`${btn} bg-gray-700`}>{t('Lock')}</button>
        <button disabled={locked} onClick={() => setWinDialog('blue')} className={`${btn} bg-blue-700`}>{t('Blue Wins')}</button>
        <button disabled={locked} onClick={() => setWinDialog('red')} className={`${btn} bg-red-700`}>{t('Red Wins')}</button>
      </div>

      {/* Event log */}
      <div className="rounded-xl bg-gray-900 p-3 text-sm text-gray-300">
        <p className="mb-1 font-bold text-gray-500">{t('Last actions')}</p>
        {log.length === 0 ? <p className="text-gray-600">{t('No actions yet')}</p> : (
          <ul className="grid grid-cols-2 gap-x-4">{log.map((entry, i) => <li key={i}>{entry}</li>)}</ul>
        )}
      </div>

      {/* Lock overlay */}
      {locked && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/90"
          onDoubleClick={() => setLocked(false)}
        >
          <p className="text-6xl font-black tracking-widest">{t('LOCKED')}</p>
          <p className="mt-4 text-gray-400">{t('Double-tap anywhere to unlock')}</p>
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
              <button onClick={() => setDqSide(null)} className={`${btn} bg-gray-700`}>{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Win method dialog */}
      {winDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 text-center">
            <p className="mb-4 text-2xl font-bold">{winDialog.toUpperCase()} wins by&hellip;</p>
            <div className="grid grid-cols-2 gap-3">
              {WIN_METHODS.map((method) => (
                <button key={method} onClick={() => endMatch(winDialog, method)} className={`${btn} bg-green-700 capitalize`}>
                  {method}
                </button>
              ))}
            </div>
            <button onClick={() => setWinDialog(null)} className={`${btn} mt-3 w-full bg-gray-700`}>{t('Cancel')}</button>
          </div>
        </div>
      )}
    </main>
  );
}
