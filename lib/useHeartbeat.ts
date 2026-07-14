'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

// Judge/controller tablets ping their own users row every 30s so the admin
// dashboard can show accurate online/offline dots and last-active times.
export function useHeartbeat(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    let active = true;
    async function beat() {
      if (!active) return;
      await supabase.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', userId);
    }
    beat();
    const interval = setInterval(beat, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);
}
