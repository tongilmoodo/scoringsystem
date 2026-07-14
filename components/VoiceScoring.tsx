'use client';

import { useRef, useState } from 'react';
import type { Side } from '@/lib/types';

type ActionType = 'point_1' | 'point_2' | 'point_3' | 'foul';
const POINTS: Record<ActionType, number> = { point_1: 1, point_2: 2, point_3: 3, foul: 0 };
const ACTION_LABEL: Record<ActionType, string> = {
  point_1: '+1',
  point_2: '+2',
  point_3: '+3',
  foul: 'FOUL',
};

interface Parsed {
  side: Side;
  action: ActionType;
  confidence: number;
  transcript: string;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

export default function VoiceScoring({
  onScore,
  disabled,
}: {
  onScore: (side: Side, action: ActionType, points: number) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Parsed | null>(null);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await process(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError('Microphone unavailable');
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function process(blob: Blob) {
    setBusy(true);
    try {
      const base64 = toBase64(await blob.arrayBuffer());
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType: blob.type || 'audio/webm' }),
      });
      if (!res.ok) throw new Error();
      const parsed: Parsed = await res.json();
      if (parsed.confidence > 0.9) {
        // High confidence: auto-execute.
        onScore(parsed.side, parsed.action, POINTS[parsed.action]);
      } else {
        // Low confidence: ask the scorer to confirm the transcript.
        setPending(parsed);
      }
    } catch {
      setError('Could not understand. Use the buttons.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        disabled={disabled || busy}
        onClick={() => (recording ? stop() : start())}
        className={`min-h-[80px] rounded-xl px-5 text-xl font-bold active:opacity-70 disabled:opacity-40 ${
          recording ? 'animate-pulse bg-red-600' : 'bg-purple-700'
        }`}
        title="Voice scoring: e.g. 'Blue plus three spinning kick' or 'Red foul'"
      >
        {busy ? '\u2026' : recording ? '\u25a0 Stop' : '\ud83c\udfa4 Voice'}
      </button>
      {error && <span className="self-center text-sm text-yellow-400">{error}</span>}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 text-center">
            <p className="mb-1 text-sm text-gray-400">
              Low confidence ({Math.round(pending.confidence * 100)}%). Heard:
            </p>
            <p className="mb-4 text-xl italic">&ldquo;{pending.transcript}&rdquo;</p>
            <p className="mb-4 text-2xl font-bold">
              {pending.side.toUpperCase()} {ACTION_LABEL[pending.action]}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  onScore(pending.side, pending.action, POINTS[pending.action]);
                  setPending(null);
                }}
                className="min-h-[80px] rounded-xl bg-green-700 text-xl font-bold"
              >
                Confirm
              </button>
              <button
                onClick={() => setPending(null)}
                className="min-h-[80px] rounded-xl bg-gray-700 text-xl font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
