'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getFlagUrl, countryName } from '@/lib/countries';
import { ATHLETE_SELECT, formatTime, type Match } from '@/lib/types';

const MEDALS = ['🥇', '🥈', '🥉'];

function TvFlag({ code, height }: { code: string | null | undefined; height: number }) {
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={getFlagUrl(code)} alt={countryName(code)} style={{ height }} className="rounded-[3px]" />
  );
}

interface LeaderboardRow {
  athlete_id: string | null;
  athlete_name: string;
  country_code: string | null;
  team: string | null;
  score: number; // scaled x10 (e.g., 97 = 9.7)
  completed: boolean;
}

export default function FormScoreboard({
  court,
  tournamentId,
  big = false,
}: {
  court: number;
  tournamentId: string;
  big?: boolean;
}) {
  const [match, setMatch] = useState<Match | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [remaining, setRemaining] = useState(0);

  const courtLabel = `COURT ${court === 1 ? 'A' : 'B'}`;

  const loadLeaderboard = useCallback(async (eventId: string) => {
    // Get all matches in this event
    const { data: allMatches } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('event_id', eventId);

    if (!allMatches?.length) return;

    const rows: LeaderboardRow[] = allMatches.map((m: any) => ({
      athlete_id: m.blue_athlete_id,
      athlete_name: m.blue?.name ?? 'TBD',
      country_code: m.blue?.country_code ?? null,
      team: m.blue?.team ?? null,
      score: m.blue_score ?? 0,
      completed: m.status === 'completed',
    }));

    // Sort: completed first (by score desc), then pending
    rows.sort((a, b) => {
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;
      return b.score - a.score;
    });

    setLeaderboard(rows);
  }, []);

  const load = useCallback(async () => {
    const { data: evRows } = await supabase
      .from('events')
      .select('id')
      .eq('tournament_id', tournamentId);
    const evIds = (evRows ?? []).map((e: { id: string }) => e.id);
    if (!evIds.length) { setMatch(null); return; }

    // 1. Try to find an active match
    let { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .in('event_id', evIds)
      .eq('court_number', court)
      .in('status', ['assigned', 'live', 'paused'])
      .order('match_number')
      .limit(1)
      .maybeSingle();

    // 2. Fallback to last completed match on this court
    if (!data) {
      const { data: completedData } = await supabase
        .from('matches')
        .select(ATHLETE_SELECT)
        .in('event_id', evIds)
        .eq('court_number', court)
        .eq('status', 'completed')
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = completedData;
    }

    const m = (data as Match | null) ?? null;
    setMatch(m);
    if (m?.event_id) loadLeaderboard(m.event_id);
  }, [court, tournamentId, loadLeaderboard]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`form-sb:${tournamentId}:${court}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'form_scores' }, () => {
        if (match?.event_id) loadLeaderboard(match.event_id);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [court, tournamentId, load, match?.event_id, loadLeaderboard]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!match) return;
      if (match.status === 'live' && match.timer_started_at) {
        const elapsed = Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000);
        setRemaining(Math.max(0, match.timer_seconds - elapsed));
      } else {
        setRemaining(match.timer_seconds);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [match]);

  if (!match) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-bg-dark p-6">
        <span className="font-headline text-2xl uppercase tracking-widest text-text-muted">{courtLabel}</span>
        <p className="mt-4 text-text-muted">No active match</p>
      </div>
    );
  }

  const athlete = match.blue;
  const currentScore = match.blue_score;
  const timerColor = remaining <= 10 ? 'text-danger animate-pulse' : remaining <= 30 ? 'text-danger' : 'text-white';
  const scoreSize = big ? 'text-[16vw] xl:text-[200px]' : 'text-9xl';
  const nameSize = big ? 'text-[3.5vw] xl:text-5xl' : 'text-3xl';

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-bg-dark p-4 md:p-8 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-headline text-lg uppercase tracking-widest text-text-muted md:text-2xl">{courtLabel}</span>
        <span className="font-headline text-base uppercase tracking-[0.2em] text-gold md:text-2xl">
          {match.events?.name ?? 'Form / Special Techniques'}
        </span>
        <span className={`font-mono font-bold tabular-nums ${timerColor} ${big ? 'text-[5vw] xl:text-7xl' : 'text-4xl'}`}>
          {formatTime(remaining)}
        </span>
      </div>

      {/* Currently performing athlete */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl bg-blue-900/40 p-6">
        <TvFlag code={athlete?.country_code} height={big ? 80 : 50} />
        <p className={`${nameSize} text-center font-headline font-bold uppercase tracking-[0.05em] text-[#4a90d9]`}>
          {athlete?.name ?? 'TBD'}
        </p>
        <p className="text-text-muted uppercase tracking-widest text-lg">{athlete?.team ?? ''}</p>

        <p className="text-text-muted uppercase tracking-widest text-sm mt-2">Current Score</p>
        <span className={`${scoreSize} font-headline font-black tabular-nums score-shadow text-white`}>
          {match.status === 'completed' ? (currentScore / 10).toFixed(1) : '—'}
        </span>
        {match.status !== 'completed' && (
          <span className="text-text-muted text-xl">Performing…</span>
        )}
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="rounded-xl bg-black/30 p-4">
          <p className="text-center text-xs uppercase tracking-widest text-text-muted mb-3">Leaderboard</p>
          <div className="flex flex-col gap-2">
            {leaderboard.slice(0, 6).map((row, i) => {
              const isActive = row.athlete_id === match.blue_athlete_id && match.status !== 'completed';
              return (
                <div key={row.athlete_id ?? i}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-blue-700/50 ring-1 ring-blue-400' : 'bg-white/5'}`}>
                  <span className="w-8 text-center font-bold text-gold text-lg">
                    {row.completed ? (MEDALS[i] ?? `#${i + 1}`) : '—'}
                  </span>
                  <TvFlag code={row.country_code} height={20} />
                  <span className="flex-1 font-headline font-bold uppercase truncate">{row.athlete_name}</span>
                  <span className="font-mono font-bold tabular-nums text-lg">
                    {row.completed ? (row.score / 10).toFixed(1) : (isActive ? '…' : '--')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
