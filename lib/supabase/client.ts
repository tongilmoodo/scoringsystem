import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.');
    }
    _client = createClient(url, key);
  }
  return _client;
}

// Backward-compatible named export.
//
// Previously this used an ES6 Proxy to lazily forward property access to the
// real client. Proxy CANNOT be polyfilled, so older smart-TV browsers
// (Hisense VIDAA, older Tizen / webOS) that lack it failed to evaluate the
// bundle at all — a blank screen with no console output. We instead expose a
// lazy getter object whose properties resolve the client on first access,
// which transpiles down cleanly for old engines.
function lazyClientAccessor(): SupabaseClient {
  const target = {} as Record<string | symbol, unknown>;
  const props: (keyof SupabaseClient)[] = [
    'from',
    'rpc',
    'channel',
    'removeChannel',
    'removeAllChannels',
    'getChannels',
    'auth',
    'storage',
    'realtime',
    'functions',
    'schema',
  ];
  for (const prop of props) {
    Object.defineProperty(target, prop, {
      enumerable: true,
      get() {
        const client = getSupabase() as unknown as Record<string, unknown>;
        const value = client[prop as string];
        // Bind functions so `this` stays the real client.
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value;
      },
    });
  }
  return target as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = lazyClientAccessor();
