'use client';

import { useParams } from 'next/navigation';
import CourtDisplay from '@/components/CourtDisplay';
import { useTournamentBySlug } from '@/lib/useTournament';
import { useLoadTimeout } from '@/lib/loadState';
import LoadFallback from '@/components/ui/LoadFallback';

export default function SingleCourtScoreboard() {
  const params = useParams();
  const slug = String(params.slug);
  const court = Number(params.court) === 2 ? 2 : 1;
  const { tournament, loading, error, retry, attempt } = useTournamentBySlug(slug);
  const timedOut = useLoadTimeout(loading ? 'loading' : 'ready', attempt);

  if (loading && !timedOut && !error) {
    return <LoadFallback timedOut={false} onRetry={retry} />;
  }
  if (error || (loading && timedOut)) {
    return <LoadFallback timedOut={timedOut} error={error} onRetry={retry} />;
  }
  if (!tournament) {
    return <main className="flex min-h-screen items-center justify-center bg-black text-text-muted">Tournament not found.</main>;
  }

  return (
    <main className="screen-fill overflow-hidden bg-black">
      <CourtDisplay court={court} tournamentId={tournament.id} big />
    </main>
  );
}
