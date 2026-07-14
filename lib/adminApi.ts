'use client';

import { supabase } from '@/lib/supabase/client';

// System-control helpers used by /setup/admin/system. All are scoped to the
// active tournament's courts.

export async function emergencyStop(tournamentId: string) {
  // Pause every live match on the tournament.
  await supabase
    .from('matches')
    .update({ status: 'paused', timer_started_at: null })
    .eq('tournament_id', tournamentId)
    .eq('status', 'live');
  await broadcast(tournamentId, 'TOURNAMENT PAUSED');
}

export async function resumeAll(tournamentId: string) {
  await clearBroadcasts(tournamentId);
}

export async function lockAllJudges(tournamentId: string, locked: boolean) {
  await supabase
    .from('matches')
    .update({ judges_locked: locked })
    .eq('tournament_id', tournamentId)
    .in('status', ['assigned', 'live', 'paused']);
}

export async function clearAllVotes(tournamentId: string) {
  const { data: ms } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', tournamentId)
    .in('status', ['assigned', 'live', 'paused']);
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
