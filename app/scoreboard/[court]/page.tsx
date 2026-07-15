'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import CourtDisplay from '@/components/CourtDisplay';
import { formatSupabaseError, useLoadTimeout } from '@/lib/loadState';
import LoadFallback from '@/components/ui/LoadFallback';
import type { Tournament } from '@/lib/types';

// Public single-court display; auto-detects the active tournament.
export default function PublicSingleCourt() {
  const court = Number(useParams().court) === 2 ? 2 : 1;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const timedOut = useLoadTimeout(loading ? 'loading' : 'ready', attempt);
  const retry = () => setAttempt((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'live')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error: qErr }) => {
        if (cancelled) return;
        if (qErr) {
          // eslint-disable-next-line no-console
          console.error('[public court] tournament query failed', qErr);
          setError(formatSupabaseError(qErr));
          setTournament(null);
        } else {
          setTournament((data as Tournament | null) ?? null);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loading && !timedOut && !error) {
    return <LoadFallback timedOut={false} onRetry={retry} />;
  }
  if (error || (loading && timedOut)) {
    return <LoadFallback timedOut={timedOut} error={error} onRetry={retry} />;
  }
  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black text-center">
        <p className="font-headline text-2xl uppercase tracking-widest text-text-muted">No active tournament</p>
      </main>
    );
  }
  return (
    <main className="screen-fill overflow-hidden bg-black">
      <CourtDisplay court={court} tournamentId={tournament.id} big />
    </main>
  );
}
