'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';

interface UserRow {
  id: string;
  name: string;
  role: 'admin' | 'controller' | 'judge';
  court_access: number | null;
  is_active: boolean;
  last_active_at: string | null;
}

const EMPTY = { name: '', role: 'judge', court_access: '1', pin: '' };

export default function UsersPage() {
  const { user, ready, login } = useAuth();
  const { tournament, ready: tReady } = useActiveTournament();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [revealed, setRevealed] = useState<{ name: string; pin: string } | null>(null);
  const [bulk, setBulk] = useState('');
  // Admin PIN kept in memory for privileged server calls.
  const [adminPin, setAdminPin] = useState('');

  const load = useCallback(async () => {
    if (!tournament) return;
    const { data } = await supabase
      .from('users')
      .select('id, name, role, court_access, is_active, last_active_at')
      .or(`tournament_id.eq.${tournament.id},tournament_id.is.null`)
      .order('role');
    setUsers((data ?? []) as UserRow[]);
  }, [tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

  async function api(payload: Record<string, unknown>) {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPin, slug: tournament?.slug, tournamentId: tournament?.id, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error ?? 'Request failed');
      return null;
    }
    await load();
    return body;
  }

  async function create() {
    if (!form.name) return;
    const body = await api({
      op: 'create',
      name: form.name,
      role: form.role,
      court_access: form.role === 'admin' ? null : Number(form.court_access),
      pin: form.pin || undefined,
    });
    if (body?.pin) setRevealed({ name: form.name, pin: body.pin });
    setForm(EMPTY);
  }

  async function resetPin(u: UserRow) {
    const body = await api({ op: 'reset_pin', userId: u.id });
    if (body?.pin) setRevealed({ name: u.name, pin: body.pin });
  }

  async function bulkCreate() {
    const lines = bulk.trim().split(/\r?\n/).filter(Boolean);
    const created: { name: string; pin: string }[] = [];
    for (const line of lines) {
      const [name, role = 'judge', court = '1'] = line.split(',').map((s) => s.trim());
      if (!name) continue;
      const body = await api({
        op: 'create',
        name,
        role,
        court_access: role === 'admin' ? null : Number(court),
      });
      if (body?.pin) created.push({ name, pin: body.pin });
    }
    setBulk('');
    if (created.length) alert('Created (save these PINs now):\n' + created.map((c) => `${c.name}: ${c.pin}`).join('\n'));
  }

  async function resetCourtJudges(court: number) {
    if (!confirm(`Reset PINs for ALL Court ${court === 1 ? 'A' : 'B'} judges?`)) return;
    const judges = users.filter((u) => u.role === 'judge' && u.court_access === court && u.is_active);
    const out: string[] = [];
    for (const j of judges) {
      const body = await api({ op: 'reset_pin', userId: j.id });
      if (body?.pin) out.push(`${j.name}: ${body.pin}`);
    }
    if (out.length) alert('New PINs (save now):\n' + out.join('\n'));
  }

  if (!ready || !tReady) return null;
  if (!user) return <PinPad title="Admin Login" onSubmit={async (pin) => { const e = await login(pin); if (!e) setAdminPin(pin); return e; }} />;
  if (user.role !== 'admin') return <main className="p-6 text-xl">Admin access required.</main>;
  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">No tournament selected.</p>
        <Link href="/setup/admin" className="rounded-lg bg-white/10 px-6 py-3 font-bold">Choose a tournament</Link>
      </main>
    );
  }

  const input = 'rounded-lg border border-white/10 bg-navy px-3 py-2';

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="font-headline text-2xl font-bold uppercase tracking-widest">User Management</h1>

      {!adminPin && (
        <p className="rounded-lg bg-warning/20 px-4 py-2 text-sm text-warning">
          Re-enter your admin PIN once to authorise privileged actions:
          <input type="password" className={`${input} ml-2`} onChange={(e) => setAdminPin(e.target.value)} placeholder="Admin PIN" />
        </p>
      )}

      {/* Create user */}
      <div className="grid gap-3 rounded-xl border border-white/10 bg-bg-dark p-4 md:grid-cols-5">
        <input className={`${input} md:col-span-2`} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="judge">Judge</option>
          <option value="controller">Controller</option>
          <option value="admin">Admin</option>
        </select>
        <select className={input} value={form.court_access} onChange={(e) => setForm({ ...form, court_access: e.target.value })} disabled={form.role === 'admin'}>
          <option value="1">Court A</option>
          <option value="2">Court B</option>
        </select>
        <input className={input} placeholder="PIN (blank = auto)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
        <button onClick={create} className="rounded-lg bg-success px-6 py-2 font-bold text-black md:col-span-5">Create user</button>
      </div>

      {/* Bulk create + emergency reset */}
      <div className="grid gap-3 rounded-xl border border-white/10 bg-bg-dark p-4">
        <h2 className="font-bold">Bulk create (one per line: Name, Role, Court)</h2>
        <textarea className={`${input} h-24 font-mono text-sm`} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Jane Doe, judge, 1\nJohn Roe, controller, 2'} />
        <div className="flex flex-wrap gap-3">
          <button onClick={bulkCreate} className="rounded-lg bg-crimson px-4 py-2 font-bold">Bulk create</button>
          <button onClick={() => resetCourtJudges(1)} className="rounded-lg bg-warning px-4 py-2 font-bold text-black">Reset all Court A judge PINs</button>
          <button onClick={() => resetCourtJudges(2)} className="rounded-lg bg-warning px-4 py-2 font-bold text-black">Reset all Court B judge PINs</button>
        </div>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg-dark text-text-muted">
            <tr><th className="p-3">Status</th><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Court</th><th className="p-3">Last active</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map((u) => {
              const online = u.last_active_at && Date.now() - new Date(u.last_active_at).getTime() < 60000;
              return (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-40'}>
                  <td className="p-3"><span className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-success' : 'bg-gray-600'}`} /></td>
                  <td className="p-3 font-bold">{u.name}</td>
                  <td className="p-3 capitalize">{u.role}</td>
                  <td className="p-3">{u.court_access ? (u.court_access === 1 ? 'A' : 'B') : '-'}</td>
                  <td className="p-3 text-text-muted">{u.last_active_at ? new Date(u.last_active_at).toLocaleTimeString() : 'never'}</td>
                  <td className="p-3">
                    <button onClick={() => resetPin(u)} className="mr-2 text-gold underline">Reset PIN</button>
                    <button onClick={() => api({ op: 'set_active', userId: u.id, is_active: !u.is_active })} className={`underline ${u.is_active ? 'text-danger' : 'text-success'}`}>
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* One-time PIN reveal */}
      {revealed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-sm rounded-xl bg-bg-dark p-6 text-center">
            <p className="mb-2 text-text-muted">PIN for {revealed.name} (shown once):</p>
            <p className="mb-4 font-mono text-5xl font-black text-gold">{revealed.pin}</p>
            <button onClick={() => setRevealed(null)} className="rounded-lg bg-white/10 px-6 py-2 font-bold">Done</button>
          </div>
        </div>
      )}
    </main>
  );
}
