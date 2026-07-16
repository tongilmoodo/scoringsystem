'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import CourtDisplay from '@/components/CourtDisplay';
import { formatSupabaseError, useLoadTimeout } from '@/lib/loadState';
import LoadFallback from '@/components/ui/LoadFallback';
import type { Tournament } from '@/lib/types';

// Public landing: shows ONLY the live scoreboard. Auto-detects the active
// tournament. No admin hints, no setup links, no tournament cards.
export default function PublicScoreboard() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const timedOut = useLoadTimeout(loading ? 'loading' : 'ready', attempt);
  const retry = () => setAttempt((n) => n + 1);
  const [eventNames, setEventNames] = useState<Record<number, string>>({});

  useEffect(() => {
    // NEVER read match ID from cache on public scoreboard
    if (typeof window !== 'undefined') localStorage.removeItem('scoreboard_match_id');

    async function detect() {
      // Prefer a live tournament; fall back to the most recent one with an active match.
      const { data: live, error: qErr } = await supabase
        .from('tournaments')
        .select('*')
        .eq('status', 'live')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (qErr) {
        // eslint-disable-next-line no-console
        console.error('[public scoreboard] tournament query failed', qErr);
        setError(formatSupabaseError(qErr));
        setTournament(null);
      } else {
        setError(null);
        setTournament((live as Tournament | null) ?? null);
      }
      setLoading(false);
    }
    setLoading(true);
    detect();
    const ch = supabase
      .channel('public-detect')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, detect)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (!tournament) return;
    supabase
      .from('events')
      .select('id')
      .eq('tournament_id', tournament.id)
      .then(({ data: evRows }) => {
        const evIds = (evRows ?? []).map((e: { id: string }) => e.id);
        if (!evIds.length) return;
        supabase
          .from('matches')
          .select('court_number, events(name)')
          .in('event_id', evIds)
          .in('status', ['assigned', 'live', 'paused', 'break', 'takedown'])
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
      });
  }, [tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !timedOut && !error) {
    return <LoadFallback timedOut={false} onRetry={retry} />;
  }
  if (error || (loading && timedOut)) {
    return <LoadFallback timedOut={timedOut} error={error} onRetry={retry} />;
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
    <main className="screen-fill flex flex-col gap-3 overflow-hidden bg-bg-dark p-3">
      <div className={`grid min-h-0 flex-1 gap-3 ${courts.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {courts.map((c) => (
          <CourtDisplay key={c} court={c} tournamentId={tournament.id} eventName={eventNames[c]} />
        ))}
      </div>
      {/* Tournament name + nav links */}
      <div className="flex items-center justify-between px-2">
        <p className="text-sm text-text-muted">
          {tournament.name}{tournament.location ? ` · ${tournament.location}` : ''}
        </p>
        <Link
          href="/upcoming"
          className="rounded-lg bg-white/10 px-3 py-1 text-sm font-bold text-white/70 hover:bg-white/20 hover:text-white transition"
        >
          📅 Upcoming Matches
        </Link>
      </div>
    </main>
  );
}
