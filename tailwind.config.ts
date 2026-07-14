import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1a1a2e',
        crimson: '#e94560',
        gold: '#ffd700',
        'bg-dark': '#0f0f1a',
        'bg-light': '#f8f9fa',
        'text-muted': '#a0a0b0',
        success: '#00d26a',
        warning: '#ffa500',
        danger: '#ff3333',
      },
      fontFamily: {
        headline: ['var(--font-oswald)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-roboto-mono)', 'monospace'],
      },
      keyframes: {
        'score-pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        'live-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.5)', opacity: '0.6' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(40px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'flash-gold': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgba(255,215,0,0.85)' },
        },
        'flash-green': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgba(0,210,106,0.85)' },
        },
        shake: {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
        fade: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
      animation: {
        'score-pop': 'score-pop 300ms ease-out',
        'live-pulse': 'live-pulse 2s ease-in-out infinite',
        'slide-down': 'slide-down 400ms ease',
        'slide-in-right': 'slide-in-right 300ms ease',
        'slide-up': 'slide-up 300ms ease',
        'flash-gold': 'flash-gold 600ms ease-in-out 3',
        'flash-green': 'flash-green 600ms ease-in-out 1',
        shake: 'shake 400ms ease-in-out',
        fade: 'fade 200ms ease',
      },
    },
  },
  plugins: [],
} satisfies Config;
