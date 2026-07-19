'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useOfflineQueue } from '@/lib/store';
import { useTournamentBySlug } from '@/lib/useTournament';
import { useKiosk } from '@/lib/useKiosk';
import { useHeartbeat } from '@/lib/useHeartbeat';
import { useTrackPresence } from '@/lib/usePresence';
import { playChime } from '@/lib/sounds';
import { audio } from '@/lib/audio';
import PinPad from '@/components/PinPad';
import Flag from '@/components/Flag';
import BroadcastBanner from '@/components/BroadcastBanner';
import { ConnectionDot } from '@/components/ui/StatusBadge';
import { useServerTimeOffset } from '@/lib/useServerTime';
import FormJudgeView from '@/components/FormJudgeView';
import {
  ATHLETE_SELECT,
  formatTime,
  JUDGE_LABELS,
  ROUND_LABELS,
  type CastVoteResult,
  type JudgeVote,
  type Match,
  type ScoreActionType,
  type Side,
} from '@/lib/types';

const ACTIONS: ScoreActionType[] = ['point_1', 'point_2', 'point_3', 'foul'];

type Feedback = { side: Side; text: string; kind: 'wait' | 'err' } | null;
type Flash = { side: Side; text: string } | null;

// Judge-facing: point values only, never technique names.
function label(a: string) {
  return JUDGE_LABELS[a as ScoreActionType] ?? a;
}

function tallyText(votes: JudgeVote[], side: Side) {
  const pending = votes.filter((v) => v.player_side === side && v.status === 'pending');
  if (pending.length === 0) return 'No pending votes';
  const counts: Record<string, number> = {};
  pending.forEach((v) => {
    counts[v.action_type] = (counts[v.action_type] ?? 0) + 1;
  });
  return `${ACTIONS.map((a) => (counts[a] ? `${label(a)}(${counts[a]})` : '')).filter(Boolean).join(', ')}`;
}

