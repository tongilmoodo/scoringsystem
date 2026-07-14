'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { playBeep, playBuzzer, playChime } from '@/lib/sounds';
import PinPad from '@/components/PinPad';
import VoiceScoring from '@/components/VoiceScoring';
import Flag from '@/components/Flag';
import {
  ACTION_LABELS,
  ATHLETE_SELECT,
  formatTime,
  ROUND_LABELS,
  type JudgeVote,
  type Match,
  type ScoreActionType,
  type Side,
} from '@/lib/types';

const ACTIONS: ScoreActionType[] = ['point_1', 'point_2', 'point_3', 'foul'];
const WIN_METHODS = ['points', 'ko', 'disqualification', 'withdrawal', 'forfeit'] as const;
const MAX_FOULS = 3;

function label(a: string) {
  return ACTION_LABELS[a as ScoreActionType] ?? a;
}

function tallyLine(votes: JudgeVote[], side: Side) {
  const pending = votes.filter((v) => v.player_side === side && v.status === 'pending');
  const counts: Record<string, number> = { point_1: 0, point_2: 0, point_3: 0, foul: 0 };
  pending.forEach((v) => {
    counts[v.action_type] = (counts[v.action_type] ?? 0) + 1;
  });
  return `${ACTIONS.map((a) => `${label(a)} (${counts[a]})`).join(', ')} \u2014 need 3`;
}

