import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Flag from '@/components/Flag';
import { formatTime, type Match, type User } from '@/lib/types';
import { ConnectionDot } from '@/components/ui/StatusBadge';

export default function FormControlView({
  match,
  user,
  tournament,
  court,
  online,
  logout,
}: {
  match: Match;
  user: User;
  tournament: any;
  court: number;
  online: boolean;
  logout: () => void;
}) {
  const [scores, setScores] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScores = useCallback(async () => {
    if (!match) return;
    const { data } = await supabase
      .from('form_scores')
      .select('score, judge_id')
      .eq('match_id', match.id);
    setScores(data || []);
  }, [match?.id]);

  useEffect(() => {
    loadScores();
    if (!match) return;
    const ch = supabase
      .channel(`form_scores:${match.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'form_scores', filter: `match_id=eq.${match.id}` },
        () => loadScores()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [match?.id, loadScores]);

  const commitAverage = async () => {
    if (!match || scores.length === 0) return;
    setSubmitting(true);
    try {
      const { data, error: err } = await supabase.rpc('commit_form_average', {
        p_match_id: match.id,
        p_controller_name: user.name,
      });
      if (err) throw err;
      if (!data.success) throw new Error(data.message || 'Failed to commit average');
    } catch (e: any) {
      setError(e.message ?? 'Error committing score');
      setSubmitting(false);
    }
  };

  const athlete = match.blue;
  const isCompleted = match.status === 'completed';
  const avgScore = scores.length > 0 
    ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length) 
    : 0;

  return (
    <main className="kiosk flex min-h-screen flex-col gap-3 bg-navy p-3">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm">
        <span className="font-bold">Court {court === 1 ? 'A' : 'B'} &middot; Controller</span>
        <span>Form / Special Techniques &middot; Match {match.match_number}</span>
        <ConnectionDot connected={4} />
        <span className={online ? 'text-success' : 'font-bold text-warning'}>
          {online ? 'Online' : 'Offline'}
        </span>
        <button onClick={logout} className="text-gray-400 underline">{user.name}</button>
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
            <div className="mt-auto text-center">
              <p className="text-3xl font-bold text-success mb-2">Match Completed</p>
              <p className="text-gray-400 text-xl">Score: {(match.blue_score / 10).toFixed(1)}</p>
            </div>
          ) : (
            <button 
              onClick={commitAverage}
              disabled={scores.length === 0 || submitting}
              className={`min-h-[100px] rounded-xl font-headline text-3xl font-bold transition ${
                scores.length === 4 ? 'bg-green-600 hover:bg-green-500 animate-pulse' : 'bg-gray-600'
              } disabled:opacity-50`}
            >
              {submitting ? 'COMMITTING...' : 'COMMIT AVERAGE SCORE'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
