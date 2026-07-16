'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import UpcomingMatchesView from '@/components/UpcomingMatchesView';

// Tournament-scoped /t/[slug]/upcoming
export default function TournamentUpcomingPage() {
  const params = useParams();
  const slug = String(params.slug);
  const [tournamentId, setTournamentId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setTournamentId(data.id);
      });
  }, [slug]);

  if (!tournamentId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-gray-400">
        <p className="animate-pulse">Loading…</p>
      </main>
    );
  }

  return (
    <UpcomingMatchesView
      tournamentId={tournamentId}
      scoreboardHref={`/t/${slug}/scoreboard`}
    />
  );
}
