'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';
import CountrySelect from '@/components/CountrySelect';
import { countryName, getFlagEmoji, resolveCountry } from '@/lib/countries';
import type { Athlete } from '@/lib/types';

interface EventRow {
  id: string;
  name: string;
  gender: string | null;
  age_group: string | null;
  division: string | null;
  belt_rank: string | null;
}

interface PreviewRow {
  name: string;
  team: string;
  countryInput: string;
  code: string | null; // resolved ISO code (or manually selected)
  eventName: string;
  event_id: string | null;
}

const EMPTY = { name: '', team: '', country_code: '', event_id: '', seed: '' };

export default function AthletesPage() {
  const { user, ready, login, logout } = useAuth();
  const { tournament, ready: tournamentReady } = useActiveTournament();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  const load = useCallback(async () => {
    if (!tournament) return;
    const { data: evs } = await supabase
      .from('events')
      .select('id, name, gender, age_group, division, belt_rank')
      .eq('tournament_id', tournament.id)
      .order('gender')
      .order('age_group')
      .order('division')
      .order('name');
    const evList = (evs ?? []) as EventRow[];
    setEvents(evList);
    const ids = evList.map((e) => e.id);
    const { data: ath } = ids.length
      ? await supabase.from('athletes').select('*').in('event_id', ids).order('created_at')
      : { data: [] };
    setAthletes((ath ?? []) as Athlete[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

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
    const { error } = editingId
      ? await supabase.from('athletes').update(payload).eq('id', editingId)
      : await supabase.from('athletes').insert(payload);
    if (error) {
      alert(`Could not save athlete: ${error.message}`);
      return;
    }
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

  function duplicate(a: Athlete) {
    setEditingId(null);
    setForm({
      name: a.name,
      team: a.team ?? '',
      country_code: a.country_code ?? '',
      event_id: '', // Leave blank so they select the new event
      seed: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- Bulk CSV import (columns: Name, Team, Country, Event) --------------
  // Country is validated against the COUNTRIES list by name OR code.
  function parseCsv() {
    const rows = csvText
      .trim()
      .split(/\r?\n/)
      .map((l) => l.split(',').map((c) => c.trim()));
    const body = rows[0]?.[0]?.toLowerCase() === 'name' ? rows.slice(1) : rows;
    setPreview(
      body
        .filter((r) => r[0])
        .map((r) => {
          const ev = events.find((e) => e.name.toLowerCase() === (r[3] ?? '').toLowerCase());
          return {
            name: r[0],
            team: r[1] ?? '',
            countryInput: r[2] ?? '',
            code: resolveCountry(r[2] ?? ''),
            eventName: r[3] ?? '',
            event_id: ev?.id ?? null,
          };
        })
    );
  }

  function rowValid(p: PreviewRow) {
    // Event must resolve; country must resolve if provided (or be fixed manually).
    return !!p.event_id && (!p.countryInput || !!p.code);
  }

  async function importCsv() {
    if (!preview) return;
    const valid = preview.filter(rowValid);
    if (valid.length === 0) return;
    const { error } = await supabase.from('athletes').insert(
      valid.map((p) => ({
        name: p.name,
        team: p.team || null,
        country_code: p.code,
        event_id: p.event_id,
      }))
    );
    if (error) {
      alert(`Import failed: ${error.message}`);
      return;
    }
    setPreview(null);
    setCsvText('');
    load();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setCsvText);
  }

  if (!ready || !tournamentReady) return null;
  if (!user) return <PinPad title="Admin Login" onSubmit={(pin) => login(pin)} />;
  if (user.role !== 'admin') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">Admin access required.</p>
        <button onClick={logout} className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Switch user</button>
      </main>
    );
  }

  const input = 'rounded-lg border border-gray-700 bg-gray-800 px-3 py-2';

  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl">No tournament selected.</p>
        <Link href="/admin" className="rounded-lg bg-gray-700 px-6 py-3 font-bold">Choose a tournament</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Athletes</h1>
        <Link href="/admin" className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold">&larr; Dashboard</Link>
      </div>

      {/* Registration form */}
      <div className="grid gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 md:grid-cols-6">
        <input className={`${input} md:col-span-2`} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={input} placeholder="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
        <div className="md:col-span-1">
          <CountrySelect value={form.country_code} onChange={(code) => setForm({ ...form, country_code: code })} />
        </div>
        <select className={input} value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
          <option value="">Event *</option>
          {Array.from(new Set(events.map(ev => `${ev.gender ?? 'Unspecified'} | ${ev.age_group ?? 'Any Age'} | ${ev.division ?? 'Open'}`))).map(group => (
            <optgroup key={group} label={group}>
              {events
                .filter(ev => `${ev.gender ?? 'Unspecified'} | ${ev.age_group ?? 'Any Age'} | ${ev.division ?? 'Open'}` === group)
                .map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name} {ev.belt_rank ? `(${ev.belt_rank})` : ''}</option>
                ))}
            </optgroup>
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

      {/* Bulk CSV import */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-2 font-bold">Bulk import (CSV)</h2>
        <p className="mb-2 text-sm text-gray-400">
          Columns: Name, Team, Country, Event. Country accepts a full name (Kenya) or ISO code (KE).
        </p>
        <textarea
          className={`${input} h-28 w-full font-mono text-sm`}
          placeholder={'Name,Team,Country,Event\nJane Doe,Mombasa TMD,Kenya,Men\u2019s -78kg'}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm text-gray-400" />
          <button onClick={parseCsv} disabled={!csvText.trim()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold disabled:opacity-40">Preview</button>
          {preview && (
            <>
              <button onClick={importCsv} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold">
                Import {preview.filter(rowValid).length} valid rows
              </button>
              <button onClick={() => setPreview(null)} className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-bold">Cancel</button>
            </>
          )}
        </div>
        {preview && (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-gray-400">
              <tr><th className="p-2">Name</th><th className="p-2">Team</th><th className="p-2">Country</th><th className="p-2">Event</th><th className="p-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {preview.map((p, i) => (
                <tr key={i}>
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">{p.team}</td>
                  <td className="p-2">
                    {p.code ? (
                      <span>{getFlagEmoji(p.code)} {countryName(p.code)}</span>
                    ) : p.countryInput ? (
                      <CountrySelect
                        value=""
                        placeholder={`\u201c${p.countryInput}\u201d?`}
                        onChange={(code) =>
                          setPreview((rows) =>
                            rows ? rows.map((r, j) => (j === i ? { ...r, code } : r)) : rows
                          )
                        }
                      />
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="p-2">{p.eventName}</td>
                  <td className="p-2">
                    {!p.event_id ? (
                      <span className="text-red-400">Unknown event</span>
                    ) : p.countryInput && !p.code ? (
                      <span className="text-yellow-400">Unrecognized country &mdash; please select manually</span>
                    ) : (
                      <span className="text-green-400">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                <td className="p-3" title={a.country_code ? countryName(a.country_code) : ''}>
                  {a.country_code ? `${getFlagEmoji(a.country_code)} ${a.country_code}` : ''}
                </td>
                <td className="p-3">{events.find((e) => e.id === a.event_id)?.name}</td>
                <td className="p-3">{a.seed}</td>
                <td className="p-3">{a.lot_number}</td>
                <td className="p-3">
                  <button onClick={() => edit(a)} className="mr-2 text-blue-400 underline hover:text-blue-300">Edit</button>
                  <button onClick={() => duplicate(a)} className="mr-2 text-green-400 underline hover:text-green-300">Duplicate</button>
                  <button onClick={() => remove(a.id)} className="text-red-400 underline hover:text-red-300">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
