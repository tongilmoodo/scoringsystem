import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // Delete ALL matches that have null blue_athlete_id (bad/corrupt matches)
  const { data: bad, error: fetchErr } = await supabase
    .from('matches')
    .select('id, match_number, blue_athlete_id, red_athlete_id, status')
    .is('blue_athlete_id', null);

  if (fetchErr) { console.error('Fetch error:', fetchErr); return; }
  console.log(`Found ${bad?.length ?? 0} matches with null blue_athlete_id:`, bad);

  if (bad && bad.length > 0) {
    const ids = bad.map(m => m.id);
    const { error: delErr } = await supabase.from('matches').delete().in('id', ids);
    if (delErr) {
      console.error('Delete error:', delErr);
    } else {
      console.log(`Deleted ${ids.length} bad matches.`);
    }
  }
}
run();
