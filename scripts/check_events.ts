import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ATHLETE_SELECT = '*, blue:athletes!matches_blue_athlete_id_fkey(*), red:athletes!matches_red_athlete_id_fkey(*), events:events(*)';

async function run() {
  const { data, error } = await supabase
    .from('matches')
    .select(ATHLETE_SELECT);

  const formMatchesWithRed = data?.filter(m => 
    m.events?.category?.includes('form') && m.red_athlete_id !== null
  );

  console.log('Form matches with Red athlete:', formMatchesWithRed?.length);
  if (formMatchesWithRed?.length) {
    console.log(JSON.stringify(formMatchesWithRed, null, 2));
    
    // Delete them
    const ids = formMatchesWithRed.map(m => m.id);
    await supabase.from('matches').delete().in('id', ids);
    console.log('Deleted bad matches.');
  }
}
run();
