'use client';

import { useParams } from 'next/navigation';
import CourtDisplay from '@/components/CourtDisplay';
import { useTournamentBySlug } from '@/lib/useTournament';

export default function ScoreboardPage() {
  const slug = String(useParams().slug);
  const { tournament, loading } = useTournamentBySlug(slug);

  if (loading) return null;
  if (!tournament) {
    return <main className="flex min-h-screen items-center justify-center text-gray-400">Tournament not found.</main>;
  }

  const courts = Array.from({ length: tournament.courts_count }, (_, i) => i + 1);
  return (
    <main className="flex min-h-screen flex-col gap-4 bg-gray-950 p-4">
      <h1 className="text-center text-xl font-black text-gray-300">{tournament.name}</h1>
      <div className={`grid flex-1 gap-4 ${courts.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {courts.map((c) => (
          <CourtDisplay key={c} court={c} tournamentId={tournament.id} />
        ))}
      </div>
    </main>
  );
}
