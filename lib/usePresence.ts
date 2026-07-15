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
 * Subscribe (read-only) to one or more court presence channels.
 *
 * Returns both:
 *  - `presence[court]`  — a Set of user_ids present on each court (kept for
 *    backwards compatibility with the judge-dot lookup), and
 *  - `members[court]`   — the full list of present members (name + role),
 *    so the UI can show WHO is connected regardless of any users-table join.
 */
export function useCourtPresence(courts: number[]) {
  const [presence, setPresence] = useState<Record<number, Set<string>>>({});
  const [members, setMembers] = useState<Record<number, PresentMember[]>>({});
  const key = courts.join(',');

  useEffect(() => {
    if (courts.length === 0) return;

    const channels = courts.map((court) => {
      const channel = supabase.channel(courtPresenceChannel(court), {
        config: { presence: { key: `dashboard:${court}` } },
      });

      const sync = () => {
        const state = channel.presenceState() as Record<string, PresentMember[]>;
        const ids = new Set<string>();
        const list: PresentMember[] = [];
        // presenceState() is keyed by the track key; each value is the array of
        // metas tracked under that key. Flatten to a de-duplicated member list.
        Object.entries(state).forEach(([presenceKey, metas]) => {
          const meta = (metas?.[0] ?? {}) as PresentMember;
          const userId = meta.user_id ?? presenceKey;
          if (!ids.has(userId)) {
            ids.add(userId);
            list.push({ ...meta, user_id: userId });
          }
        });
        setPresence((prev) => ({ ...prev, [court]: ids }));
        setMembers((prev) => ({ ...prev, [court]: list }));
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

  return { presence, members };
}
