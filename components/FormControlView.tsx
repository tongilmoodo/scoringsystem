'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Flag from '@/components/Flag';
import { ATHLETE_SELECT, formatTime, type Match } from '@/lib/types';
import { ConnectionDot } from '@/components/ui/StatusBadge';
import { type AppUser } from '@/lib/useAuth';

export default function FormControlView({
  match,
  user,
  tournament,
  court,
  logout,
}: {
  match: Match;
  user: AppUser | null;
  tournament: any;
  court: number;
  logout: () => void;
}) {
  const [online, setOnline] = useState(false);
  const [scores, setScores] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nextMatch, setNextMatch] = useState<Match | null>(null);

  const [remaining, setRemaining] = useState(match.timer_seconds ?? 0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!match) return;
      if (match.status === 'live' && match.timer_started_at) {
        const elapsed = Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000);
        setRemaining(Math.max(0, match.timer_seconds - elapsed));
      } else {
        setRemaining(match.timer_seconds);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [match]);

  useEffect(() => {
    setOnline(true);
    // Load initial scores
    supabase
      .from('form_scores')
      .select('*')
      .eq('match_id', match.id)
      .then(({ data }) => {
        if (data) setScores(data);
      });

    // Load next match
    supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('event_id', match.event_id)
      .eq('status', 'scheduled')
      .order('match_number', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) setNextMatch(data[0] as Match);
      });

    const ch = supabase
      .channel(`ctrl-${match.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'form_scores', filter: `match_id=eq.${match.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setScores((prev) => [...prev.filter((s) => s.judge_id !== payload.new.judge_id), payload.new]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [match.id, match.event_id]);

  const commitAverage = async () => {
    if (scores.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const avg = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
      const { error: err } = await supabase.rpc('commit_form_average', {
        p_match_id: match.id,
        p_controller_name: user?.name ?? 'Controller',
      });
      if (err) throw err;
    } catch (e: any) {
      setError(e.message ?? 'Failed to commit score');
      setSubmitting(false);
    }
  };

  const startPerformance = async () => {
    if (!match) return;
    await supabase
      .from('matches')
      .update({ status: 'live', timer_started_at: new Date().toISOString() })
      .eq('id', match.id);
  };

  const advanceToNextMatch = async () => {
    if (!nextMatch) return;
    await supabase
      .from('matches')
      .update({ status: 'assigned', court_number: court })
      .eq('id', nextMatch.id);
  };

  const [cooldown, setCooldown] = useState(0);
  const [completionTime, setCompletionTime] = useState<number | null>(null);

  useEffect(() => {
    if (match?.status === 'completed' && !completionTime) {
      setCompletionTime(Date.now());
    } else if (match?.status !== 'completed') {
      setCompletionTime(null);
    }
  }, [match?.status, completionTime]);

  useEffect(() => {
    if (!completionTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - completionTime) / 1000);
      setCooldown(Math.max(0, 10 - elapsed));
    }, 250);
    return () => clearInterval(interval);
  }, [completionTime]);

  const athlete = match.blue;
  const isCompleted = match.status === 'completed';
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
      : 0;

  return (
    <main className="kiosk flex min-h-screen flex-col gap-3 bg-navy p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">Court {court === 1 ? 'A' : 'B'} &middot; Controller</span>
        <span>{match.events?.name ?? 'Form / Special Techniques'} &middot; Match {match.match_number}</span>
        <div className="flex items-center gap-4">
          <ConnectionDot connected={scores.length} />
          <span className="font-mono font-bold tabular-nums text-white text-xl">
            {formatTime(remaining)}
          </span>
        </div>
        <span className={online ? 'text-success' : 'font-bold text-warning'}>
          {online ? 'Online' : 'Offline'}
        </span>
        <span
          className={`rounded px-2 py-1 text-xs font-bold ${
            isCompleted
              ? 'bg-green-700 text-white'
              : match.status === 'live'
              ? 'bg-blue-500 text-white animate-pulse'
              : 'bg-yellow-600 text-black'
          }`}
        >
          {isCompleted ? 'COMPLETED' : match.status === 'live' ? 'LIVE' : 'READY'}
        </span>
        <button onClick={logout} className="text-gray-400 underline">
          {user?.name}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {/* Athlete panel */}
        <div className="relative flex flex-1 flex-col gap-3 rounded-xl bg-blue-900 p-8">
          <div className="text-center">
            <p className="text-4xl font-bold mb-2">{athlete?.name ?? 'TBD'}</p>
            <p className="flex items-center justify-center gap-2 text-white/80 text-2xl">
              <Flag code={athlete?.country_code} size={32} />
              <span>{athlete?.team ?? ''}</span>
            </p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center mt-8">
            <p className="text-gray-400 text-xl uppercase tracking-widest mb-2">Live Average</p>
            <p className="text-[10rem] font-black tabular-nums leading-none tracking-tighter">
              {isCompleted ? (match.blue_score / 10).toFixed(1) : (avgScore / 10).toFixed(1)}
            </p>
            <p className="mt-4 text-2xl text-white/70">
              {scores.length} / 4 Judges Submitted
            </p>
          </div>

          <div className="grid grid-cols-4 gap-4 my-8">
            {Array.from({ length: 4 }).map((_, i) => {
              const s = scores[i];
              return (
                <div key={i} className="bg-black/30 rounded-lg p-6 text-center">
                  <p className="text-gray-400 mb-2">Judge {i + 1}</p>
                  {s ? (
                    <p className="text-5xl font-bold">{(s.score / 10).toFixed(1)}</p>
                  ) : (
                    <p className="text-5xl font-bold text-gray-600">--</p>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <p className="rounded bg-yellow-500 text-black px-4 py-2 text-center text-lg font-bold mb-4">
              {error}
            </p>
          )}

          {isCompleted ? (
            <div className="flex flex-col items-center gap-4 mt-auto">
              <p className="text-3xl font-bold text-success">
                Match Completed — Score: {(match.blue_score / 10).toFixed(1)}
              </p>
              {nextMatch ? (
                <button
                  onClick={advanceToNextMatch}
                  disabled={cooldown > 0}
                  className={`min-h-[100px] w-full rounded-xl font-headline text-3xl font-bold transition ${
                    cooldown > 0 
                      ? 'bg-gray-600 cursor-not-allowed opacity-80' 
                      : 'bg-purple-600 hover:bg-purple-500 animate-pulse'
                  }`}
                >
                  {cooldown > 0 
                    ? `WAIT FOR ANNOUNCEMENT (${cooldown}s)...` 
                    : `▶ NEXT ATHLETE: ${(nextMatch as any).blue?.name ?? 'Next'}`}
                </button>
              ) : (
                <p className="text-gray-400 text-xl">No more athletes — event complete!</p>
              )}
            </div>
          ) : match.status === 'assigned' ? (
            <button
              onClick={startPerformance}
              className="min-h-[100px] rounded-xl bg-blue-600 hover:bg-blue-500 font-headline text-4xl font-bold transition animate-pulse"
            >
              ▶ START PERFORMANCE
            </button>
          ) : (
            <button
              onClick={commitAverage}
              disabled={scores.length === 0 || submitting}
              className={`min-h-[100px] rounded-xl font-headline text-3xl font-bold transition ${
                scores.length === 4
                  ? 'bg-green-600 hover:bg-green-500 animate-pulse'
                  : 'bg-gray-600'
              } disabled:opacity-50`}
            >
              {submitting ? 'COMMITTING...' : `COMMIT AVERAGE SCORE (${scores.length}/4 judges)`}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
