'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { ATHLETE_SELECT, formatTime, ROUND_LABELS, type Match } from '@/lib/types';

const LABELS = ['Court', 'Match', 'No active match', 'Fouls'];

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function CourtDisplay({ court, big = false }: { court: number; big?: boolean }) {
  const { t } = useTranslation(LABELS);
  const [match, setMatch] = useState<Match | null>(null);
  const [remaining, setRemaining] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(ATHLETE_SELECT)
      .eq('court_number', court)
      .in('status', ['assigned', 'live', 'paused'])
      .order('match_number')
      .limit(1)
      .maybeSingle();
    setMatch((data as Match | null) ?? null);
  }, [court]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`matches:court:${court}:display`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `court_number=eq.${court}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [court, load]);

  // Derive the countdown from timer_started_at so every viewer stays in sync.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!match) return;
      if (match.status === 'live' && match.timer_started_at) {
        const elapsed = Math.floor((Date.now() - new Date(match.timer_started_at).getTime()) / 1000);
        setRemaining(Math.max(0, match.timer_seconds - elapsed));
      } else {
        setRemaining(match.timer_seconds);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [match]);

  const scoreSize = big ? 'text-[150px] leading-none md:text-[220px]' : 'text-7xl';
  const nameSize = big ? 'text-4xl md:text-5xl' : 'text-2xl';

  if (!match) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-xl font-bold text-gray-400">{t('Court')} {court === 1 ? 'A' : 'B'}</h2>
        <p className="mt-4 text-gray-500">{t('No active match')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-4 flex items-center justify-between text-gray-300">
        <span className="font-bold">{t('Court')} {court === 1 ? 'A' : 'B'}</span>
        <span>
          {ROUND_LABELS[match.round]} &middot; {t('Match')} {match.match_number}
        </span>
        <span
          className={`rounded px-2 py-0.5 text-sm font-bold ${
            match.status === 'live' ? 'bg-green-700' : 'bg-gray-700'
          }`}
        >
          {match.status.toUpperCase()}
        </span>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-4">
        {(['blue', 'red'] as const).map((side) => {
          const athlete = side === 'blue' ? match.blue : match.red;
          const score = side === 'blue' ? match.blue_score : match.red_score;
          const fouls = side === 'blue' ? match.blue_fouls : match.red_fouls;
          return (
            <div
              key={side}
              className={`flex flex-col items-center justify-center rounded-lg p-4 ${
                side === 'blue' ? 'bg-blue-600' : 'bg-red-600'
              }`}
            >
              {big && (
                <div className="mb-3 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white/20 text-4xl font-bold">
                  {athlete?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={athlete.photo_url} alt={athlete.name} className="h-full w-full object-cover" />
                  ) : (
                    athlete ? initials(athlete.name) : '?'
                  )}
                </div>
              )}
              <p className={`${nameSize} text-center font-bold`}>{athlete?.name ?? 'TBD'}</p>
              <p className="text-white/80">
                {athlete?.country_code ?? ''} {athlete?.team ? `- ${athlete.team}` : ''}
              </p>
              <p className={`${scoreSize} font-black tabular-nums`}>{score}</p>
              <p className="text-sm text-white/80">{t('Fouls')}: {fouls}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-center">
        <span className={`font-mono font-black tabular-nums ${big ? 'text-8xl' : 'text-5xl'}`}>
          {formatTime(remaining)}
        </span>
      </div>
    </div>
  );
}
