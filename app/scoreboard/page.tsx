'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import CourtDisplay from '@/components/CourtDisplay';
import type { Tournament } from '@/lib/types';

// Public landing: shows ONLY the live scoreboard. Auto-detects the active
// tournament. No admin hints, no setup links, no tournament cards.
export default function PublicScoreboard() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventNames, setEventNames] = useState<Record<number, string>>({});

  useEffect(() => {
    async function detect() {
      // Prefer a live tournament; fall back to the most recent one with an active match.
      const { data: live } = await supabase
        .from('tournaments')
        .select('*')
        .eq('status', 'live')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setTournament((live as Tournament | null) ?? null);
      setLoading(false);
    }
    detect();
    const ch = supabase
      .channel('public-detect')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, detect)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

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
            // Supabase might return events as an array or single object depending on types
            const ev = Array.isArray(m.events) ? m.events[0] : m.events;
            map[m.court_number] = ev?.name ?? '';
          }
        });
        setEventNames(map);
      });
  }, [tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-dark">
        <span className="animate-pulse font-headline text-xl uppercase tracking-widest text-text-muted">Loading&hellip;</span>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-dark text-center">
        <h1 className="font-headline text-3xl font-bold uppercase tracking-[0.2em] text-white md:text-5xl">
          Tong-Il Moo-Do Scoring System
        </h1>
        <p className="font-headline text-xl uppercase tracking-widest text-text-muted">No active tournament</p>
      </main>
    );
  }

  const courts = Array.from({ length: tournament.courts_count }, (_, i) => i + 1);
  return (
    <main className="flex h-screen w-screen flex-col gap-3 overflow-hidden bg-bg-dark p-3">
      <div className={`grid min-h-0 flex-1 gap-3 ${courts.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {courts.map((c) => (
          <CourtDisplay key={c} court={c} tournamentId={tournament.id} eventName={eventNames[c]} />
        ))}
      </div>
      {/* Tournament name only as small muted text below the scores. */}
      <p className="text-center text-sm text-text-muted">
        {tournament.name}{tournament.location ? ` \u00b7 ${tournament.location}` : ''}
      </p>
    </main>
  );
}
