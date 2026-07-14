import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// PIN validation happens server-side with the service role key because the
// users table (containing PIN hashes) is not publicly readable.
export async function POST(req: Request) {
  const { pin } = await req.json().catch(() => ({ pin: null }));
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: 'Enter a 4-8 digit PIN' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: users, error } = await admin.from('users').select('*').eq('is_active', true);
  if (error) return NextResponse.json({ error: 'Auth unavailable' }, { status: 500 });

  const user = (users ?? []).find((u) => bcrypt.compareSync(pin, u.pin_hash));
  if (!user) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });

  return NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role, court_access: user.court_access },
    email: `pin_${pin}@system.local`,
  });
}
