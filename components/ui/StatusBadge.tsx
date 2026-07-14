import type { Match } from '@/lib/types';

const STYLES: Record<string, string> = {
  scheduled: 'bg-gray-600 text-white',
  assigned: 'bg-gray-600 text-white',
  live: 'bg-success text-black animate-pulse',
  paused: 'bg-warning text-black',
  break: 'bg-warning text-black',
  takedown: 'bg-danger text-white animate-pulse',
  completed: 'bg-gold text-navy',
};

export type BadgeState = Match['status'] | 'break' | 'takedown';

export function StatusBadge({ state }: { state: BadgeState }) {
  return (
    <span className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wide ${STYLES[state] ?? STYLES.scheduled}`}>
      {state}
    </span>
  );
}

/** Judge connection health: green all 4, yellow 2-3, red 0-1. */
export function ConnectionDot({ connected, total = 4 }: { connected: number; total?: number }) {
  const color = connected >= total ? 'bg-success' : connected >= 2 ? 'bg-warning' : 'bg-danger';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
      <span className={`h-2.5 w-2.5 rounded-full ${color} ${connected >= total ? 'animate-live-pulse' : ''}`} />
      {connected}/{total}
    </span>
  );
}
