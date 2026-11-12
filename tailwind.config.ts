import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import animate from 'tailwindcss-animate';
import { THEMES, TOKEN_NAMES, type TokenName } from './src/design/tokens';

/** CSS variables for one theme, generated from the OKLCH token table (single source of truth). */
function vars(theme: keyof typeof THEMES): Record<string, string> {
  return Object.fromEntries(TOKEN_NAMES.map(name => [`--${name}`, THEMES[theme][name]]));
}

/** Tokens that already carry their own alpha (translucent borders) cannot take an opacity modifier. */
const SELF_ALPHA = new Set<TokenName>(['border', 'input']);
const color = (name: TokenName): string =>
  SELF_ALPHA.has(name) ? `oklch(var(--${name}))` : `oklch(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: color('background'),
        foreground: color('foreground'),
        panel: color('panel'),
        border: color('border'),
        input: color('input'),
        ring: color('ring'),
        card: { DEFAULT: color('card'), foreground: color('card-foreground') },
        popover: { DEFAULT: color('popover'), foreground: color('popover-foreground') },
        primary: { DEFAULT: color('primary'), foreground: color('primary-foreground') },
        secondary: { DEFAULT: color('secondary'), foreground: color('secondary-foreground') },
        muted: { DEFAULT: color('muted'), foreground: color('muted-foreground') },
        accent: { DEFAULT: color('accent'), foreground: color('accent-foreground') },
        destructive: { DEFAULT: color('destructive'), foreground: color('destructive-foreground') },
        success: color('success'),
        warning: color('warning'),
        info: color('info'),
        chart: {
          1: color('chart-1'), 2: color('chart-2'), 3: color('chart-3'), 4: color('chart-4'), 5: color('chart-5'),
        },
        viewport: color('viewport'),
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        xs: ['12px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
      },
      keyframes: {
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
      },
      animation: { 'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite' },
    },
  },
  plugins: [
    animate,
    plugin(({ addBase }) => {
      addBase({
        ':root': { ...vars('light'), '--radius': '0.5rem' },
        '.dark': vars('dark'),
      });
    }),
  ],
} satisfies Config;
