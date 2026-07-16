'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

interface UpcomingMatch {
  id: string;
  match_number: number;
  status: string;
  event_id: string;
  blue_athlete: { name: string; country_code: string | null } | null;
  red_athlete: { name: string | null; country_code: string | null } | null;
  event: {
    id: string;
    name: string;
    category: string | null;
    gender: string | null;
    age_group: string | null;
    weight_class: string | null;
  } | null;
}

type EventGroup = UpcomingMatch[];

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc: Record<string, T[]>, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function FlagEmoji({ code }: { code: string | null | undefined }) {
  if (!code || code.length !== 2) return null;
  const flag = code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join('');
  return <span className="text-2xl">{flag}</span>;
}

export default function UpcomingPage() {
  const [eventGroups, setEventGroups] = useState<EventGroup[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // First find active tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id')
      .eq('status', 'live')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tournament) { setLoading(false); return; }

    // Get event IDs for this tournament
    const { data: evRows } = await supabase
      .from('events')
      .select('id')
      .eq('tournament_id', tournament.id);

    const evIds = (evRows ?? []).map((e: { id: string }) => e.id);
    if (!evIds.length) { setLoading(false); return; }

    const { data } = await supabase
      .from('matches')
      .select(`
        id, match_number, status, event_id,
        blue_athlete:blue_athlete_id(name, country_code),
        red_athlete:red_athlete_id(name, country_code),
        event:event_id(id, name, category, gender, age_group, weight_class)
      `)
      .in('event_id', evIds)
      .eq('status', 'scheduled')
      .order('event_id')
      .order('match_number');

    if (data) {
      const grouped = groupBy(data as unknown as UpcomingMatch[], 'event_id');
      setEventGroups(Object.values(grouped));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Re-fetch every 30s to pick up newly scheduled matches
    const refresh = setInterval(load, 30000);
    return () => clearInterval(refresh);
  }, [load]);

  // Auto-cycle between event groups every 30s
  useEffect(() => {
    if (eventGroups.length <= 1) return;
    const cycle = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % eventGroups.length);
    }, 30000);
    return () => clearInterval(cycle);
  }, [eventGroups.length]);

  const currentGroup = eventGroups[currentIndex] ?? [];
  const eventMeta = currentGroup[0]?.event ?? null;

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/scoreboard" className="text-sm text-gray-400 hover:text-white transition">
          ← Live Scoreboard
        </Link>
        <h1 className="font-headline text-2xl font-bold uppercase tracking-[0.2em]">
          Upcoming Matches
        </h1>
        <span className="text-sm text-gray-500">
          {eventGroups.length > 0 ? `${currentIndex + 1} / ${eventGroups.length} events` : ''}
        </span>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col p-6 md:p-12 gap-6">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 text-xl animate-pulse">Loading scheduled matches…</p>
          </div>
        )}

        {!loading && eventGroups.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-4xl">🏆</p>
            <p className="text-2xl font-bold text-gray-400">No upcoming matches</p>
            <p className="text-gray-600">All scheduled matches have been assigned to courts.</p>
          </div>
        )}

        {!loading && eventGroups.length > 0 && (
          <>
            {/* Event header */}
            {eventMeta && (
              <div className="text-center space-y-1">
                <h2 className="text-4xl md:text-5xl font-black text-yellow-400 uppercase tracking-wide">
                  {eventMeta.name}
                </h2>
                <p className="text-gray-400 text-lg">
                  {[eventMeta.category, eventMeta.gender, eventMeta.age_group, eventMeta.weight_class]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            )}

            {/* Match list */}
            <div className="max-w-4xl mx-auto w-full space-y-3 flex-1">
              {currentGroup.map((match, i) => {
                const blue = Array.isArray(match.blue_athlete) ? match.blue_athlete[0] : match.blue_athlete;
                const red = Array.isArray(match.red_athlete) ? match.red_athlete[0] : match.red_athlete;
                return (
                  <div
                    key={match.id}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-6 py-4"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {/* Blue side */}
                    <div className="flex items-center gap-3">
                      <FlagEmoji code={blue?.country_code} />
                      <span className="text-xl md:text-2xl font-bold text-blue-400 truncate">
                        {blue?.name ?? 'TBD'}
                      </span>
                    </div>

                    {/* VS */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-500 font-mono">#{match.match_number}</span>
                      <span className="text-xl font-black text-yellow-500">VS</span>
                    </div>

                    {/* Red side */}
                    <div className="flex items-center justify-end gap-3">
                      <span className="text-xl md:text-2xl font-bold text-red-400 truncate text-right">
                        {red?.name ?? 'TBD'}
                      </span>
                      <FlagEmoji code={red?.country_code} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer: event navigation dots + prev/next */}
      {eventGroups.length > 1 && (
        <footer className="flex flex-col items-center gap-4 py-6 border-t border-white/10">
          {/* Dots */}
          <div className="flex gap-2">
            {eventGroups.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-3 w-3 rounded-full transition-all ${
                  i === currentIndex ? 'bg-yellow-400 w-6' : 'bg-gray-600 hover:bg-gray-400'
                }`}
                aria-label={`Go to event ${i + 1}`}
              />
            ))}
          </div>

          {/* Prev / Next */}
          <div className="flex gap-4">
            <button
              onClick={() => setCurrentIndex((i) => (i - 1 + eventGroups.length) % eventGroups.length)}
              className="rounded-lg border border-white/20 px-5 py-2 font-bold hover:bg-white/10 transition"
            >
              ← Prev
            </button>
            <button
              onClick={() => setCurrentIndex((i) => (i + 1) % eventGroups.length)}
              className="rounded-lg border border-white/20 px-5 py-2 font-bold hover:bg-white/10 transition"
            >
              Next →
            </button>
          </div>
        </footer>
      )}
    </main>
  );
}
