import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data } = await supabase
    .from('matches')
    .select('id, status, timer_seconds, timer_started_at')
    .eq('court_number', 1)
    .order('updated_at', { ascending: false })
    .limit(3);
  console.log('Recent matches:', data);
}
run();
