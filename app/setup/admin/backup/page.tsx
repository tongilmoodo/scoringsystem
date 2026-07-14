'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';

export default function BackupPage() {
  const { user, ready, login } = useAuth();
  const { tournament, ready: tReady } = useActiveTournament();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(''), 3000);
  }

  async function snapshot() {
    if (!tournament) return;
    setBusy(true);
    const [t, events, athletes, matches, scores] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', tournament.id).single(),
      supabase.from('events').select('*').eq('tournament_id', tournament.id),
      supabase.from('athletes').select('*'),
      supabase.from('matches').select('*').eq('tournament_id', tournament.id),
      supabase.from('score_events').select('*, match:matches!inner(tournament_id)').eq('match.tournament_id', tournament.id),
    ]);
    const dump = {
      exported_at: new Date().toISOString(),
      tournament: t.data,
      events: events.data,
      athletes: athletes.data,
      matches: matches.data,
      score_events: scores.data,
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${tournament.slug}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBusy(false);
    flash('Backup downloaded');
  }

  async function cloneTournament() {
    if (!tournament) return;
    const name = prompt('Name for the cloned tournament:', `${tournament.name} (copy)`);
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setBusy(true);
    // Clone tournament + event structure only (no athletes/matches/scores).
    const { data: newT, error } = await supabase
      .from('tournaments')
      .insert({ name, slug, date: tournament.date ?? new Date().toISOString().slice(0, 10), location: tournament.location ?? '', courts_count: tournament.courts_count })
      .select()
      .single();
    if (error) {
      alert(error.message);
      setBusy(false);
      return;
    }
    const { data: evs } = await supabase.from('events').select('*').eq('tournament_id', tournament.id);
    for (const ev of evs ?? []) {
      await supabase.from('events').insert({
        tournament_id: newT.id,
        name: ev.name,
        gender: ev.gender,
        weight_class: ev.weight_class,
        match_duration_seconds: ev.match_duration_seconds,
        break_duration_seconds: ev.break_duration_seconds,
        max_fouls: ev.max_fouls,
      });
    }
    setBusy(false);
    flash(`Cloned to "${name}" (/t/${slug}) \u2014 structure only`);
  }

  if (!ready || !tReady) return null;
  if (!user) return <PinPad title="Admin Login" onSubmit={(pin) => login(pin)} />;
  if (user.role !== 'admin') return <main className="p-6 text-xl">Admin access required.</main>;
  if (!tournament) return <main className="p-6 text-xl">No tournament selected.</main>;

  const btn = 'rounded-xl bg-white/10 px-6 py-4 text-left font-bold active:scale-95 disabled:opacity-40';

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="font-headline text-2xl font-bold uppercase tracking-widest">Backup &amp; Export</h1>
      {toast && <div className="animate-slide-in-right rounded-lg bg-black/60 px-4 py-2 text-success">{toast}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <button disabled={busy} onClick={snapshot} className={btn}>
          Export all tournament data (JSON)
          <span className="block text-sm font-normal text-text-muted">Full dump: tournament, events, athletes, matches, score events.</span>
        </button>
        <a href="/setup/admin/results" className={btn}>
          Export results (PDF / Excel)
          <span className="block text-sm font-normal text-text-muted">Medal table, match results, bracket &mdash; from the Results page.</span>
        </a>
        <button disabled={busy} onClick={snapshot} className={btn}>
          Mid-tournament backup snapshot
          <span className="block text-sm font-normal text-text-muted">Same JSON dump, timestamped filename.</span>
        </button>
        <button disabled={busy} onClick={cloneTournament} className={btn}>
          Clone tournament for next year
          <span className="block text-sm font-normal text-text-muted">Duplicates tournament + event structure (no athletes/scores).</span>
        </button>
      </div>
    </main>
  );
}
