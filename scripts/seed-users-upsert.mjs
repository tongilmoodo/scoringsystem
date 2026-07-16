import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const slug = process.env.TOURNAMENT_SLUG ?? 'mombasa-open-2026';
if (!url || !key) {
  process.exit(1);
}
const admin = createClient(url, key);

const { data: tournament } = await admin.from('tournaments').select('id, name').eq('slug', slug).maybeSingle();
if (!tournament) process.exit(1);

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
  const email = `pin_${slug}_${u.pin}@system.local`;
  
  // Find user by email from auth admin
  const { data: usersData, error: listError } = await admin.auth.admin.listUsers();
  let userId = null;
  const existing = usersData?.users?.find(x => x.email === email);
  if (existing) {
     userId = existing.id;
  } else {
     const password = u.pin.padEnd(6, '0');
     const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
     if (!error) userId = data.user.id;
  }

  if (userId) {
      await admin.from('users').upsert({
        id: userId,
        tournament_id: tournament.id,
        name: u.name,
        pin_hash: bcrypt.hashSync(u.pin, 10),
        role: u.role,
        court_access: u.court_access,
        is_active: true,
      });
      console.log(`Upserted ${u.name}`);
  }
}