export default function ControllerPage() {
  const court = Number(useParams().courtNumber);
  const { user, ready, login, logout } = useAuth();

  const [match, setMatch] = useState<Match | null>(null);
  const [votes, setVotes] = useState<JudgeVote[]>([]);
  const [remaining, setRemaining] = useState(180);
  const [running, setRunning] = useState(false);
  const [winDialog, setWinDialog] = useState<Side | null>(null);
  const [manualSide, setManualSide] = useState<Side | null>(null);
  const [dqSide, setDqSide] = useState<Side | null>(null);
  const [dqDismissed, setDqDismissed] = useState<Record<Side, boolean>>({ blue: false, red: false });
  const [log, setLog] = useState<string[]>([]);

  const matchRef = useRef<Match | null>(null);
  matchRef.current = match;
  const runningRef = useRef(false);
  runningRef.current = running;
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

  const loadVotes = useCallback(async () => {
    const m = matchRef.current;
    if (!m) return setVotes([]);
    const { data } = await supabase
      .from('judge_votes')
      .select('*')
      .eq('match_id', m.id)
      .eq('status', 'pending');
    setVotes((data ?? []) as JudgeVote[]);
  }, []);

  useEffect(() => {
    if (user) loadMatch();
  }, [user, loadMatch]);

  useEffect(() => {
    const ch = supabase
      .channel(`matches:court:${court}:controller`)
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

  // Live vote monitor + committed-score sounds for the current match.
  useEffect(() => {
    loadVotes();
    if (!match) return;
    const ch = supabase
      .channel(`score:court:${court}:${match.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'judge_votes', filter: `match_id=eq.${match.id}` },
        () => loadVotes()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'score_events', filter: `match_id=eq.${match.id}` },
        (payload) => {
          const ev = payload.new as { action_type: string; player_side: string; scored_by: string };
          if (ev.action_type === 'foul') playBeep();
          else playChime();
          pushLog(`${ev.player_side.toUpperCase()} ${label(ev.action_type)} (${ev.scored_by})`);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [match?.id, court, loadVotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset DQ dismissals per match.
  useEffect(() => {
    setDqDismissed({ blue: false, red: false });
  }, [match?.id]);

  // DQ prompt: controller decides.
  useEffect(() => {
    if (!match || match.status === 'completed') return;
    if (match.blue_fouls >= MAX_FOULS && !dqDismissed.blue) setDqSide('blue');
    else if (match.red_fouls >= MAX_FOULS && !dqDismissed.red) setDqSide('red');
  }, [match, dqDismissed]);

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
          pushLog('TIME UP \u2014 declare winner');
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function startTimer() {
    const m = matchRef.current;
    if (!m || remainingRef.current <= 0) return;
    setRunning(true);
    await supabase
      .from('matches')
      .update({ status: 'live', timer_started_at: new Date().toISOString(), timer_paused_at: null, timer_seconds: remainingRef.current })
      .eq('id', m.id);
    pushLog('Timer started');
  }

  async function pauseTimer() {
    const m = matchRef.current;
    if (!m) return;
    setRunning(false);
    await supabase
      .from('matches')
      .update({ status: 'paused', timer_started_at: null, timer_paused_at: new Date().toISOString(), timer_seconds: remainingRef.current })
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

  async function clearVotes(side: Side) {
    const m = matchRef.current;
    if (!m) return;
    await supabase.rpc('clear_votes', { p_match_id: m.id, p_player_side: side });
    pushLog(`Cleared pending votes: ${side.toUpperCase()}`);
    loadVotes();
  }

  async function manualCommit(side: Side, action: ScoreActionType) {
    const m = matchRef.current;
    if (!m) return;
    await supabase.rpc('manual_commit_score', {
      p_match_id: m.id,
      p_player_side: side,
      p_action_type: action,
      p_controller_name: user?.name ?? 'controller',
    });
    setManualSide(null);
  }

  async function undoLast() {
    const m = matchRef.current;
    if (!m) return;
    const { data } = await supabase
      .from('score_events')
      .select('id, player_side, action_type')
      .eq('match_id', m.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;
    await supabase.from('score_events').delete().eq('id', data.id);
    pushLog(`UNDO ${String(data.player_side).toUpperCase()} ${label(String(data.action_type))}`);
  }

  async function toggleLock() {
    const m = matchRef.current;
    if (!m) return;
    await supabase.from('matches').update({ judges_locked: !m.judges_locked }).eq('id', m.id);
    pushLog(m.judges_locked ? 'Judges unlocked' : 'Judges locked');
  }

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
        judges_locked: false,
      })
      .eq('id', m.id);
    setWinDialog(null);
    setDqSide(null);
    setLog([]);
    loadMatch();
  }

  // Keyboard shortcuts: Space start/pause, 1/2/3/F manual commit (Shift = red),
  // U undo, L lock judges.
  const manualRef = useRef(manualCommit);
  manualRef.current = manualCommit;
  const undoRef = useRef(undoLast);
  undoRef.current = undoLast;
  const startRef = useRef(startTimer);
  startRef.current = startTimer;
  const pauseRef = useRef(pauseTimer);
  pauseRef.current = pauseTimer;
  const lockRef = useRef(toggleLock);
  lockRef.current = toggleLock;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (runningRef.current) pauseRef.current();
        else startRef.current();
        return;
      }
      const side: Side = e.shiftKey ? 'red' : 'blue';
      switch (e.key) {
        case '1': case '!': manualRef.current(side, 'point_1'); break;
        case '2': case '@': manualRef.current(side, 'point_2'); break;
        case '3': case '#': manualRef.current(side, 'point_3'); break;
        case 'f': case 'F': manualRef.current(side, 'foul'); break;
        case 'u': case 'U': undoRef.current(); break;
        case 'l': case 'L': lockRef.current(); break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Render guards -----------------------------------------------------
  if (!ready || Number.isNaN(court) || (court !== 1 && court !== 2)) return null;
  if (!user) return <PinPad title={`Court ${court === 1 ? 'A' : 'B'} Controller Login`} onSubmit={login} />;
  if (user.role !== 'controller' || user.court_access !== court) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Access denied: this device is not the Court {court === 1 ? 'A' : 'B'} controller.</p>
        <button onClick={logout} className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Switch user</button>
      </main>
    );
  }
  if (!match) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2">
        <h1 className="text-2xl font-bold">Court {court === 1 ? 'A' : 'B'} &mdash; Controller</h1>
        <p className="text-gray-400">Waiting for the admin to assign a match&hellip;</p>
      </main>
    );
  }

  const btn = 'min-h-[80px] rounded-xl text-xl font-bold active:opacity-70 disabled:opacity-40';
  const smallBtn = 'rounded-lg px-3 py-2 text-sm font-bold active:opacity-70';

  return (
    <main className="flex min-h-screen flex-col gap-3 p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">Court {court === 1 ? 'A' : 'B'} &middot; Controller</span>
        <span>{ROUND_LABELS[match.round]} &middot; Match {match.match_number} &middot; {match.status.toUpperCase()}</span>
        {match.judges_locked && <span className="font-bold text-yellow-400">JUDGES LOCKED</span>}
        <button onClick={logout} className="text-gray-400 underline">{user.name}</button>
      </div>

      {/* Athlete panels with vote monitor */}
      <div className="grid flex-1 grid-cols-2 gap-3">
        {(['blue', 'red'] as const).map((side) => {
          const athlete = side === 'blue' ? match.blue : match.red;
          const score = side === 'blue' ? match.blue_score : match.red_score;
          const fouls = side === 'blue' ? match.blue_fouls : match.red_fouls;
          const base = side === 'blue' ? 'bg-blue-600' : 'bg-red-600';
          return (
            <div key={side} className={`flex flex-col gap-3 rounded-xl p-4 ${base}`}>
              <div className="text-center">
                <p className="text-2xl font-bold">{athlete?.name ?? 'TBD'}</p>
                <p className="flex items-center justify-center gap-2 text-white/80"><Flag code={athlete?.country_code} size={24} /><span>{athlete?.team ?? ''}</span></p>
                <p className="text-8xl font-black tabular-nums">{score}</p>
                <p className="text-white/80">Fouls: {fouls} / {MAX_FOULS}</p>
              </div>
              {/* Vote monitor */}
              <div className="rounded bg-black/30 p-2 text-center text-sm">
                <p className="font-bold">{side.toUpperCase()} votes</p>
                <p>{tallyLine(votes, side)}</p>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2">
                <button onClick={() => clearVotes(side)} className={`${smallBtn} bg-black/40`}>Clear Votes</button>
                <button onClick={() => setManualSide(side)} className={`${smallBtn} bg-black/40`}>Manual Score</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timer controls + voice override */}
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl bg-gray-900 p-3">
        <span className="font-mono text-6xl font-black tabular-nums">{formatTime(remaining)}</span>
        <button disabled={running} onClick={startTimer} className={`${btn} bg-green-700 px-6`}>Start</button>
        <button disabled={!running} onClick={pauseTimer} className={`${btn} bg-gray-700 px-6`}>Pause</button>
        <button onClick={resetTimer} className={`${btn} bg-gray-700 px-6`}>Reset</button>
        <button onClick={() => setWinDialog(match.blue_score >= match.red_score ? 'blue' : 'red')} className={`${btn} bg-orange-700 px-6`}>End Match</button>
        <VoiceScoring onScore={(side, action) => manualCommit(side, action as ScoreActionType)} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-4 gap-3">
        <button onClick={undoLast} className={`${btn} bg-gray-700`}>Undo Last</button>
        <button onClick={toggleLock} className={`${btn} ${match.judges_locked ? 'bg-yellow-600 text-black' : 'bg-gray-700'}`}>
          {match.judges_locked ? 'Unlock Judges' : 'Lock Judges'}
        </button>
        <button onClick={() => setWinDialog('blue')} className={`${btn} bg-blue-700`}>Blue Wins</button>
        <button onClick={() => setWinDialog('red')} className={`${btn} bg-red-700`}>Red Wins</button>
      </div>

      {/* Event log */}
      <div className="rounded-xl bg-gray-900 p-3 text-sm text-gray-300">
        <p className="mb-1 font-bold text-gray-500">Committed scores &amp; actions</p>
        {log.length === 0 ? <p className="text-gray-600">Nothing yet</p> : (
          <ul className="grid grid-cols-2 gap-x-4">{log.map((entry, i) => <li key={i}>{entry}</li>)}</ul>
        )}
      </div>

      {/* Manual score dialog */}
      {manualSide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 text-center">
            <p className="mb-4 text-2xl font-bold">Manual score: {manualSide.toUpperCase()}</p>
            <p className="mb-4 text-sm text-gray-400">Overrides consensus and clears pending votes for this side.</p>
            <div className="grid grid-cols-2 gap-3">
              {ACTIONS.map((a) => (
                <button key={a} onClick={() => manualCommit(manualSide, a)} className={`${btn} ${a === 'foul' ? 'bg-yellow-500 text-black' : 'bg-green-700'}`}>
                  {ACTION_LABELS[a]}
                </button>
              ))}
            </div>
            <button onClick={() => setManualSide(null)} className={`${btn} mt-3 w-full bg-gray-700`}>Cancel</button>
          </div>
        </div>
      )}

      {/* Disqualification prompt */}
      {dqSide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 text-center">
            <p className="mb-4 text-2xl font-bold">{dqSide.toUpperCase()} has {MAX_FOULS} fouls. Disqualify?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => endMatch(dqSide === 'blue' ? 'red' : 'blue', 'disqualification')} className={`${btn} bg-red-700`}>Yes, disqualify</button>
              <button
                onClick={() => {
                  setDqDismissed((d) => ({ ...d, [dqSide]: true }));
                  setDqSide(null);
                }}
                className={`${btn} bg-gray-700`}
              >
                Continue match
              </button>
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
                <button key={method} onClick={() => endMatch(winDialog, method)} className={`${btn} bg-green-700 capitalize`}>{method}</button>
              ))}
            </div>
            <button onClick={() => setWinDialog(null)} className={`${btn} mt-3 w-full bg-gray-700`}>Cancel</button>
          </div>
        </div>
      )}
    </main>
  );
}
