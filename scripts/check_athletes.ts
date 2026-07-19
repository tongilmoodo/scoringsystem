import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data, error } = await supabase.rpc('get_table_schema', { table_name: 'athletes' });
  if (error) {
    const { data: qData, error: qErr } = await supabase.from('athletes').select('*').limit(1);
    console.log(qData ? Object.keys(qData[0]) : qErr);
  } else {
    console.log(data);
  }
}
run();
