'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useOfflineQueue } from '@/lib/store';
import { useTournamentBySlug } from '@/lib/useTournament';
import { useKiosk } from '@/lib/useKiosk';
import { playChime } from '@/lib/sounds';
import PinPad from '@/components/PinPad';
import Flag from '@/components/Flag';
import BroadcastBanner from '@/components/BroadcastBanner';
import { ConnectionDot } from '@/components/ui/StatusBadge';
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
  return (
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([a, c]) => `${label(a)} (${c})`)
      .join(' \u00b7 ') + ' \u2014 need 3'
  );
}

export default function JudgePage() {
  const params = useParams();
  const slug = String(params.slug);
  const court = Number(params.courtNumber);
  const { tournament, loading } = useTournamentBySlug(slug);
  const { user, ready, login, logout } = useAuth();
  const { votes: queued, enqueue, clear } = useOfflineQueue();

  const [match, setMatch] = useState<Match | null>(null);
  const [votes, setVotes] = useState<JudgeVote[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [remaining, setRemaining] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(true);

  // Keep the tablet awake; warn on unload while the match is live.
  useKiosk(match?.status === 'live');

  const loadMatch = useCallback(async () => {
    if (!tournament) return;
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('tournament_id', tournament.id)
      .eq('court_number', court)
      .in('status', ['assigned', 'live', 'paused'])
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
    const ch = supabase
      .channel(`matches:t:${slug}:court:${court}:judge`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournament.id}` },
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
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [match?.id, loadVotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read-only clock + break/takedown countdowns.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!match) return;
      if (match.status === 'live' && match.timer_started_at) {
        const elapsed = Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000);
        setRemaining(Math.max(0, match.timer_seconds - elapsed));
      } else setRemaining(match.timer_seconds);
    }, 500);
    return () => clearInterval(timer);
  }, [match]);

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

  const breakActive = !!match?.break_ends_at && new Date(match.break_ends_at).getTime() > now;
  const breakRemaining = breakActive
    ? Math.max(0, Math.ceil((new Date(match!.break_ends_at!).getTime() - now) / 1000))
    : 0;
  const takedownActive = !!match?.takedown_ends_at && new Date(match.takedown_ends_at).getTime() > now;
  const takedownRemaining = takedownActive
    ? Math.max(0, Math.ceil((new Date(match!.takedown_ends_at!).getTime() - now) / 1000))
    : 0;

  async function vote(side: Side, action: ScoreActionType) {
    if (!match || !user || breakActive) return;
    if (match.judges_locked) {
      setFeedback({ side, text: 'Judges locked by controller', kind: 'err' });
      return;
    }
    try {
      const { data, error } = await supabase.rpc('cast_vote', {
        p_match_id: match.id,
        p_judge_id: user.id,
        p_player_side: side,
        p_action_type: action,
      });
      if (error) throw error;
      const res = data as CastVoteResult;
      if (res.error === 'already_voted') {
        setFeedback({ side, text: 'You already voted \u2014 waiting for consensus', kind: 'err' });
      } else if (res.error === 'locked') {
        setFeedback({ side, text: 'Judges locked by controller', kind: 'err' });
      } else if (res.error === 'break') {
        setFeedback({ side, text: 'Round break \u2014 scoring paused', kind: 'err' });
      } else if (res.error === 'match_completed') {
        setFeedback({ side, text: 'Match already completed', kind: 'err' });
      } else if (res.committed) {
        playChime();
        setFeedback(null);
        setFlash({ side, text: `${label(action)} COMMITTED!` });
        setTimeout(() => setFlash(null), 1500);
      } else {
        const text =
          res.top_action && res.top_action !== action
            ? `${res.top_votes} votes for ${label(res.top_action)}, ${res.votes} for ${label(action)} \u2014 need 3 to agree`
            : `Vote recorded \u2014 waiting for consensus (${res.votes}/4)`;
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

  return (
    <main className="kiosk flex min-h-screen flex-col gap-3 bg-navy p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">Court {court === 1 ? 'A' : 'B'} &middot; Judge</span>
        <span>{ROUND_LABELS[match.round]} &middot; Match {match.match_number} &middot; Round {match.current_round}</span>
        <span className="font-mono text-lg font-black tabular-nums">{formatTime(remaining)}</span>
        {match.judges_locked && <span className="font-bold text-warning">LOCKED</span>}
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
                    disabled={match.judges_locked || breakActive}
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
