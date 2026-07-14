'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import CourtDisplay from '@/components/CourtDisplay';
import type { Tournament } from '@/lib/types';

// Public single-court display; auto-detects the active tournament.
export default function PublicSingleCourt() {
  const court = Number(useParams().court) === 2 ? 2 : 1;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'live')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setTournament((data as Tournament | null) ?? null);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-black"><span className="animate-pulse text-text-muted">Loading&hellip;</span></main>;
  }
  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black text-center">
        <p className="font-headline text-2xl uppercase tracking-widest text-text-muted">No active tournament</p>
      </main>
    );
  }
  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <CourtDisplay court={court} tournamentId={tournament.id} big />
    </main>
  );
}
