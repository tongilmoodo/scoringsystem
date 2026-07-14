'use client';

import { useParams } from 'next/navigation';
import CourtDisplay from '@/components/CourtDisplay';
import { useTournamentBySlug } from '@/lib/useTournament';

export default function SingleCourtScoreboard() {
  const params = useParams();
  const slug = String(params.slug);
  const court = Number(params.court) === 2 ? 2 : 1;
  const { tournament, loading } = useTournamentBySlug(slug);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-black"><span className="animate-pulse text-text-muted">Loading&hellip;</span></main>;
  }
  if (!tournament) {
    return <main className="flex min-h-screen items-center justify-center bg-black text-text-muted">Tournament not found.</main>;
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <CourtDisplay court={court} tournamentId={tournament.id} big />
    </main>
  );
}
