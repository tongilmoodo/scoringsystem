'use client';

import { useParams } from 'next/navigation';
import CourtDisplay from '@/components/CourtDisplay';
import { useTournamentBySlug } from '@/lib/useTournament';

export default function SingleCourtScoreboard() {
  const params = useParams();
  const slug = String(params.slug);
  const court = Number(params.court) === 2 ? 2 : 1;
  const { tournament, loading } = useTournamentBySlug(slug);

  if (loading) return null;
  if (!tournament) {
    return <main className="flex min-h-screen items-center justify-center text-gray-400">Tournament not found.</main>;
  }

  return (
    <main className="flex min-h-screen flex-col bg-black p-4">
      <CourtDisplay court={court} tournamentId={tournament.id} big />
    </main>
  );
}
