'use client';

/**
 * Full-screen load fallback for public/TV pages. Shows a spinner while
 * loading, but once the load has timed out (or errored) it shows an explicit
 * message + Retry button instead of an indefinite spinner — so a stalled TV
 * display never sits silently on "Loading…".
 */
export default function LoadFallback({
  timedOut,
  error,
  onRetry,
  label = 'Loading\u2026',
}: {
  timedOut: boolean;
  error?: string | null;
  onRetry?: () => void;
  label?: string;
}) {
  const failed = timedOut || !!error;

  if (!failed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black">
        <span className="animate-pulse font-headline text-xl uppercase tracking-widest text-text-muted">{label}</span>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-center">
      <p className="font-headline text-2xl font-bold uppercase tracking-widest text-danger">Failed to load</p>
      <p className="max-w-xl font-mono text-sm text-text-muted">
        {error ?? 'The page took too long to load (timed out after 8s). Check the network/display connection.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-xl bg-white/10 px-6 py-3 font-headline text-lg font-bold uppercase tracking-widest active:scale-95"
        >
          Retry
        </button>
      )}
    </main>
  );
}
