import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // 1. Show all matches with court_number=1, all statuses
  const { data: matches } = await supabase
    .from('matches')
    .select('id, status, court_number, blue_athlete_id, blue_score, match_number, event_id')
    .eq('court_number', 1)
    .order('created_at');
  console.log('All Court 1 matches:');
  matches?.forEach(m => console.log(` - id:${m.id.slice(0,8)} status:${m.status} match#:${m.match_number} blue_score:${m.blue_score}`));

  // 2. Delete the stale "scheduled" match with no athlete interaction
  const staleMatch = matches?.find(m => m.status === 'scheduled');
  if (staleMatch) {
    console.log(`\nDeleting stale scheduled match: ${staleMatch.id}`);
    const { error } = await supabase.from('matches').delete().eq('id', staleMatch.id);
    if (error) console.error('Error deleting:', error.message);
    else console.log('Deleted successfully');
  }

  // 3. Now commit the average on the assigned match that has all 4 scores
  const assigned = matches?.find(m => m.status === 'assigned');
  if (assigned) {
    console.log(`\nCommitting average for assigned match: ${assigned.id}`);
    const { data, error } = await supabase.rpc('commit_form_average', {
      p_match_id: assigned.id,
      p_controller_name: 'admin_manual',
    });
    if (error) console.error('commit error:', error.message);
    else console.log('Commit result:', JSON.stringify(data, null, 2));
  }
}

run();
