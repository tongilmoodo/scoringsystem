import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // Check RLS policies on the athletes table
  const { data, error } = await supabase
    .rpc('check_rls_policies' as any)
    .maybeSingle()
    .catch(() => ({ data: null, error: null }));

  // Query pg_policies directly
  const { data: policies } = await supabase
    .from('pg_policies' as any)
    .select('*')
    .eq('tablename', 'athletes')
    .catch(() => ({ data: null }));

  console.log('Policies:', JSON.stringify(policies, null, 2));

  // Try a raw SQL query to see policies
  const result = await supabase.rpc('exec_sql' as any, {
    sql: "SELECT policyname, cmd, permissive, roles, qual, with_check FROM pg_policies WHERE tablename = 'athletes';"
  }).catch(() => null);
  console.log('SQL result:', JSON.stringify(result, null, 2));
}

run();
