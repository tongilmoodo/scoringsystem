import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS when applying these DDL changes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function applyStatement(sql: string, label: string) {
  // Service role client can do direct DML/DDL via REST if we call the right endpoint
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
  
  // Use supabase management API indirectly: service role bypasses RLS on data operations
  // but we need pg_net or direct psql for DDL. Try via RPC if available.
  const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ sql }),
  });
  if (resp.status === 404) {
    return 'no_exec_sql';
  }
  const text = await resp.text();
  if (!resp.ok) {
    return `error: ${text}`;
  }
  return 'ok';
}

async function run() {
  // Since exec_sql may not exist, let's apply the policies directly as data operations
  // The service_role key bypasses ALL RLS, so we can write anything
  // But we need to apply DDL (CREATE POLICY) which must go through pg
  
  // Check if exec_sql RPC exists
  const probe = await applyStatement('SELECT 1', 'probe');
  console.log('exec_sql probe:', probe);
  
  if (probe === 'ok') {
    console.log('Applying policies via exec_sql...');
    const policies = [
      `DROP POLICY IF EXISTS admin_all_athletes ON athletes`,
      `DROP POLICY IF EXISTS anon_all_athletes ON athletes`,
      `CREATE POLICY anon_all_athletes ON athletes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
      `DROP POLICY IF EXISTS admin_all_events ON events`,
      `DROP POLICY IF EXISTS anon_all_events ON events`,
      `CREATE POLICY anon_all_events ON events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
      `DROP POLICY IF EXISTS admin_all_tournaments ON tournaments`,
      `DROP POLICY IF EXISTS anon_all_tournaments ON tournaments`,
      `CREATE POLICY anon_all_tournaments ON tournaments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
      `DROP POLICY IF EXISTS admin_all_matches ON matches`,
      `DROP POLICY IF EXISTS anon_all_matches ON matches`,
      `CREATE POLICY anon_all_matches ON matches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
      `DROP POLICY IF EXISTS admin_all_score_events ON score_events`,
      `DROP POLICY IF EXISTS controller_delete_score_events ON score_events`,
      `DROP POLICY IF EXISTS anon_all_score_events ON score_events`,
      `CREATE POLICY anon_all_score_events ON score_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
      `DROP POLICY IF EXISTS admin_all_judge_votes ON judge_votes`,
      `DROP POLICY IF EXISTS anon_all_judge_votes ON judge_votes`,
      `CREATE POLICY anon_all_judge_votes ON judge_votes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
      `DROP POLICY IF EXISTS anon_all_form_scores ON form_scores`,
      `CREATE POLICY anon_all_form_scores ON form_scores FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
      `DROP POLICY IF EXISTS anon_read_users ON users`,
      `DROP POLICY IF EXISTS anon_all_users ON users`,
      `CREATE POLICY anon_all_users ON users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`,
    ];
    
    for (const stmt of policies) {
      const result = await applyStatement(stmt, stmt.slice(0, 40));
      console.log(`${stmt.slice(0, 50)}: ${result}`);
    }
  } else {
    console.log('exec_sql not available. Need to apply migration manually.');
    console.log('Please run this SQL in the Supabase SQL editor:');
    console.log(`
DROP POLICY IF EXISTS admin_all_athletes ON athletes;
CREATE POLICY anon_all_athletes ON athletes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_events ON events;
CREATE POLICY anon_all_events ON events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_tournaments ON tournaments;
CREATE POLICY anon_all_tournaments ON tournaments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_matches ON matches;
CREATE POLICY anon_all_matches ON matches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_score_events ON score_events;
DROP POLICY IF EXISTS controller_delete_score_events ON score_events;
CREATE POLICY anon_all_score_events ON score_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_judge_votes ON judge_votes;
CREATE POLICY anon_all_judge_votes ON judge_votes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_all_form_scores ON form_scores;
CREATE POLICY anon_all_form_scores ON form_scores FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_read_users ON users;
DROP POLICY IF EXISTS anon_all_users ON users;
CREATE POLICY anon_all_users ON users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    `);
  }
}

run();
