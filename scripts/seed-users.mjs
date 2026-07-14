// Creates Supabase auth users + rows in public.users for the demo PINs,
// SCOPED TO A TOURNAMENT. PINs are per-tournament: the derived auth email
// includes the tournament slug so the same PIN can exist in many tournaments.
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TOURNAMENT_SLUG=mombasa-open-2026 node scripts/seed-users.mjs
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const slug = process.env.TOURNAMENT_SLUG ?? 'mombasa-open-2026';
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const admin = createClient(url, key);

const { data: tournament, error: tErr } = await admin
  .from('tournaments')
  .select('id, name')
  .eq('slug', slug)
  .maybeSingle();
if (tErr || !tournament) {
  console.error(`Tournament with slug "${slug}" not found. Create it first (or run schema.sql).`);
  process.exit(1);
}
console.log(`Seeding users for tournament: ${tournament.name} (${slug})`);

const USERS = [
  { name: 'Tournament Director', pin: '800811', role: 'admin', court_access: null },
  { name: 'Controller Court A', pin: '8118111', role: 'controller', court_access: 1 },
  { name: 'Judge A1', pin: '8118112', role: 'judge', court_access: 1 },
  { name: 'Judge A2', pin: '8118113', role: 'judge', court_access: 1 },
  { name: 'Judge A3', pin: '8118114', role: 'judge', court_access: 1 },
  { name: 'Judge A4', pin: '8118115', role: 'judge', court_access: 1 },
  { name: 'Controller Court B', pin: '822822', role: 'controller', court_access: 2 },
  { name: 'Judge B1', pin: '8228221', role: 'judge', court_access: 2 },
  { name: 'Judge B2', pin: '8228222', role: 'judge', court_access: 2 },
  { name: 'Judge B3', pin: '8228223', role: 'judge', court_access: 2 },
  { name: 'Judge B4', pin: '8228224', role: 'judge', court_access: 2 },
];

for (const u of USERS) {
  // Tournament-scoped derived email keeps PINs reusable across tournaments.
  const email = `pin_${slug}_${u.pin}@system.local`;
  const password = u.pin.padEnd(6, '0');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    console.error(`auth user ${email}: ${error.message}`);
    continue;
  }
  const { error: dbError } = await admin.from('users').insert({
    id: data.user.id,
    tournament_id: tournament.id,
    name: u.name,
    pin_hash: bcrypt.hashSync(u.pin, 10),
    role: u.role,
    court_access: u.court_access,
    is_active: true,
  });
  if (dbError) console.error(`users row ${u.name}: ${dbError.message}`);
  else console.log(`Created ${u.role} "${u.name}" (PIN ${u.pin})`);
}
console.log('Done.');
