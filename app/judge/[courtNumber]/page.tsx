'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useOfflineQueue } from '@/lib/store';
import { playChime } from '@/lib/sounds';
import PinPad from '@/components/PinPad';
import {
  ACTION_LABELS,
  ATHLETE_SELECT,
  formatTime,
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

function label(a: string) {
  return ACTION_LABELS[a as ScoreActionType] ?? a;
}

export function tallyText(votes: JudgeVote[], side: Side) {
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
  const court = Number(useParams().courtNumber);
  const { user, ready, login, logout } = useAuth();
  const { votes: queued, enqueue, clear } = useOfflineQueue();

  const [match, setMatch] = useState<Match | null>(null);
  const [votes, setVotes] = useState<JudgeVote[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [remaining, setRemaining] = useState(0);
  const [online, setOnline] = useState(true);

  const loadMatch = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('court_number', court)
      .in('status', ['assigned', 'live', 'paused'])
      .order('match_number')
      .limit(1)
      .maybeSingle();
    setMatch((data as Match | null) ?? null);
  }, [court]);

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
    if (user) loadMatch();
  }, [user, loadMatch]);

  useEffect(() => {
    const ch = supabase
      .channel(`matches:court:${court}:judge`)
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

  // Live vote tally for the current match.
  useEffect(() => {
    loadVotes();
    if (!match) return;
    const ch = supabase
      .channel(`judge_votes:court:${court}:${match.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'judge_votes', filter: `match_id=eq.${match.id}` },
        () => loadVotes()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [match?.id, court, loadVotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read-only timer derived from timer_started_at.
  useEffect(() => {
    const t = setInterval(() => {
      if (!match) return;
      if (match.status === 'live' && match.timer_started_at) {
        const elapsed = Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000);
        setRemaining(Math.max(0, match.timer_seconds - elapsed));
      } else setRemaining(match.timer_seconds);
    }, 500);
    return () => clearInterval(t);
  }, [match]);

  // Offline detection + queued vote replay.
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

  async function vote(side: Side, action: ScoreActionType) {
    if (!match || !user) return;
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
      } else if (res.error === 'match_completed') {
        setFeedback({ side, text: 'Match already completed', kind: 'err' });
      } else if (res.committed) {
        playChime();
        setFeedback(null);
        setFlash({ side, text: `${label(action)} COMMITTED!` });
        setTimeout(() => setFlash(null), 1500);
      } else {
        const disagreement =
          res.top_action && res.top_action !== action
            ? `${res.top_votes} votes for ${label(res.top_action)}, ${res.votes} for ${label(action)} \u2014 need 3 to agree`
            : `Vote recorded \u2014 waiting for consensus (${res.votes}/4)`;
        setFeedback({ side, text: disagreement, kind: 'wait' });
      }
      loadVotes();
    } catch {
      enqueue({ match_id: match.id, judge_id: user.id, player_side: side, action_type: action });
      setFeedback({ side, text: 'Offline \u2014 vote queued', kind: 'err' });
    }
  }

  // ---- Render guards -----------------------------------------------------
  if (!ready || Number.isNaN(court) || (court !== 1 && court !== 2)) return null;
  if (!user) return <PinPad title={`Court ${court === 1 ? 'A' : 'B'} Judge Login`} onSubmit={login} />;
  if (user.role !== 'judge' || user.court_access !== court) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Access denied: this device is not a Court {court === 1 ? 'A' : 'B'} judge.</p>
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

  const btn = 'min-h-[80px] rounded-xl text-xl font-bold active:opacity-70 disabled:opacity-40';

  return (
    <main className="flex min-h-screen flex-col gap-3 p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">Court {court === 1 ? 'A' : 'B'} &middot; Judge</span>
        <span>{ROUND_LABELS[match.round]} &middot; Match {match.match_number}</span>
        <span className="font-mono text-lg font-black tabular-nums">{formatTime(remaining)}</span>
        {match.judges_locked && <span className="font-bold text-yellow-400">LOCKED</span>}
        <span className={online ? 'text-green-400' : 'font-bold text-yellow-400'}>
          {online ? 'Online' : `Offline \u2014 ${queued.length} queued`}
        </span>
        <button onClick={logout} className="text-gray-400 underline">{user.name}</button>
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
            <div key={side} className={`relative flex flex-col gap-3 rounded-xl p-4 ${base}`}>
              <div className="text-center">
                <p className="text-2xl font-bold">{athlete?.name ?? 'TBD'}</p>
                <p className="text-white/80">{athlete?.country_code} {athlete?.team ? `- ${athlete.team}` : ''}</p>
                <p className="text-8xl font-black tabular-nums">{score}</p>
                <p className="text-white/80">Fouls: {fouls}</p>
              </div>

              {/* Vote tally + feedback */}
              <p className="rounded bg-black/30 px-2 py-1 text-center text-sm">{tallyText(votes, side)}</p>
              {feedback?.side === side && (
                <p className={`rounded px-2 py-1 text-center text-sm font-bold ${feedback.kind === 'err' ? 'bg-yellow-500 text-black' : 'bg-black/50'}`}>
                  {feedback.text}
                </p>
              )}

              <div className="mt-auto grid grid-cols-2 gap-2">
                {ACTIONS.map((a) => (
                  <button
                    key={a}
                    disabled={match.judges_locked}
                    onClick={() => vote(side, a)}
                    className={`${btn} ${a === 'foul' ? 'bg-yellow-500 text-black' : shade}`}
                  >
                    {a === 'foul' ? '\u26a0\ufe0f ' : ''}{ACTION_LABELS[a]}
                  </button>
                ))}
              </div>

              {/* Consensus flash */}
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
        Scores commit when 3 of 4 judges agree. Timer and match control are handled by the controller.
      </p>
    </main>
  );
}
