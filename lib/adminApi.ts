'use client';

import { supabase } from '@/lib/supabase/client';

// System-control helpers used by /setup/admin/system. All are scoped to the
// active tournament's courts.

/** Get all event IDs for a tournament (needed because matches join via event_id). */
async function getEventIds(tournamentId: string): Promise<string[]> {
  const { data } = await supabase.from('events').select('id').eq('tournament_id', tournamentId);
  return (data ?? []).map((e: { id: string }) => e.id);
}

export async function emergencyStop(tournamentId: string) {
  const eventIds = await getEventIds(tournamentId);
  if (!eventIds.length) return;
  // Pause every live/running match in the tournament.
  await supabase
    .from('matches')
    .update({ status: 'paused', timer_started_at: null })
    .in('event_id', eventIds)
    .eq('status', 'live');
  await broadcast(tournamentId, 'TOURNAMENT PAUSED');
}

export async function resumeAll(tournamentId: string) {
  await clearBroadcasts(tournamentId);
}

export async function clearAllVotes(tournamentId: string) {
  const eventIds = await getEventIds(tournamentId);
  if (!eventIds.length) return;
  const { data: ms } = await supabase
    .from('matches')
    .select('id')
    .in('event_id', eventIds)
    .in('status', ['assigned', 'live', 'paused', 'break', 'takedown']);
  for (const m of ms ?? []) {
    await supabase.rpc('clear_votes', { p_match_id: m.id, p_player_side: 'blue' });
    await supabase.rpc('clear_votes', { p_match_id: m.id, p_player_side: 'red' });
  }
}

export async function broadcast(tournamentId: string, message: string) {
  await supabase.from('broadcast_messages').insert({ tournament_id: tournamentId, message });
}

export async function clearBroadcasts(tournamentId: string) {
  await supabase.from('broadcast_messages').delete().eq('tournament_id', tournamentId);
}
