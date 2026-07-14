'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import type { Tournament } from '@/lib/types';

export default function Home() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('*')
      .order('date', { ascending: false })
      .then(({ data }) => setTournaments((data ?? []) as Tournament[]));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-black">Tong-Il Moo-Do Scoring System</h1>
      <p className="mb-2 text-gray-400">Multi-tournament platform &middot; 4-judge consensus scoring</p>

      {tournaments.length === 0 && <p className="text-gray-500">No tournaments yet. Create one in the admin dashboard.</p>}

      {tournaments.map((t) => (
        <div key={t.id} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xl font-bold">{t.name}</p>
              <p className="text-sm text-gray-400">{t.location} &middot; {t.date} &middot; {t.status}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href={`/t/${t.slug}/scoreboard`} className="rounded-lg bg-gray-800 px-3 py-2 font-bold">Scoreboard</Link>
            <Link href={`/t/${t.slug}/bracket`} className="rounded-lg bg-gray-800 px-3 py-2 font-bold">Bracket</Link>
            {Array.from({ length: t.courts_count }, (_, i) => i + 1).map((c) => (
              <span key={c} className="flex gap-2">
                <Link href={`/t/${t.slug}/judge/${c}`} className="rounded-lg bg-gray-800 px-3 py-2 font-bold">Judge {c === 1 ? 'A' : 'B'}</Link>
                <Link href={`/t/${t.slug}/controller/${c}`} className="rounded-lg bg-gray-800 px-3 py-2 font-bold">Controller {c === 1 ? 'A' : 'B'}</Link>
              </span>
            ))}
          </div>
        </div>
      ))}

      <Link href="/admin" className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-600">
        <span className="text-xl font-bold">Admin Dashboard</span>
        <p className="text-gray-400">Create and manage tournaments. Admin PIN required.</p>
      </Link>
    </main>
  );
}
