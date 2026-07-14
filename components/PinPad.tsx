'use client';

import { useState } from 'react';
import Logo from '@/components/ui/Logo';
import { requestKioskFullscreen } from '@/lib/useKiosk';

export default function PinPad({
  title,
  onSubmit,
}: {
  title: string;
  onSubmit: (pin: string) => Promise<string | null>;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setError('');
    // First user gesture: enter fullscreen for kiosk tablets.
    requestKioskFullscreen();
    const err = await onSubmit(pin);
    setBusy(false);
    if (err) {
      setError(err);
      setPin('');
    }
  }

  return (
    <div className={`kiosk fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy text-white ${error ? 'animate-shake' : ''}`}>
      <Logo size={48} />
      <h1 className="mb-1 mt-4 font-headline text-2xl font-bold uppercase tracking-widest">{title}</h1>
      <p className="mb-4 h-6 text-danger">{error}</p>
      <div className="mb-6 flex h-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full transition ${i < pin.length ? 'bg-gold' : 'bg-white/20'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((k) => (
          <button
            key={k}
            disabled={busy}
            onClick={() => (k === 'C' ? setPin('') : k === 'OK' ? submit() : setPin((p) => (p + k).slice(0, 8)))}
            className={`h-20 w-20 rounded-xl font-headline text-2xl font-bold transition active:scale-95 ${
              k === 'OK' ? 'bg-success text-black' : k === 'C' ? 'bg-danger' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
