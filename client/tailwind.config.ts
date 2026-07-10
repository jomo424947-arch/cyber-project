import type { Config } from 'tailwindcss';

// Tailwind is configured to reference the CSS custom properties defined in index.css,
// so utility classes like `bg-surface`, `text-cyan`, `border-glow` map to the design tokens.
const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        input: 'var(--bg-input)',
        cyan: {
          DEFAULT: 'var(--accent-cyan)',
          dim: 'var(--accent-cyan-dim)',
        },
        green: 'var(--accent-green)',
        yellow: 'var(--accent-yellow)',
        red: 'var(--accent-red)',
        purple: 'var(--accent-purple)',
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          accent: 'var(--text-accent)',
        },
        edge: {
          DEFAULT: 'var(--border-default)',
          glow: 'var(--border-glow)',
        },
      },
      fontFamily: {
        display: ['Audiowide', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        glow: 'var(--shadow-glow)',
        'glow-strong': 'var(--shadow-glow-strong)',
      },
      borderRadius: {
        card: '12px',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.8)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
