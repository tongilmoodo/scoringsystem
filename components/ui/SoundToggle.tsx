'use client';

import { useEffect, useState } from 'react';
import { isMuted, setMuted } from '@/lib/sounds';

/** Per-device mute toggle. */
export default function SoundToggle({ className = '' }: { className?: string }) {
  const [muted, setLocal] = useState(false);
  useEffect(() => setLocal(isMuted()), []);
  return (
    <button
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setLocal(next);
      }}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
      className={`rounded-lg bg-navy/60 px-3 py-1 text-sm font-bold text-text-muted ${className}`}
    >
      {muted ? '🔇 Muted' : '🔊 Sound'}
    </button>
  );
}
