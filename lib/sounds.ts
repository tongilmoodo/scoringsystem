'use client';

// Web Audio API tones - no audio assets needed, works offline.
// Respects a per-device mute flag stored in localStorage ('sound_muted').
let ctx: AudioContext | null = null;

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('sound_muted') === '1';
}

export function setMuted(muted: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('sound_muted', muted ? '1' : '0');
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.3, delay = 0) {
  if (typeof window === 'undefined' || isMuted()) return;
  try {
    ctx = ctx ?? new AudioContext();
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(volume, start);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.stop(start + duration);
  } catch {
    /* audio not available */
  }
}

export function playTimerStart() {
  tone(800, 0.1);
}

// Rapid beep for the final 10 seconds.
export function playTick() {
  tone(1000, 0.05, 'square', 0.2);
}

// Descending buzzer at time-up.
export function playBuzzer() {
  tone(200, 0.5, 'sawtooth', 0.5);
}

// Pleasant two-note chime on a committed score.
export function playChime() {
  tone(1200, 0.2, 'sine', 0.3);
  tone(1500, 0.2, 'sine', 0.25, 0.08);
}

// Warning buzz on a foul.
export function playBeep() {
  tone(400, 0.3, 'square', 0.35);
}

export function playBreak() {
  tone(600, 0.2, 'sine', 0.3);
}

// Alternating alert for a takedown window.
export function playTakedown() {
  tone(800, 0.15, 'square', 0.35);
  tone(400, 0.15, 'square', 0.35, 0.15);
}

// Three ascending tones at match end.
export function playFanfare() {
  tone(800, 0.2, 'sine', 0.4);
  tone(1000, 0.2, 'sine', 0.4, 0.2);
  tone(1200, 0.3, 'sine', 0.4, 0.4);
}
