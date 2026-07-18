import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ATHLETE_SELECT = '*, blue:athletes!matches_blue_athlete_id_fkey(*), red:athletes!matches_red_athlete_id_fkey(*), events:events(*)';

async function run() {
  const { data, error } = await supabase
    .from('matches')
    .select(ATHLETE_SELECT)
    .limit(1)
    .maybeSingle();
    
  console.log(JSON.stringify(data, null, 2));
}
run();
