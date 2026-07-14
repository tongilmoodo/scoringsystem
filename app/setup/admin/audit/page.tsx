'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/useAuth';
import { useActiveTournament } from '@/lib/useTournament';
import PinPad from '@/components/PinPad';
import type { ScoreEvent } from '@/lib/types';

export default function AuditPage() {
  const { user, ready, login } = useAuth();
  const { tournament, ready: tReady } = useActiveTournament();
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [search, setSearch] = useState('');
  const [courtFilter, setCourtFilter] = useState('');

  const load = useCallback(async () => {
    if (!tournament) return;
    const { data } = await supabase
      .from('score_events')
      .select('*, match:matches!inner(tournament_id, court_number, match_number)')
      .eq('match.tournament_id', tournament.id)
      .order('created_at', { ascending: false })
      .limit(1000);
    setEvents((data ?? []) as unknown as ScoreEvent[]);
  }, [tournament?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.role === 'admin') load();
    const ch = supabase
      .channel('audit-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'score_events' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      const court = (e as unknown as { match?: { court_number?: number } }).match?.court_number;
      if (courtFilter && String(court) !== courtFilter) return false;
      if (q && !(e.scored_by ?? '').toLowerCase().includes(q) && !e.action_type.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, search, courtFilter]);

  function exportData(kind: 'csv' | 'json') {
    let blob: Blob;
    if (kind === 'json') {
      blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    } else {
      const rows = [
        ['time', 'court', 'side', 'action', 'points', 'takedown', 'scored_by'],
        ...filtered.map((e) => [
          e.created_at,
          String((e as unknown as { match?: { court_number?: number } }).match?.court_number ?? ''),
          e.player_side,
          e.action_type,
          String(e.points),
          String(e.takedown),
          e.scored_by ?? '',
        ]),
      ];
      blob = new Blob([rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-${tournament?.slug}.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!ready || !tReady) return null;
  if (!user) return <PinPad title="Admin Login" onSubmit={(pin) => login(pin)} />;
  if (user.role !== 'admin') return <main className="p-6 text-xl">Admin access required.</main>;
  if (!tournament) return <main className="p-6 text-xl">No tournament selected.</main>;

  const input = 'rounded-lg border border-white/10 bg-navy px-3 py-2';

  return (
    <main className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline text-2xl font-bold uppercase tracking-widest">Audit &amp; Logs</h1>
        <div className="flex gap-2 text-sm">
          <button onClick={() => exportData('csv')} className="rounded-lg bg-white/10 px-4 py-2 font-bold">Export CSV</button>
          <button onClick={() => exportData('json')} className="rounded-lg bg-white/10 px-4 py-2 font-bold">Export JSON</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input className={input} placeholder="Search athlete / judge / action" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={input} value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)}>
          <option value="">All courts</option>
          <option value="1">Court A</option>
          <option value="2">Court B</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg-dark text-text-muted">
            <tr><th className="p-2">Time</th><th className="p-2">Court</th><th className="p-2">Side</th><th className="p-2">Action</th><th className="p-2">Pts</th><th className="p-2">Source</th></tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filtered.map((e) => {
              const overridden = (e.scored_by ?? '').includes('manual override');
              const court = (e as unknown as { match?: { court_number?: number } }).match?.court_number;
              return (
                <tr key={e.id} className={overridden ? 'bg-danger/10' : ''}>
                  <td className="p-2 text-text-muted">{new Date(e.created_at).toLocaleTimeString()}</td>
                  <td className="p-2">{court ? (court === 1 ? 'A' : 'B') : '-'}</td>
                  <td className="p-2 capitalize">{e.player_side}</td>
                  <td className="p-2">{e.action_type}{e.takedown ? ' [TD]' : ''}</td>
                  <td className="p-2 tabular-nums">{e.points}</td>
                  <td className={`p-2 ${overridden ? 'font-bold text-danger' : 'text-text-muted'}`}>
                    {e.scored_by}{overridden ? ' \u26a0' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">Rows highlighted red are manual controller/admin overrides (tamper indicator).</p>
    </main>
  );
}
