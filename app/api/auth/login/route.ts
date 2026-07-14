import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// PIN validation happens server-side with the service role key. PINs are
// scoped per tournament: the tablet/admin login sends the tournament slug,
// and only that tournament's users (plus platform-wide admins) are checked.
export async function POST(req: Request) {
  const { pin, slug } = await req.json().catch(() => ({ pin: null, slug: null }));
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: 'Enter a 4-8 digit PIN' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let tournamentId: string | null = null;
  if (typeof slug === 'string' && slug) {
    const { data: t } = await admin.from('tournaments').select('id').eq('slug', slug).maybeSingle();
    if (!t) return NextResponse.json({ error: 'Unknown tournament' }, { status: 404 });
    tournamentId = t.id;
  }

  let query = admin.from('users').select('*').eq('is_active', true);
  if (tournamentId) query = query.or(`tournament_id.eq.${tournamentId},tournament_id.is.null`);
  const { data: users, error } = await query;
  if (error) return NextResponse.json({ error: 'Auth unavailable' }, { status: 500 });

  const user = (users ?? []).find((u) => bcrypt.compareSync(pin, u.pin_hash));
  if (!user) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });

  // Derived email is tournament-scoped so identical PINs never clash in auth.
  let userSlug = 'global';
  if (user.tournament_id) {
    const { data: ut } = await admin.from('tournaments').select('slug').eq('id', user.tournament_id).maybeSingle();
    userSlug = ut?.slug ?? 'global';
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      court_access: user.court_access,
      tournament_id: user.tournament_id,
    },
    email: `pin_${userSlug}_${pin}@system.local`,
  });
}
