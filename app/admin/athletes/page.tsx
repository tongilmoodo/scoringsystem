'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import PinPad from '@/components/PinPad';
import type { Athlete } from '@/lib/types';

interface EventRow {
  id: string;
  name: string;
}

const EMPTY = { name: '', team: '', country_code: '', event_id: '', seed: '' };

export default function AthletesPage() {
  const { user, ready, login, logout } = useAuth();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: ath }, { data: evs }] = await Promise.all([
      supabase.from('athletes').select('*').order('created_at'),
      supabase.from('events').select('id, name').order('created_at'),
    ]);
    setAthletes((ath ?? []) as Athlete[]);
    setEvents((evs ?? []) as EventRow[]);
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

  async function save() {
    if (!form.name || !form.event_id) return;
    const payload = {
      name: form.name,
      team: form.team || null,
      country_code: form.country_code || null,
      event_id: form.event_id,
      seed: form.seed ? Number(form.seed) : null,
    };
    if (editingId) await supabase.from('athletes').update(payload).eq('id', editingId);
    else await supabase.from('athletes').insert(payload);
    setForm(EMPTY);
    setEditingId(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this athlete?')) return;
    await supabase.from('athletes').delete().eq('id', id);
    load();
  }

  function edit(a: Athlete) {
    setEditingId(a.id);
    setForm({
      name: a.name,
      team: a.team ?? '',
      country_code: a.country_code ?? '',
      event_id: a.event_id,
      seed: a.seed?.toString() ?? '',
    });
  }

  if (!ready) return null;
  if (!user) return <PinPad title="Admin Login" onSubmit={login} />;
  if (user.role !== 'admin') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Admin access required.</p>
        <button onClick={logout} className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Switch user</button>
      </main>
    );
  }

  const input = 'rounded-lg border border-gray-700 bg-gray-800 px-3 py-2';

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Athletes</h1>
        <Link href="/admin" className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold">← Dashboard</Link>
      </div>

      {/* Registration form */}
      <div className="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 md:grid-cols-6">
        <input className={`${input} md:col-span-2`} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={input} placeholder="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
        <input className={input} placeholder="Country (KE)" maxLength={2} value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })} />
        <select className={input} value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
          <option value="">Event *</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}</option>
          ))}
        </select>
        <input className={input} placeholder="Seed" type="number" value={form.seed} onChange={(e) => setForm({ ...form, seed: e.target.value })} />
        <div className="flex gap-2 md:col-span-6">
          <button onClick={save} className="rounded-lg bg-green-700 px-6 py-2 font-bold">
            {editingId ? 'Update athlete' : 'Register athlete'}
          </button>
          {editingId && (
            <button onClick={() => { setEditingId(null); setForm(EMPTY); }} className="rounded-lg bg-gray-700 px-6 py-2 font-bold">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Athletes table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900 text-gray-400">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Team</th>
              <th className="p-3">Country</th>
              <th className="p-3">Event</th>
              <th className="p-3">Seed</th>
              <th className="p-3">Lot</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {athletes.map((a) => (
              <tr key={a.id}>
                <td className="p-3 font-bold">{a.name}</td>
                <td className="p-3">{a.team}</td>
                <td className="p-3">{a.country_code}</td>
                <td className="p-3">{events.find((e) => e.id === a.event_id)?.name}</td>
                <td className="p-3">{a.seed}</td>
                <td className="p-3">{a.lot_number}</td>
                <td className="p-3">
                  <button onClick={() => edit(a)} className="mr-2 text-blue-400 underline">Edit</button>
                  <button onClick={() => remove(a.id)} className="text-red-400 underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
