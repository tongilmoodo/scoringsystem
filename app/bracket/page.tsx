'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import BracketView from '@/components/BracketView';
import { ATHLETE_SELECT, type Match, type Tournament } from '@/lib/types';

interface EventRow {
  id: string;
  name: string;
}

// Public bracket; auto-detects the active tournament.
export default function PublicBracketAuto() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'live')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setTournament((data as Tournament | null) ?? null));
  }, []);

  useEffect(() => {
    if (!tournament) return;
    supabase
      .from('events')
      .select('id, name')
      .eq('tournament_id', tournament.id)
      .eq('bracket_status', 'published')
      .order('created_at')
      .then(({ data }) => {
        const evs = (data ?? []) as EventRow[];
        setEvents(evs);
        if (evs[0]) setSelected(evs[0].id);
      });
  }, [tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!selected) return;
    const { data } = await supabase.from('matches').select(ATHLETE_SELECT).eq('event_id', selected).order('match_number');
    setMatches((data ?? []) as Match[]);
  }, [selected]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('public-bracket-auto')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-bg-dark text-center">
        <p className="font-headline text-2xl uppercase tracking-widest text-text-muted">No active tournament</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 bg-bg-dark p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline text-2xl font-bold uppercase tracking-widest">{tournament.name} &middot; Bracket</h1>
        <select className="rounded-lg border border-white/10 bg-navy px-3 py-2" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>
      <BracketView matches={matches} />
    </main>
  );
}
