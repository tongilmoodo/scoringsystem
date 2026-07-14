'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import BracketView from '@/components/BracketView';
import { useTournamentBySlug } from '@/lib/useTournament';
import { ATHLETE_SELECT, type Match } from '@/lib/types';

interface EventRow {
  id: string;
  name: string;
}

export default function PublicBracketPage() {
  const slug = String(useParams().slug);
  const { tournament, loading } = useTournamentBySlug(slug);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (!tournament) return;
    supabase
      .from('events')
      .select('id, name')
      .eq('tournament_id', tournament.id)
      .order('created_at')
      .then(({ data }) => {
        const evs = (data ?? []) as EventRow[];
        setEvents(evs);
        if (evs[0]) setSelected(evs[0].id);
      });
  }, [tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!selected) return;
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('event_id', selected)
      .order('match_number');
    setMatches((data ?? []) as Match[]);
  }, [selected]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`public-bracket-${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, slug]);

  if (loading) return null;
  if (!tournament) {
    return <main className="flex min-h-screen items-center justify-center text-gray-400">Tournament not found.</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">{tournament.name} &middot; Bracket</h1>
        <select
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-4 text-xs text-gray-400">
        <span><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-gray-700 bg-gray-900 align-middle" />Scheduled</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-green-500 bg-green-950 align-middle" />Live</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-blue-500 bg-blue-950 align-middle" />Completed</span>
      </div>
      <BracketView matches={matches} />
    </main>
  );
}
