'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import CourtDisplay from '@/components/CourtDisplay';
import Logo from '@/components/ui/Logo';
import { useTournamentBySlug } from '@/lib/useTournament';

export default function ScoreboardPage() {
  const slug = String(useParams().slug);
  const { tournament, loading } = useTournamentBySlug(slug);
  const [eventNames, setEventNames] = useState<Record<number, string>>({});

  // Resolve the current event name shown on each court's active match.
  useEffect(() => {
    if (!tournament) return;
    supabase
      .from('matches')
      .select('court_number, events(name)')
      .eq('tournament_id', tournament.id)
      .in('status', ['assigned', 'live', 'paused'])
      .then(({ data }) => {
        const map: Record<number, string> = {};
        (data ?? []).forEach((m: any) => {
          if (m.court_number) {
            const ev = Array.isArray(m.events) ? m.events[0] : m.events;
            map[m.court_number] = ev?.name ?? '';
          }
        });
        setEventNames(map);
      });
  }, [tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-bg-dark"><span className="animate-pulse text-text-muted">Loading&hellip;</span></main>;
  }
  if (!tournament) {
    return <main className="flex min-h-screen items-center justify-center bg-bg-dark text-text-muted">Tournament not found.</main>;
  }

  const courts = Array.from({ length: tournament.courts_count }, (_, i) => i + 1);
  return (
    <main className="flex h-screen w-screen flex-col gap-3 overflow-hidden bg-bg-dark p-3">
      <div className="flex items-center justify-center gap-3">
        <Logo size={28} />
        <h1 className="text-center font-headline text-lg uppercase tracking-[0.2em] text-text-muted md:text-2xl">{tournament.name}</h1>
      </div>
      <div className={`grid min-h-0 flex-1 gap-3 ${courts.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {courts.map((c) => (
          <CourtDisplay key={c} court={c} tournamentId={tournament.id} eventName={eventNames[c]} />
        ))}
      </div>
    </main>
  );
}
