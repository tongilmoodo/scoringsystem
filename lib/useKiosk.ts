'use client';

import { useEffect } from 'react';

// Screen Wake Lock typings are not in the default DOM lib in all TS setups.
interface WakeLockSentinelLike {
  release: () => Promise<void>;
}
interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/**
 * Kiosk behaviour for judge/controller tablets:
 * - keeps the screen awake (Wake Lock API, re-acquired on visibility change)
 * - suppresses the context menu / long-press callout
 * - warns before unload while a match is live
 */
export function useKiosk(matchLive: boolean) {
  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null;
    const nav = navigator as Navigator & { wakeLock?: WakeLockLike };

    async function acquire() {
      try {
        if (nav.wakeLock) sentinel = await nav.wakeLock.request('screen');
      } catch {
        /* wake lock unavailable */
      }
    }
    acquire();

    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    const onContext = (e: Event) => e.preventDefault();

    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('contextmenu', onContext);
      sentinel?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!matchLive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [matchLive]);
}

/** Request fullscreen after the first user gesture (browsers block it otherwise). */
export function requestKioskFullscreen() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }
}
