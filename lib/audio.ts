'use client';

// Web Audio cues for match lifecycle + scoring. No audio assets required.
// Respects the same per-device mute flag as lib/sounds.ts ('sound_muted').

function muted(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('sound_muted') === '1';
}

export class TournamentAudio {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    // Resume if the browser suspended the context (autoplay policy).
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  playMatchStart() {
    if (muted() || typeof window === 'undefined') return;
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      // Ding-dong bell.
      [880, 698].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, now + i * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.3 + 1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.3);
        osc.stop(now + i * 0.3 + 1);
      });
    } catch {
      /* audio unavailable */
    }
  }

  playMatchEnd() {
    if (muted() || typeof window === 'undefined') return;
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2);
    } catch {
      /* audio unavailable */
    }
  }

  playScore() {
    if (muted() || typeof window === 'undefined') return;
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1174; // D6
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      /* audio unavailable */
    }
  }

  // High D6 chime for a committed consensus score.
  playScoreCommitted() {
    this.playScore();
  }

  // Break-ending cue: reuse the match-start bell.
  playBreakEnd() {
    this.playMatchStart();
  }

  // Double 800Hz square beep — generic warning (e.g. break nearly over).
  playWarning() {
    if (muted() || typeof window === 'undefined') return;
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      [0, 0.2].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 800;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.2, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.15);
      });
    } catch {
      /* audio unavailable */
    }
  }
}

export const audio = new TournamentAudio();
