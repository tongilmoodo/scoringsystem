'use client';

import { useEffect, useRef, useState } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Format a Supabase/Postgres error into a single human-readable line that is
 * safe to show in the UI. Includes code + details when present so silent
 * schema mismatches (e.g. a missing column) are immediately visible.
 */
export function formatSupabaseError(error: PostgrestError | Error | unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const e = error as Partial<PostgrestError> & { message?: string };
    const parts = [e.message];
    if (e.code) parts.push(`code: ${e.code}`);
    if (e.details) parts.push(`details: ${e.details}`);
    if (e.hint) parts.push(`hint: ${e.hint}`);
    return parts.filter(Boolean).join(' \u00b7 ');
  }
  return String(error);
}

type PostgrestResult<T> = { data: T | null; error: PostgrestError | null };

/**
 * Await a Supabase query builder and throw (with a full, formatted message and
 * the original error attached) if it failed. Use inside a try/catch that feeds
 * a visible error banner.
 */
export async function queryOrThrow<T>(
  builder: PromiseLike<PostgrestResult<T>>,
  label: string,
): Promise<T> {
  const { data, error } = await builder;
  if (error) {
    // Full object to the console for debugging; formatted message for the UI.
    // eslint-disable-next-line no-console
    console.error(`[query failed] ${label}`, error);
    const wrapped = new Error(`${label}: ${formatSupabaseError(error)}`);
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
  return (data ?? null) as T;
}

export type LoadPhase = 'loading' | 'ready' | 'error';

/**
 * Drive a load lifecycle with a hard timeout. If `phase` is still 'loading'
 * after `timeoutMs`, it flips to 'error' with a timeout message so the UI can
 * show a visible "Failed to load—Retry" state instead of an infinite spinner.
 *
 * `attempt` is a monotonically increasing counter; bump it (e.g. from a Retry
 * button) to reset the timer for a fresh load.
 */
export function useLoadTimeout(phase: LoadPhase, attempt: number, timeoutMs = 8000) {
  const [timedOut, setTimedOut] = useState(false);
  const startedRef = useRef(0);

  useEffect(() => {
    if (phase !== 'loading') return;
    setTimedOut(false);
    startedRef.current = Date.now();
    const id = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(id);
  }, [phase, attempt, timeoutMs]);

  return timedOut;
}
