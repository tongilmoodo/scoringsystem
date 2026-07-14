import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// Server-side user management with the service role key (creates Supabase auth
// users + public.users rows, resets PINs, toggles active). Guarded by the
// caller's admin PIN, re-validated here.
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function assertAdmin(pin: string | undefined): Promise<boolean> {
  if (!pin) return false;
  const { data } = await admin().from('users').select('pin_hash, role, is_active').eq('role', 'admin').eq('is_active', true);
  return (data ?? []).some((u) => bcrypt.compareSync(pin, u.pin_hash));
}

function genPin() {
  return String(Math.floor(1000000 + Math.random() * 9000000)); // 7 digits
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { adminPin, op } = body;
  if (!(await assertAdmin(adminPin))) {
    return NextResponse.json({ error: 'Admin authorisation failed' }, { status: 403 });
  }
  const sb = admin();

  if (op === 'create') {
    const { tournamentId, slug, name, role, court_access, pin } = body;
    const finalPin = pin || genPin();
    const email = `pin_${slug}_${finalPin}@system.local`;
    const { data: authUser, error: authErr } = await sb.auth.admin.createUser({
      email,
      password: String(finalPin).padEnd(6, '0'),
      email_confirm: true,
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    const { error: dbErr } = await sb.from('users').insert({
      id: authUser.user.id,
      tournament_id: tournamentId,
      name,
      pin_hash: bcrypt.hashSync(String(finalPin), 10),
      role,
      court_access: court_access ?? null,
      is_active: true,
    });
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, pin: finalPin });
  }

  if (op === 'reset_pin') {
    const { userId, slug, pin } = body;
    const finalPin = pin || genPin();
    const email = `pin_${slug}_${finalPin}@system.local`;
    const { error: authErr } = await sb.auth.admin.updateUserById(userId, {
      email,
      password: String(finalPin).padEnd(6, '0'),
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    // Force logout by rotating the session token; clear pin_hash to the new PIN.
    await sb.from('users').update({ pin_hash: bcrypt.hashSync(String(finalPin), 10), session_token: null }).eq('id', userId);
    return NextResponse.json({ ok: true, pin: finalPin });
  }

  if (op === 'set_active') {
    const { userId, is_active } = body;
    await sb.from('users').update({ is_active }).eq('id', userId);
    return NextResponse.json({ ok: true });
  }

  if (op === 'update') {
    const { userId, name, role, court_access } = body;
    await sb.from('users').update({ name, role, court_access: court_access ?? null }).eq('id', userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown op' }, { status: 400 });
}
