'use client';

import { useState } from 'react';

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
    const err = await onSubmit(pin);
    setBusy(false);
    if (err) {
      setError(err);
      setPin('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 text-white">
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <p className="mb-4 h-6 text-red-400">{error}</p>
      <div className="mb-6 flex h-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-white' : 'bg-gray-700'}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((k) => (
          <button
            key={k}
            disabled={busy}
            onClick={() =>
              k === 'C' ? setPin('') : k === 'OK' ? submit() : setPin((p) => (p + k).slice(0, 8))
            }
            className={`h-20 w-20 rounded-xl text-2xl font-bold active:opacity-70 ${
              k === 'OK' ? 'bg-green-600' : k === 'C' ? 'bg-red-700' : 'bg-gray-800'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
