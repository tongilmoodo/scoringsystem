'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface PresentMember {
  user_id: string;
  name?: string;
  role?: 'judge' | 'controller';
  online_at?: string;
}

export function courtPresenceChannel(courtNumber: number) {
  return `presence:court:${courtNumber}`;
}

/**
 * Track the current device's presence in a court-scoped channel.
 *
 * Presence is a live connection signal: it is established when the channel is
 * SUBSCRIBED and cleared automatically by Supabase when the tab closes or the
 * connection drops. No manual timeout logic is required.
 */
export function useTrackPresence(
  courtNumber: number | null | undefined,
  member: PresentMember | null,
) {
  useEffect(() => {
    if (!courtNumber || !member?.user_id) return;

    const channel = supabase.channel(courtPresenceChannel(courtNumber), {
      config: { presence: { key: member.user_id } },
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: member.user_id,
          name: member.name,
          role: member.role,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      // untrack + removeChannel guarantees the presence entry is released
      // immediately on unmount / navigation.
      channel.untrack().finally(() => supabase.removeChannel(channel));
    };
  }, [courtNumber, member?.user_id, member?.name, member?.role]);
}

/**
 * Subscribe (read-only) to one or more court presence channels and return the
 * set of user_ids currently present on each court.
 */
export function useCourtPresence(courts: number[]) {
  const [presence, setPresence] = useState<Record<number, Set<string>>>({});
  const key = courts.join(',');

  useEffect(() => {
    if (courts.length === 0) return;

    const channels = courts.map((court) => {
      const channel = supabase.channel(courtPresenceChannel(court), {
        config: { presence: { key: `dashboard:${court}` } },
      });

      const sync = () => {
        const state = channel.presenceState();
        const ids = new Set(Object.keys(state));
        setPresence((prev) => ({ ...prev, [court]: ids }));
      };

      channel
        .on('presence', { event: 'sync' }, sync)
        .on('presence', { event: 'join' }, sync)
        .on('presence', { event: 'leave' }, sync)
        .subscribe();

      return channel;
    });

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return presence;
}
