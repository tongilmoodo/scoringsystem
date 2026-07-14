'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { BroadcastMessage } from '@/lib/types';

// Shown on judge/controller tablets. Displays the latest broadcast for the
// tournament as a slide-down banner. "TOURNAMENT PAUSED" gets a full red bar.
export default function BroadcastBanner({ tournamentId }: { tournamentId: string }) {
  const [message, setMessage] = useState<BroadcastMessage | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('broadcast_messages')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setMessage((data as BroadcastMessage | null) ?? null);
    }
    load();
    const ch = supabase
      .channel(`broadcast:${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcast_messages', filter: `tournament_id=eq.${tournamentId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tournamentId]);

  if (!message || dismissed === message.id) return null;
  const isPause = message.message.toUpperCase().includes('PAUSED');

  return (
    <div className={`animate-slide-down rounded-xl p-4 text-center ${isPause ? 'bg-danger' : 'bg-crimson'}`}>
      <span className="font-headline text-2xl font-bold uppercase tracking-widest">{message.message}</span>
      {!isPause && (
        <button onClick={() => setDismissed(message.id)} className="ml-4 rounded bg-black/30 px-3 py-1 text-sm font-bold">
          Dismiss
        </button>
      )}
    </div>
  );
}
