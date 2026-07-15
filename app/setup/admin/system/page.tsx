'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';
import {
  broadcast,
  clearAllVotes,
  clearBroadcasts,
  emergencyStop,
  resumeAll,
} from '@/lib/adminApi';

export default function SystemControlPage() {
  const { user, ready, login } = useAuth();
  const { tournament, ready: tReady } = useActiveTournament();
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState('');

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(''), 3000);
  }

  if (!ready || !tReady) return null;
  if (!user) return <PinPad title="Admin Login" onSubmit={(pin) => login(pin)} />;
  if (user.role !== 'admin') {
    return <main className="p-6 text-xl">Admin access required.</main>;
  }
  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">No tournament selected.</p>
        <Link href="/setup/admin" className="rounded-lg bg-white/10 px-6 py-3 font-bold">Choose a tournament</Link>
      </main>
    );
  }
  const tid = tournament.id;

  const danger = 'rounded-xl bg-danger px-6 py-4 font-headline text-xl font-bold uppercase tracking-widest active:scale-95';
  const warn = 'rounded-xl bg-warning px-6 py-4 font-headline text-xl font-bold uppercase tracking-widest text-black active:scale-95';
  const ok = 'rounded-xl bg-success px-6 py-4 font-headline text-xl font-bold uppercase tracking-widest text-black active:scale-95';

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-headline text-2xl font-bold uppercase tracking-widest">System Control</h1>
      {toast && <div className="animate-slide-in-right rounded-lg bg-black/60 px-4 py-2 text-success">{toast}</div>}

      <section className="grid gap-4 md:grid-cols-2">
        <button onClick={async () => { await emergencyStop(tid); flash('All courts paused'); }} className={danger}>
          Emergency Stop &mdash; Pause All Courts
        </button>
        <button onClick={async () => { await resumeAll(tid); flash('Resumed all courts'); }} className={ok}>
          Resume All
        </button>

        <button onClick={async () => { await clearAllVotes(tid); flash('All pending votes cleared'); }} className={warn}>
          Clear All Votes
        </button>
        <button onClick={async () => { await clearBroadcasts(tid); flash('Broadcasts cleared'); }} className="rounded-xl bg-white/10 px-6 py-4 font-headline text-xl font-bold uppercase tracking-widest active:scale-95">
          Clear Broadcast Banner
        </button>
      </section>

      <section className="rounded-xl border border-white/10 bg-bg-dark p-4">
        <h2 className="mb-2 font-bold">Broadcast Message to All Tablets</h2>
        <div className="flex gap-3">
          <input
            className="flex-1 rounded-lg border border-white/10 bg-navy px-3 py-2"
            placeholder="e.g. Lunch break until 13:00"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
          <button
            onClick={async () => {
              if (!msg.trim()) return;
              await broadcast(tid, msg.trim());
              setMsg('');
              flash('Broadcast sent');
            }}
            className="rounded-lg bg-crimson px-6 py-2 font-bold"
          >
            Send
          </button>
        </div>
      </section>
    </main>
  );
}
