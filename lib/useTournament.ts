'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatSupabaseError } from '@/lib/loadState';

export interface ActiveTournament {
  id: string;
  slug: string;
  name: string;
  courts_count: number;
  status?: string;
  date?: string;
  location?: string;
}

const KEY = 'active_tournament';

/** Admin-side: the tournament currently being managed (persisted locally). */
export function useActiveTournament() {
  const [tournament, setState] = useState<ActiveTournament | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  function setTournament(t: ActiveTournament | null) {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
    setState(t);
  }

  return { tournament, ready, setTournament };
}

/** Public/tablet-side: resolve a tournament from its URL slug. */
export function useTournamentBySlug(slug: string) {
  const [tournament, setTournament] = useState<ActiveTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Always resolve loading — on success, error, or exception — otherwise a
    // rejected query (network/RLS) leaves the TV scoreboard stuck on "Loading…".
    (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('tournaments')
          .select('id, slug, name, courts_count, status, date, location')
          .eq('slug', slug)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) {
          // eslint-disable-next-line no-console
          console.error('[useTournamentBySlug] query failed', qErr);
          setError(formatSupabaseError(qErr));
          setTournament(null);
        } else {
          setTournament((data as ActiveTournament | null) ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[useTournamentBySlug] exception', e);
          setError(formatSupabaseError(e));
          setTournament(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  return { tournament, loading, error, retry, attempt };
}