export default function JudgePage() {
  const params = useParams();
  const slug = String(params.slug);
  const court = Number(params.courtNumber);
  const { tournament, loading } = useTournamentBySlug(slug);
  const { user, ready, login, logout } = useAuth();
  const { votes: queued, enqueue, clear } = useOfflineQueue();
  const serverOffset = useServerTimeOffset();

  const [match, setMatch] = useState<Match | null>(null);
  const [votes, setVotes] = useState<JudgeVote[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [remaining, setRemaining] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(true);

  // Keep the tablet awake; warn on unload while the match is live.
  useKiosk(match?.status === 'live');
  useHeartbeat(user?.id);
  // Join the court presence channel so the admin dashboard shows this judge
  // as live. Presence clears automatically when the tab closes.
  useTrackPresence(
    user?.role === 'judge' ? court : null,
    user ? { user_id: user.id, name: user.name, role: 'judge' } : null,
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
    setMatch((data as Match | null) ?? null);
  }, [court, tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadVotes = useCallback(async () => {
    if (!match) return setVotes([]);
    const { data } = await supabase
      .from('judge_votes')
      .select('*')
      .eq('match_id', match.id)
      .eq('status', 'pending');
    setVotes((data ?? []) as JudgeVote[]);
  }, [match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user && tournament) loadMatch();
  }, [user, tournament, loadMatch]);

  useEffect(() => {
    if (!tournament) return;
    // matches has no tournament_id column, so we cannot server-filter on it;
    // subscribe to all match changes and re-resolve via events in loadMatch.
    const ch = supabase
      .channel(`matches:t:${slug}:court:${court}:judge`)
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
      .channel(`judge_votes:${match.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'judge_votes', filter: `match_id=eq.${match.id}` },
        () => loadVotes()
      )
      // A committed score is written to score_events — play the score cue when
      // one lands for this match (consensus reached or manual commit).
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'score_events', filter: `match_id=eq.${match.id}` },
        () => audio.playScore()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [match?.id, loadVotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read-only clock + break/takedown countdowns.
  useEffect(() => {
    const timer = setInterval(() => {
      const serverDateNow = Date.now() + serverOffset;
      setNow(serverDateNow);
      if (!match) return;
      if (match.status === 'live' && match.timer_started_at) {
        const elapsed = Math.floor((serverDateNow - new Date(match.timer_started_at).getTime()) / 1000);
        setRemaining(Math.max(0, match.timer_seconds - elapsed));
      } else setRemaining(match.timer_seconds);
    }, 500);
    return () => clearInterval(timer);
  }, [match, serverOffset]);

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
    if (!online || queued.length === 0) return;
    (async () => {
      for (const v of queued) {
        await supabase.rpc('cast_vote', {
          p_match_id: v.match_id,
          p_judge_id: v.judge_id,
          p_player_side: v.player_side,
          p_action_type: v.action_type,
        });
      }
      clear();
    })();
  }, [online, queued, clear]);

  const breakActive = match?.status === 'break';
  const breakAnchor = match?.break_started_at ?? match?.timer_paused_at ?? null;
  const breakRemaining = breakActive && breakAnchor
    ? Math.max(0, match.break_timer_seconds - Math.floor((now - new Date(breakAnchor).getTime()) / 1000))
    : 0;
  const takedownActive = match?.status === 'takedown';
  const takedownRemaining = takedownActive && match.timer_paused_at
    ? Math.max(0, match.takedown_timer_seconds - Math.floor((now - new Date(match.timer_paused_at).getTime()) / 1000))
    : 0;

  async function vote(side: Side, action: ScoreActionType) {
    if (!match || !user || breakActive) return;
    try {
      const { data, error } = await supabase.rpc('cast_vote', {
        p_match_id: match.id,
        p_judge_id: user.id,
        p_player_side: side,
        p_action_type: action,
      });
      if (error) throw error;
      const res = data as CastVoteResult;
      // New cast_vote returns success:false with a message for inactive matches.
      if (res.success === false) {
        setFeedback({ side, text: res.message ?? res.error ?? 'Vote rejected', kind: 'err' });
      } else if (res.committed) {
        playChime();
        audio.playScoreCommitted();
        setFeedback(null);
        setFlash({ side, text: `${res.action_display ?? label(action)} COMMITTED!` });
        setTimeout(() => setFlash(null), 1500);
      } else {
        // Always render integers — never "undefined".
        const topVotes = Number(res.top_votes ?? 0);
        const totalVotes = Number(res.total_votes ?? res.votes ?? 0);
        const threshold = Number(res.threshold ?? 3);
        const text = res.message
          ? `${res.message} (${topVotes}/${threshold})`
          : `Vote recorded \u2014 waiting for consensus (${totalVotes}/4)`;
        setFeedback({ side, text, kind: 'wait' });
      }
      loadVotes();
    } catch {
      enqueue({ match_id: match.id, judge_id: user.id, player_side: side, action_type: action });
      setFeedback({ side, text: 'Offline \u2014 vote queued', kind: 'err' });
    }
  }

  // ---- Render guards -----------------------------------------------------
  if (loading || !ready || Number.isNaN(court) || (court !== 1 && court !== 2)) return null;
  if (!tournament) {
    return <main className="flex min-h-screen items-center justify-center text-gray-400">Tournament not found.</main>;
  }
  if (!user) {
    return <PinPad title={`${tournament.name} \u2014 Court ${court === 1 ? 'A' : 'B'} Judge`} onSubmit={(pin) => login(pin, slug)} />;
  }
  if (user.role !== 'judge' || user.court_access !== court || (user.tournament_id && user.tournament_id !== tournament.id)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Access denied: this device is not a Court {court === 1 ? 'A' : 'B'} judge for this tournament.</p>
        <button onClick={logout} className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Switch user</button>
      </main>
    );
  }
  if (!match) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2">
        <h1 className="text-2xl font-bold">Court {court === 1 ? 'A' : 'B'} &mdash; Judge</h1>
        <p className="text-gray-400">Waiting for a match assignment&hellip;</p>
      </main>
    );
  }

  const btn = 'min-h-[120px] rounded-xl font-headline text-2xl font-bold transition active:scale-95 active:brightness-125 disabled:opacity-30 disabled:pointer-events-none';
  const judgesConnected = new Set(votes.map((v) => v.judge_id)).size;

  const isFormEvent = match.events?.category?.includes('form_bon_kata') || match.events?.category?.includes('special_techniques');

  if (isFormEvent) {
    return (
      <FormJudgeView 
        match={match} 
        user={user} 
        tournament={tournament} 
        court={court} 
        online={online} 
        logout={logout} 
      />
    );
  }

  return (
    <main className="kiosk flex min-h-screen flex-col gap-3 bg-navy p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">Court {court === 1 ? 'A' : 'B'} &middot; Judge</span>
        <span>{ROUND_LABELS[match.round]} &middot; Match {match.match_number} &middot; Round {match.current_round}</span>
        <span className="font-mono text-lg font-black tabular-nums">{formatTime(remaining)}</span>
        {breakActive && <span className="font-bold text-warning">BREAK</span>}
        <ConnectionDot connected={judgesConnected} />
        <span className={online ? 'text-success' : 'font-bold text-warning'}>
          {online ? 'Online' : `Offline \u2014 ${queued.length} queued`}
        </span>
        <button onClick={logout} className="text-gray-400 underline">{user.name}</button>
      </div>

      <BroadcastBanner tournamentId={tournament.id} />

      {/* Break / takedown banners */}
      {breakActive && (
        <div className="rounded-xl bg-yellow-500 p-4 text-center text-3xl font-black text-black">
          BREAK &mdash; {formatTime(breakRemaining)}
        </div>
      )}
      {!breakActive && takedownActive && (
        <div className="animate-pulse rounded-xl bg-purple-600 p-4 text-center text-3xl font-black">
          TAKEDOWN &mdash; SCORE NOW ({formatTime(takedownRemaining)})
        </div>
      )}

      {/* Athlete panels */}
      <div className="grid flex-1 grid-cols-2 gap-3">
        {(['blue', 'red'] as const).map((side) => {
          const athlete = side === 'blue' ? match.blue : match.red;
          const score = side === 'blue' ? match.blue_score : match.red_score;
          const fouls = side === 'blue' ? match.blue_fouls : match.red_fouls;
          const base = side === 'blue' ? 'bg-blue-600' : 'bg-red-600';
          const shade = side === 'blue' ? 'bg-blue-800' : 'bg-red-800';
          return (
            <div key={side} className={`relative flex flex-col gap-3 rounded-xl p-4 ${base} ${takedownActive ? 'ring-4 ring-purple-400' : ''}`}>
              <div className="text-center">
                <p className="text-2xl font-bold">{athlete?.name ?? 'TBD'}</p>
                <p className="flex items-center justify-center gap-2 text-white/80"><Flag code={athlete?.country_code} size={24} /><span>{athlete?.team ?? ''}</span></p>
                <p className="text-8xl font-black tabular-nums">{score}</p>
                <p className="text-white/80">Fouls: {fouls}</p>
              </div>

              <p className="rounded bg-black/30 px-2 py-1 text-center text-sm">{tallyText(votes, side)}</p>
              {feedback?.side === side && (
                <p className={`rounded px-2 py-1 text-center text-sm font-bold ${feedback.kind === 'err' ? 'bg-yellow-500 text-black' : 'bg-black/50'}`}>
                  {feedback.text}
                </p>
              )}

              {/* Point-value-only buttons: no technique labels. */}
              <div className="mt-auto grid grid-cols-2 gap-2">
                {ACTIONS.map((a) => (
                  <button
                    key={a}
                    disabled={breakActive}
                    onClick={() => vote(side, a)}
                    className={`${btn} ${a === 'foul' ? 'bg-yellow-500 text-black' : shade}`}
                  >
                    {JUDGE_LABELS[a]}
                  </button>
                ))}
              </div>

              {flash?.side === side && (
                <div className="absolute inset-0 z-10 flex animate-pulse items-center justify-center rounded-xl bg-green-600/90">
                  <p className="text-4xl font-black">{flash.text}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-500">
        Score the point value you observed. Commits when 3 of 4 judges agree.
      </p>
    </main>
  );
}
