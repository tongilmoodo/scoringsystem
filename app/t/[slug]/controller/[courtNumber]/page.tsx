'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useTournamentBySlug } from '@/lib/useTournament';
import { useKiosk } from '@/lib/useKiosk';
import { useHeartbeat } from '@/lib/useHeartbeat';
import { useTrackPresence } from '@/lib/usePresence';
import { playBeep, playBuzzer, playChime, playTick, playTimerStart, playBreak, playTakedown, playFanfare } from '@/lib/sounds';
import { audio } from '@/lib/audio';
import PinPad from '@/components/PinPad';
import VoiceScoring from '@/components/VoiceScoring';
import Flag from '@/components/Flag';
import SoundToggle from '@/components/ui/SoundToggle';
import BroadcastBanner from '@/components/BroadcastBanner';
import { ConnectionDot, StatusBadge, type BadgeState } from '@/components/ui/StatusBadge';
import FormControlView from '@/components/FormControlView';
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
const WIN_METHODS = ['points', 'ko', 'tko', 'disqualification', 'withdrawal', 'forfeit'] as const;
const MAX_FOULS = 3;
const TAKEDOWN_SECONDS = 30;

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
  const params = useParams();
  const slug = String(params.slug);
  const court = Number(params.courtNumber);
  const { tournament, loading } = useTournamentBySlug(slug);
  const { user, ready, login, logout } = useAuth();

  const [match, setMatch] = useState<Match | null>(null);
  const [votes, setVotes] = useState<JudgeVote[]>([]);
  const [remaining, setRemaining] = useState(180);
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [winDialog, setWinDialog] = useState<Side | null>(null);
  const [manualSide, setManualSide] = useState<Side | null>(null);
  const [dqSide, setDqSide] = useState<Side | null>(null);
  const [dqDismissed, setDqDismissed] = useState<Record<Side, boolean>>({ blue: false, red: false });
  const [tkoDismissed, setTkoDismissed] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const matchRef = useRef<Match | null>(null);
  matchRef.current = match;
  const runningRef = useRef(false);
  runningRef.current = running;
  const remainingRef = useRef(180);
  remainingRef.current = remaining;
  // Default behaviour: match clock auto-pauses during a takedown window and
  // resumes automatically when the window ends.
  const takedownAutoPaused = useRef(false);
  const takedownHandled = useRef<string | null>(null);

  const pushLog = (entry: string) => setLog((l) => [entry, ...l].slice(0, 10));

  // Keep the tablet awake; warn on unload while the match is live.
  useKiosk(match?.status === 'live');
  useHeartbeat(user?.id);
  // Join the court presence channel so the admin dashboard shows this
  // controller as live. Presence clears automatically when the tab closes.
  useTrackPresence(
    user?.role === 'controller' ? court : null,
    user ? { user_id: user.id, name: user.name, role: 'controller' } : null,
  );

  const loadMatch = useCallback(async () => {
    if (!tournament) return;
    // matches has no tournament_id — resolve via events
    const { data: evRows } = await supabase
      .from('events')
      .select('id')
      .eq('tournament_id', tournament.id);
    const evIds = (evRows ?? []).map((e: { id: string }) => e.id);
    if (!evIds.length) { setMatch(null); return; }
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .in('event_id', evIds)
      .eq('court_number', court)
      .in('status', ['assigned', 'live', 'paused', 'break', 'takedown'])
      .order('match_number')
      .limit(1)
      .maybeSingle();
    const m = (data as Match | null) ?? null;
    setMatch(m);
    if (m && !runningRef.current) {
      setRemaining(m.status === 'takedown' && m.timer_before_takedown != null ? m.timer_before_takedown : m.timer_seconds);
    }
  }, [court, tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (user && tournament) loadMatch();
  }, [user, tournament, loadMatch]);

  useEffect(() => {
    if (!tournament) return;
    // matches has no tournament_id column, so we cannot server-filter on it;
    // subscribe to all match changes and re-resolve via events in loadMatch.
    const ch = supabase
      .channel(`matches:t:${slug}:court:${court}:controller`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => loadMatch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [slug, court, tournament?.id, loadMatch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadVotes();
    if (!match) return;
    const ch = supabase
      .channel(`score:${match.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'judge_votes', filter: `match_id=eq.${match.id}` },
        () => loadVotes()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'score_events', filter: `match_id=eq.${match.id}` },
        (payload) => {
          const ev = payload.new as { action_type: string; player_side: string; scored_by: string; takedown: boolean };
          if (ev.action_type === 'foul') playBeep();
          else playChime();
          pushLog(`${ev.player_side.toUpperCase()} ${label(ev.action_type)}${ev.takedown ? ' [TAKEDOWN]' : ''} (${ev.scored_by})`);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [match?.id, loadVotes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDqDismissed({ blue: false, red: false });
    setTkoDismissed(false);
  }, [match?.id]);

  useEffect(() => {
    if (!match || match.status === 'completed') return;
    if (match.blue_fouls >= MAX_FOULS && !dqDismissed.blue) setDqSide('blue');
    else if (match.red_fouls >= MAX_FOULS && !dqDismissed.red) setDqSide('red');
  }, [match, dqDismissed]);

  // Round clock countdown; last-10s ticks; auto-pause + buzzer at zero.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r > 1 && r <= 11) playTick();
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

  // Shared wall-clock tick for break/takedown countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const breakActive = match?.status === 'break';
  // Break countdown derives from the server-persisted break_started_at so it
  // survives reloads and is consistent across devices.
  const breakAnchor = match?.break_started_at ?? match?.timer_paused_at ?? null;
  const breakRemaining = breakActive && breakAnchor
    ? Math.max(0, (match.break_timer_seconds ?? 30) - Math.floor((now - new Date(breakAnchor).getTime()) / 1000))
    : 0;
  const breakOver = match?.status === 'break' && breakRemaining === 0;
  const totalRounds = match?.total_rounds ?? 1;

  const takedownActive = match?.status === 'takedown';
  const takedownRemaining = takedownActive && match.timer_paused_at
    ? Math.max(0, match.takedown_timer_seconds - Math.floor((now - new Date(match.timer_paused_at).getTime()) / 1000))
    : 0;


  // --- Derived Match State for Sparring ---
  const roundRemaining = match?.timer_paused_at
    ? Math.max(0, (match.timer_seconds ?? 0) - Math.floor((now - new Date(match.timer_paused_at).getTime()) / 1000))
    : (match?.timer_seconds ?? 0);

  async function startTimer() {
    const m = matchRef.current;
    if (!m || remainingRef.current <= 0) return;
    setRunning(true);
    playTimerStart();
    audio.playMatchStart();
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

  // ---- Round breaks (server RPCs) -----------------------------------------
  async function endRound() {
    const m = matchRef.current;
    if (!m) return;
    setRunning(false);
    const { error } = await supabase.rpc('end_round', { p_match_id: m.id });
    if (error) { pushLog(`End round failed: ${error.message}`); return; }
    playBreak();
    pushLog(`Round ${m.current_round} ended \u2014 30s break`);
    loadMatch();
  }

  async function skipBreak() {
    const m = matchRef.current;
    if (!m) return;
    const { data, error } = await supabase.rpc('skip_break', { p_match_id: m.id });
    if (error) { pushLog(`Skip break failed: ${error.message}`); return; }
    const res = data as { success?: boolean; error?: string } | null;
    if (res && res.success === false) { pushLog(res.error ?? 'Cannot skip break'); }
    else { audio.playMatchStart(); pushLog('Break skipped \u2014 next round started'); }
    loadMatch();
  }

  // After the break the controller taps Start Round (no auto-start).
  async function startNextRound() {
    const m = matchRef.current;
    if (!m) return;
    const { data, error } = await supabase.rpc('start_next_round', { p_match_id: m.id });
    if (error) { pushLog(`Start round failed: ${error.message}`); return; }
    const res = data as { success?: boolean; error?: string; current_round?: number } | null;
    if (res && res.success === false) { pushLog(res.error ?? 'Cannot start next round'); loadMatch(); return; }
    setRemaining(m.max_time);
    setRunning(true);
    audio.playMatchStart();
    pushLog(`Round ${res?.current_round ?? m.current_round + 1} started`);
    loadMatch();
  }

  // ---- Takedown window -----------------------------------------------------
  async function startTakedown() {
    const m = matchRef.current;
    if (!m) return;
    const wasRunning = runningRef.current;
    if (wasRunning) {
      takedownAutoPaused.current = true;
      setRunning(false);
    } else {
      takedownAutoPaused.current = false;
    }
    takedownHandled.current = null;
    const { error } = await supabase
      .from('matches')
      .update({ 
        status: 'takedown',
        timer_started_at: null,
        timer_paused_at: new Date().toISOString(),
        // Persist the exact current second. Without this, the realtime
        // reload in loadMatch() restores the stale timer_seconds written
        // at Start (max_time), resetting the clock to 3:00.
        timer_seconds: remainingRef.current,
        timer_before_takedown: remainingRef.current,
        takedown_timer_seconds: TAKEDOWN_SECONDS
      })
      .eq('id', m.id);
    if (error) {
      // Surface silent failures (RLS / expired session) instead of doing nothing.
      takedownAutoPaused.current = false;
      if (wasRunning) setRunning(true);
      pushLog(`Takedown failed: ${error.message}`);
      return;
    }
    playTakedown();
    pushLog('TAKEDOWN window started (30s)');
  }

  async function endTakedown() {
    const m = matchRef.current;
    if (!m) return;
    // Restore the exact second saved when the takedown started; fall back
    // to the local countdown value if the save slot is missing.
    const saved = m.timer_before_takedown ?? remainingRef.current;
    setRemaining(saved);
    remainingRef.current = saved;
    if (takedownAutoPaused.current) {
      takedownAutoPaused.current = false;
      setRunning(true);
      playTimerStart();
      audio.playMatchStart();
      const { error } = await supabase
        .from('matches')
        .update({ status: 'live', timer_started_at: new Date().toISOString(), timer_paused_at: null, timer_seconds: saved, timer_before_takedown: null })
        .eq('id', m.id);
      if (error) { setRunning(false); pushLog(`End takedown failed: ${error.message}`); return; }
    } else {
      const { error } = await supabase
        .from('matches')
        .update({ status: 'paused', timer_paused_at: new Date().toISOString(), timer_seconds: saved, timer_before_takedown: null })
        .eq('id', m.id);
      if (error) { pushLog(`End takedown failed: ${error.message}`); return; }
    }
    pushLog(`Takedown window ended \u2014 resumed at ${formatTime(saved)}`);
  }

  // Auto-revert when the takedown timer expires.
  useEffect(() => {
    if (match?.status !== 'takedown' || !match.timer_paused_at) return;
    if (takedownRemaining > 0) return;
    if (takedownHandled.current === match.timer_paused_at) return;
    takedownHandled.current = match.timer_paused_at;
    endTakedown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takedownRemaining, match?.status, match?.timer_paused_at]);

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



  async function endMatch(winner: Side, method: (typeof WIN_METHODS)[number]) {
    const m = matchRef.current;
    if (!m) return;
    setRunning(false);
    const { data, error } = await supabase.rpc('end_match', {
      p_match_id: m.id,
      p_winner_side: winner,
      p_win_method: method,
    });
    playFanfare();
    audio.playMatchEnd();
    setWinDialog(null);
    setDqSide(null);
    setLog([]);
    if (error) {
      pushLog(`End match failed: ${error.message}`);
    } else {
      const res = data as { auto_advanced?: boolean; message?: string } | null;
      if (res?.auto_advanced) pushLog('Next match loading\u2026');
      if (res?.message) pushLog(res.message);
    }
    loadMatch();
  }

  // ---- Render guards -----------------------------------------------------
  if (loading || !ready || Number.isNaN(court) || (court !== 1 && court !== 2)) return null;
  if (!tournament) {
    return <main className="flex min-h-screen items-center justify-center text-gray-400">Tournament not found.</main>;
  }
  if (!user) {
    return <PinPad title={`${tournament.name} \u2014 Court ${court === 1 ? 'A' : 'B'} Controller`} onSubmit={(pin) => login(pin, slug)} />;
  }
  if (user.role !== 'controller' || user.court_access !== court || (user.tournament_id && user.tournament_id !== tournament.id)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Access denied: this device is not the Court {court === 1 ? 'A' : 'B'} controller for this tournament.</p>
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

  if (match.events?.category?.includes('form_bon_kata') || match.events?.category?.includes('special_techniques')) {
    return (
      <FormControlView 
        match={match} 
        user={user} 
        tournament={tournament} 
        court={court} 
        logout={logout} 
      />
    );
  }

  const btn = 'min-h-[80px] rounded-xl font-headline text-xl font-bold transition active:scale-95 disabled:opacity-30';
  const smallBtn = 'rounded-lg px-3 py-2 text-sm font-bold active:scale-95';
  const judgesConnected = new Set(votes.map((v) => v.judge_id)).size;
  const badgeState: BadgeState = breakActive ? 'break' : takedownActive ? 'takedown' : match.status;

  return (
    <main className="kiosk flex min-h-screen flex-col gap-3 bg-navy p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-black/30 px-4 py-2 text-sm">
        <span className="font-headline font-bold uppercase tracking-widest">Court {court === 1 ? 'A' : 'B'} &middot; Controller</span>
        <span className="text-text-muted">{ROUND_LABELS[match.round]} &middot; Match {match.match_number} &middot; Round {match.current_round} of {totalRounds}</span>
        <StatusBadge state={badgeState} />
        <ConnectionDot connected={judgesConnected} />
        <SoundToggle />
        <button onClick={logout} className="text-text-muted underline">{user.name}</button>
      </div>

      <BroadcastBanner tournamentId={tournament.id} />

      {/* Break / takedown state banners */}
      {breakActive && (
        <div className="flex items-center justify-center gap-4 rounded-xl bg-yellow-500 p-3 text-black">
          <span className="text-3xl font-black">BREAK &mdash; {formatTime(breakRemaining)}</span>
          <button onClick={skipBreak} className="rounded-lg bg-black px-4 py-2 font-bold text-white">Skip Break</button>
        </div>
      )}
      {breakOver && (
        <div className="flex items-center justify-center gap-4 rounded-xl bg-green-800 p-3">
          <span className="text-2xl font-black">Break over &mdash; ready for Round {match.current_round + 1}</span>
          <button onClick={startNextRound} className="rounded-lg bg-green-500 px-6 py-2 text-xl font-black text-black">Start Round {match.current_round + 1}</button>
        </div>
      )}
      {takedownActive && (
        <div className="flex animate-pulse items-center justify-center gap-4 rounded-xl bg-purple-600 p-3">
          <span className="text-3xl font-black">TAKEDOWN ONGOING</span>
          <button onClick={endTakedown} className="rounded-lg bg-black px-4 py-2 font-bold">End Takedown</button>
        </div>
      )}

      {/* 8-Point TKO Gap Banner */}
      {match.tko_available && !tkoDismissed && match.status !== 'completed' && (() => {
        const leadingSide: Side = match.blue_score >= match.red_score ? 'blue' : 'red';
        const leadingName = leadingSide === 'blue' ? match.blue?.name : match.red?.name;
        const gap = Math.abs(match.blue_score - match.red_score);
        return (
          <div className="flex animate-pulse items-center justify-between gap-4 rounded-xl bg-orange-600 p-3">
            <div>
              <p className="text-2xl font-black">⚠️ 8-POINT GAP DETECTED</p>
              <p className="text-orange-100">{leadingName ?? leadingSide.toUpperCase()} leads by {gap} points</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setWinDialog(leadingSide); }}
                className="rounded-lg bg-white px-4 py-2 font-black text-orange-700"
              >
                Declare TKO
              </button>
              <button
                onClick={() => setTkoDismissed(true)}
                className="rounded-lg bg-black/40 px-4 py-2 font-bold"
              >
                Continue Match
              </button>
            </div>
          </div>
        );
      })()}

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

      {/* Timer + special-state controls */}
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl bg-gray-900 p-3">
        {takedownActive ? (
          <div className="flex flex-col pr-4 text-center">
            <span className="font-mono text-2xl font-bold text-gray-400">Match: {formatTime(remaining)} (PAUSED)</span>
            <span className="font-mono text-6xl font-black text-purple-400 tabular-nums">Takedown: {formatTime(takedownRemaining)}</span>
          </div>
        ) : (
          <span className="font-mono text-6xl font-black tabular-nums">{formatTime(remaining)}</span>
        )}
        <button disabled={running || breakActive} onClick={startTimer} className={`${btn} bg-green-700 px-6`}>Start</button>
        <button disabled={!running} onClick={pauseTimer} className={`${btn} bg-gray-700 px-6`}>Pause</button>
        <button disabled={breakActive} onClick={resetTimer} className={`${btn} bg-gray-700 px-6`}>Reset</button>
        <button disabled={breakActive} onClick={endRound} className={`${btn} bg-yellow-600 px-6 text-black`}>End Round</button>
        <button disabled={takedownActive || breakActive} onClick={startTakedown} className={`${btn} bg-purple-700 px-6`}>Takedown</button>
        <button onClick={() => setWinDialog(match.blue_score >= match.red_score ? 'blue' : 'red')} className={`${btn} bg-orange-700 px-6`}>End Match</button>
        <VoiceScoring onScore={(side, action) => manualCommit(side, action as ScoreActionType)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button onClick={undoLast} className={`${btn} bg-gray-700`}>Undo Last</button>
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
