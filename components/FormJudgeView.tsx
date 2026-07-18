'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Flag from '@/components/Flag';
import { type Match } from '@/lib/types';
import { ConnectionDot } from '@/components/ui/StatusBadge';
import { type AppUser } from '@/lib/useAuth';

export default function FormJudgeView({
  match: initialMatch,
  user,
  tournament,
  court,
  online,
  logout,
}: {
  match: Match;
  user: AppUser | null;
  tournament: any;
  court: number;
  online: boolean;
  logout: () => void;
}) {
  // Track live match status via realtime so the judge reacts to START/NEXT
  const [match, setMatch] = useState<Match>(initialMatch);
  const [score, setScore] = useState<number>(100); // 10.0
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when parent passes a new match (e.g. after auto-advance)
  useEffect(() => {
    setMatch(initialMatch);
    setScore(100);
    setSubmitted(false);
    setError(null);
  }, [initialMatch.id]);

  // Subscribe to live status changes on this match
  useEffect(() => {
    const ch = supabase
      .channel(`match_status_judge:${match.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
        (payload) => {
          setMatch((prev) => ({ ...prev, ...payload.new } as Match));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [match.id]);

  const formatScore = (val: number) => (val / 10).toFixed(1);

  const applyDeduction = (amount: number) => {
    if (submitted || match.status !== 'live') return;
    setScore((prev) => Math.max(0, prev - amount));
  };

  const submitScore = async () => {
    if (submitted) return;
    try {
      const { data, error: err } = await supabase.rpc('submit_form_score', {
        p_match_id: match.id,
        p_judge_id: user?.id,
        p_score: score,
      });
      if (err) throw err;
      setSubmitted(true);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit score');
    }
  };

  const athlete = match.blue;
  const isWaiting = match.status === 'assigned' || match.status === 'scheduled';
  const isCompleted = match.status === 'completed';
  const btn = 'min-h-[100px] rounded-xl font-headline text-2xl font-bold transition active:scale-95 active:brightness-125 disabled:opacity-30 disabled:pointer-events-none';

  return (
    <main className="kiosk flex min-h-screen flex-col gap-3 bg-navy p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">Court {court === 1 ? 'A' : 'B'} &middot; Judge</span>
        <span>Form / Special Techniques &middot; Match {match.match_number}</span>
        <ConnectionDot connected={4} />
        <span
          className={`rounded px-2 py-1 text-xs font-bold ${
            isCompleted ? 'bg-green-700 text-white' : match.status === 'live' ? 'bg-blue-500 text-white animate-pulse' : 'bg-yellow-600 text-black'
          }`}
        >
          {isCompleted ? 'COMPLETED' : match.status === 'live' ? 'LIVE' : 'WAITING'}
        </span>
        <span className={online ? 'text-success' : 'font-bold text-warning'}>
          {online ? 'Online' : 'Offline'}
        </span>
        <button onClick={logout} className="text-gray-400 underline">{user?.name}</button>
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

          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-gray-400 text-xl uppercase tracking-widest mb-2">Current Score</p>
            <p className="text-[12rem] font-black tabular-nums leading-none tracking-tighter">
              {formatScore(score)}
            </p>
          </div>

          {error && (
            <p className="rounded bg-yellow-500 text-black px-4 py-2 text-center text-lg font-bold mb-4">
              {error}
            </p>
          )}

          {isWaiting && (
            <div className="mt-auto flex flex-col items-center gap-4 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
              <p className="text-2xl font-bold text-yellow-400">Waiting for controller to start...</p>
            </div>
          )}

          {isCompleted && (
            <div className="text-center mt-auto py-8">
              <p className="text-3xl font-bold text-success mb-2">Match Completed</p>
              <p className="text-gray-400">Waiting for next athlete...</p>
            </div>
          )}

          {!isWaiting && !isCompleted && (
            submitted ? (
              <div className="text-center mt-auto">
                <p className="text-3xl font-bold text-success mb-2">✓ Score Submitted: {formatScore(score)}</p>
                <p className="text-gray-400">Waiting for controller to commit...</p>
              </div>
            ) : (
              <div className="mt-auto grid gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <button onClick={() => applyDeduction(1)} className={`${btn} bg-red-600`}>-0.1</button>
                  <button onClick={() => applyDeduction(2)} className={`${btn} bg-red-700`}>-0.2</button>
                  <button onClick={() => applyDeduction(3)} className={`${btn} bg-red-800`}>-0.3</button>
                </div>
                <button
                  onClick={submitScore}
                  className={`${btn} bg-blue-600 hover:bg-blue-500 mt-4 min-h-[120px] text-4xl`}
                >
                  SUBMIT SCORE
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}
