'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

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

  useEffect(() => {
    if (!slug) return;
    supabase
      .from('tournaments')
      .select('id, slug, name, courts_count, status, date, location')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        setTournament((data as ActiveTournament | null) ?? null);
        setLoading(false);
      });
  }, [slug]);

  return { tournament, loading };
}
