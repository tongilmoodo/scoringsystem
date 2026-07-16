'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

interface UpcomingMatch {
  id: string;
  match_number: number;
  status: string;
  event_id: string;
  court_number: number | null;
  blue_athlete: { name: string; country_code: string | null } | null;
  red_athlete: { name: string | null; country_code: string | null } | null;
  event: {
    id: string;
    name: string;
    category: string | null;
    gender: string | null;
    age_group: string | null;
    weight_class: string | null;
    description: string | null;
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
  return <span className="text-2xl leading-none">{flag}</span>;
}

function StatusBadge({ status, court }: { status: string; court: number | null }) {
  if (status === 'live') return (
    <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs font-black animate-pulse">
      LIVE {court ? `Court ${court === 1 ? 'A' : 'B'}` : ''}
    </span>
  );
  if (status === 'assigned') return (
    <span className="rounded-full bg-blue-700 px-2 py-0.5 text-xs font-bold">
      Court {court === 1 ? 'A' : court === 2 ? 'B' : (court ?? '?')}
    </span>
  );
  if (status === 'paused') return (
    <span className="rounded-full bg-yellow-700 px-2 py-0.5 text-xs font-bold">PAUSED</span>
  );
  if (status === 'break') return (
    <span className="rounded-full bg-yellow-500 px-2 py-0.5 text-xs font-bold text-black">BREAK</span>
  );
  return (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-gray-400">SCHEDULED</span>
  );
}

/**
 * Shared view used by both /upcoming and /t/[slug]/upcoming.
 * Pass tournamentId to pin it to a specific tournament; omit to auto-detect.
 */
export default function UpcomingMatchesView({
  tournamentId,
  scoreboardHref = '/scoreboard',
}: {
  tournamentId?: string;
  scoreboardHref?: string;
}) {
  const [eventGroups, setEventGroups] = useState<EventGroup[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);

    let tid = tournamentId;

    if (!tid) {
      // Try live first
      const { data: live } = await supabase
        .from('tournaments')
        .select('id, name')
        .eq('status', 'live')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (live) {
        tid = live.id;
        setTournamentName(live.name ?? '');
      } else {
        // Fallback: most recently updated tournament
        const { data: any } = await supabase
          .from('tournaments')
          .select('id, name')
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (any) { tid = any.id; setTournamentName(any.name ?? ''); }
      }
    }

    if (!tid) { setLoading(false); return; }

    // Get all event IDs for this tournament
    const { data: evRows } = await supabase
      .from('events')
      .select('id')
      .eq('tournament_id', tid);

    const evIds = (evRows ?? []).map((e: { id: string }) => e.id);
    if (!evIds.length) { setLoading(false); return; }

    // Fetch ALL non-completed matches — scheduled, assigned, live, paused, break, takedown
    const { data } = await supabase
      .from('matches')
      .select(`
        id, match_number, status, event_id, court_number,
        blue_athlete:blue_athlete_id(name, country_code),
        red_athlete:red_athlete_id(name, country_code),
        event:event_id(id, name, category, gender, age_group, weight_class, description)
      `)
      .in('event_id', evIds)
      .in('status', ['scheduled', 'assigned', 'live', 'paused', 'break', 'takedown'])
      .order('court_number', { ascending: true, nullsFirst: false })
      .order('match_number');

    if (data) {
      const grouped = groupBy(data as unknown as UpcomingMatch[], 'event_id');
      setEventGroups(Object.values(grouped));
    } else {
      setEventGroups([]);
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    load();
    const refresh = setInterval(load, 15000);
    return () => clearInterval(refresh);
  }, [load]);

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel('upcoming:matches:view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Auto-cycle between event groups every 30s
  useEffect(() => {
    if (eventGroups.length <= 1) return;
    const cycle = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % eventGroups.length);
    }, 30000);
    return () => clearInterval(cycle);
  }, [eventGroups.length]);

  useEffect(() => {
    if (currentIndex >= eventGroups.length && eventGroups.length > 0) setCurrentIndex(0);
  }, [eventGroups.length, currentIndex]);

  const currentGroup = eventGroups[currentIndex] ?? [];
  const getEventMeta = (grp: UpcomingMatch[]) => {
    const raw = grp[0]?.event;
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const eventMeta = getEventMeta(currentGroup);

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href={scoreboardHref} className="text-sm text-gray-400 hover:text-white transition">
          ← Live Scoreboard
        </Link>
        <div className="text-center">
          <h1 className="font-headline text-xl md:text-2xl font-bold uppercase tracking-[0.2em]">
            Upcoming Matches
          </h1>
          {tournamentName && (
            <p className="text-xs text-yellow-500/80 uppercase tracking-widest">{tournamentName}</p>
          )}
        </div>
        <span className="text-sm text-gray-500 tabular-nums">
          {eventGroups.length > 0 ? `${currentIndex + 1} / ${eventGroups.length}` : ''}
        </span>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 md:p-10 gap-6">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 text-xl animate-pulse">Loading matches…</p>
          </div>
        )}

        {!loading && eventGroups.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-5xl">🏆</p>
            <p className="text-2xl font-bold text-gray-400">No active matches</p>
            <p className="text-gray-600 text-center max-w-sm">
              All matches may be completed, or the tournament has not started yet.
            </p>
            <button
              onClick={() => load()}
              className="mt-2 rounded-lg border border-white/20 px-5 py-2 text-sm font-bold hover:bg-white/10 transition"
            >
              Refresh
            </button>
          </div>
        )}

        {!loading && eventGroups.length > 0 && (
          <>
            {eventMeta && (
              <div className="text-center space-y-1">
                <h2 className="text-3xl md:text-5xl font-black text-yellow-400 uppercase tracking-wide leading-tight">
                  {eventMeta.name}
                </h2>
                <p className="text-gray-400 text-base md:text-lg">
                  {[eventMeta.category, eventMeta.gender, eventMeta.age_group, eventMeta.weight_class]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {eventMeta.description && (
                  <p className="text-sm md:text-base text-yellow-200/70">{eventMeta.description}</p>
                )}
              </div>
            )}

            <div className="max-w-4xl mx-auto w-full space-y-3 flex-1">
              {currentGroup.map((match) => {
                const blue = Array.isArray(match.blue_athlete) ? match.blue_athlete[0] : match.blue_athlete;
                const red = Array.isArray(match.red_athlete) ? match.red_athlete[0] : match.red_athlete;
                const isActive = ['live', 'paused', 'break', 'takedown'].includes(match.status);
                return (
                  <div
                    key={match.id}
                    className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border px-4 md:px-6 py-4 transition ${
                      isActive
                        ? 'border-green-500/40 bg-green-900/20'
                        : match.status === 'assigned'
                          ? 'border-blue-500/30 bg-blue-900/10'
                          : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FlagEmoji code={blue?.country_code} />
                      <span className="text-lg md:text-2xl font-bold text-blue-400 truncate">
                        {blue?.name ?? 'TBD'}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-1 min-w-[90px]">
                      <StatusBadge status={match.status} court={match.court_number} />
                      <span className="text-xs text-gray-600 font-mono">#{match.match_number}</span>
                      <span className="text-lg font-black text-yellow-500">VS</span>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <span className="text-lg md:text-2xl font-bold text-red-400 truncate text-right">
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

      {/* Footer nav */}
      {eventGroups.length > 1 && (
        <footer className="flex flex-col items-center gap-3 py-5 border-t border-white/10">
          <div className="flex gap-2 flex-wrap justify-center">
            {eventGroups.map((grp, i) => {
              const m = getEventMeta(grp);
              return (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    i === currentIndex
                      ? 'bg-yellow-400 text-black'
                      : 'bg-white/10 text-gray-400 hover:bg-white/20'
                  }`}
                >
                  {m?.name ?? `Event ${i + 1}`}
                </button>
              );
            })}
          </div>
          <div className="flex gap-3">
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
