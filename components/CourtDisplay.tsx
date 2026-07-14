'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { getFlagUrl, countryName } from '@/lib/countries';
import { ATHLETE_SELECT, formatTime, ROUND_LABELS, type Match, type Side } from '@/lib/types';

const LABELS = ['Court', 'Match', 'No active match', 'Fouls', 'Round Break', 'Round', 'Waiting for match assignment'];

// Big crisp SVG flag for TV displays.
function TvFlag({ code, height }: { code: string | null | undefined; height: number }) {
  if (!code) return null;
  const name = countryName(code);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={getFlagUrl(code)} alt={name} title={name} style={{ height }} className="rounded-[3px]" />
  );
}

export default function CourtDisplay({
  court,
  tournamentId,
  eventName,
  big = false,
}: {
  court: number;
  tournamentId: string;
  eventName?: string;
  big?: boolean;
}) {
  const { t } = useTranslation(LABELS);
  const [match, setMatch] = useState<Match | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [popSide, setPopSide] = useState<Record<Side, number>>({ blue: 0, red: 0 });
  const prevScores = useRef<{ blue: number; red: number } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('tournament_id', tournamentId)
      .eq('court_number', court)
      .in('status', ['assigned', 'live', 'paused', 'completed'])
      .order('match_number')
      .limit(1)
      .maybeSingle();
    setMatch((data as Match | null) ?? null);
  }, [court, tournamentId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`sb:t:${tournamentId}:court:${court}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [court, tournamentId, load]);

  // Trigger the score-pop animation when a side's score increases.
  useEffect(() => {
    if (!match) return;
    const prev = prevScores.current;
    if (prev) {
      if (match.blue_score > prev.blue) setPopSide((s) => ({ ...s, blue: s.blue + 1 }));
      if (match.red_score > prev.red) setPopSide((s) => ({ ...s, red: s.red + 1 }));
    }
    prevScores.current = { blue: match.blue_score, red: match.red_score };
  }, [match?.blue_score, match?.red_score]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!match) return;
      if (match.status === 'live' && match.timer_started_at) {
        const elapsed = Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000);
        setRemaining(Math.max(0, match.timer_seconds - elapsed));
      } else setRemaining(match.timer_seconds);
    }, 250);
    return () => clearInterval(timer);
  }, [match]);

  const courtLabel = `${t('Court').toUpperCase()} ${court === 1 ? 'A' : 'B'}`;

  if (!match) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-bg-dark p-6">
        <span className="font-headline text-2xl uppercase tracking-widest text-text-muted">{courtLabel}</span>
        <p className="mt-4 text-text-muted">{t('No active match')}</p>
      </div>
    );
  }

  const breakActive = !!match.break_ends_at && new Date(match.break_ends_at).getTime() > now;
  const breakRemaining = breakActive ? Math.max(0, Math.ceil((new Date(match.break_ends_at!).getTime() - now) / 1000)) : 0;
  const takedownActive = !!match.takedown_ends_at && new Date(match.takedown_ends_at).getTime() > now;
  const completed = match.status === 'completed';
  const winnerSide: Side | null = completed
    ? match.winner_id === match.blue_athlete_id
      ? 'blue'
      : match.winner_id === match.red_athlete_id
        ? 'red'
        : null
    : null;

  const timerColor = remaining <= 10 ? 'text-danger animate-pulse' : remaining <= 30 ? 'text-danger' : 'text-white';
  const scoreSize = big ? 'text-[16vw] xl:text-[220px]' : 'text-7xl';
  const nameSize = big ? 'text-[3vw] xl:text-5xl' : 'text-2xl';

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-bg-dark p-4 md:p-8">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <span className="font-headline text-lg uppercase tracking-widest text-text-muted md:text-2xl">{courtLabel}</span>
        <span className="font-headline text-base uppercase tracking-[0.2em] text-gold md:text-3xl">
          {t('Round')} {match.current_round}
        </span>
        <span className="max-w-[40%] truncate text-right font-headline text-sm uppercase tracking-widest text-text-muted md:text-2xl">
          {eventName ?? ''}
        </span>
      </div>

      {/* Athletes + VS */}
      <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-6">
        {(['blue', 'red'] as const).map((side, idx) => {
          const athlete = side === 'blue' ? match.blue : match.red;
          const score = side === 'blue' ? match.blue_score : match.red_score;
          const fouls = side === 'blue' ? match.blue_fouls : match.red_fouls;
          const dimmed = breakActive ? 'opacity-50' : '';
          const winGlow = winnerSide === side ? 'bg-gold/20 rounded-2xl' : '';
          const tdGlow = takedownActive ? 'ring-4 ring-danger animate-pulse rounded-2xl' : '';
          const panel = (
            <div key={side} className={`flex flex-col items-center justify-center gap-3 p-2 transition ${dimmed} ${winGlow} ${tdGlow}`}>
              <TvFlag code={athlete?.country_code} height={big ? 80 : 40} />
              <p className={`${nameSize} text-center font-headline font-bold uppercase tracking-[0.05em] ${side === 'blue' ? 'text-[#4a90d9]' : 'text-crimson'}`}>
                {athlete?.name ?? 'TBD'}
              </p>
              <div className="relative">
                <span key={popSide[side]} className={`block font-headline font-bold tabular-nums score-shadow animate-score-pop ${scoreSize} ${winnerSide === side ? 'text-gold' : 'text-white'}`}>
                  {score}
                </span>
                {popSide[side] > 0 && (
                  <div className="burst" key={`b${popSide[side]}`}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <span key={i} style={{ ['--dx' as string]: `${Math.cos((i / 8) * 6.28) * 80}px`, ['--dy' as string]: `${Math.sin((i / 8) * 6.28) * 80}px` }} />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-sm uppercase tracking-widest text-text-muted">{t('Fouls')}: {fouls}</p>
            </div>
          );
          // Insert the gold VS divider between the two panels.
          if (idx === 0) {
            return [
              panel,
              <div key="vs" className="flex h-full flex-col items-center justify-center">
                <div className="flex-1 w-1 bg-gold" />
                <span className="my-2 font-headline text-2xl font-bold text-gold md:text-5xl">VS</span>
                <div className="flex-1 w-1 bg-gold" />
              </div>,
            ];
          }
          return panel;
        })}
      </div>

      {/* Timer / state line */}
      <div className="mt-4 text-center">
        <span className={`font-mono font-bold tabular-nums ${timerColor} ${big ? 'text-[8vw] xl:text-[120px]' : 'text-5xl'}`}>
          {formatTime(remaining)}
        </span>
      </div>

      {/* Break banner */}
      {breakActive && (
        <div className="absolute inset-0 z-20 flex animate-slide-down flex-col items-center justify-center bg-gold text-navy">
          <span className="font-headline text-4xl font-bold uppercase tracking-widest md:text-8xl">{t('Round Break')}</span>
          <span className="font-mono text-5xl font-bold tabular-nums md:text-9xl">{formatTime(breakRemaining)}</span>
        </div>
      )}

      {/* Takedown banner */}
      {!breakActive && takedownActive && (
        <div className="absolute left-0 right-0 top-0 z-20 animate-slide-down bg-danger py-2 text-center">
          <span className="font-headline text-2xl font-bold uppercase tracking-widest md:text-4xl">Takedown</span>
        </div>
      )}

      {/* Winner flash */}
      {completed && winnerSide && (
        <div className="pointer-events-none absolute inset-0 z-10 animate-flash-gold rounded-2xl" />
      )}
    </div>
  );
}
