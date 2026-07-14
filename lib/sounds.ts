'use client';

// Web Audio API tones - no audio assets needed, works offline.
let ctx: AudioContext | null = null;

function tone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  if (typeof window === 'undefined') return;
  try {
    ctx = ctx ?? new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  } catch {
    /* audio not available */
  }
}

/** Chime on score increment. */
export function playChime() {
  tone(880, 0.15);
  setTimeout(() => tone(1320, 0.2), 120);
}

/** Warning beep on foul. */
export function playBeep() {
  tone(440, 0.3, 'square');
}

/** Buzzer when the timer hits 0. */
export function playBuzzer() {
  tone(180, 1.2, 'sawtooth', 0.5);
}
