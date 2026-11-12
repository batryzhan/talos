/**
 * Design tokens — the single source of truth for colour.
 *
 * Values are OKLCH triplets "L C H" (optionally "L C H / alpha"). Tailwind (tailwind.config.ts)
 * turns them into CSS custom properties per theme; the 3D viewport converts the same triplets to
 * linear-sRGB `THREE.Color`s via `oklchToLinearSrgb`, so the overlay and the panels never drift.
 *
 * This module must stay dependency-free: it is imported by the Tailwind config under Node.
 */

export type ThemeName = 'dark' | 'light';

export const TOKEN_NAMES = [
  'background', 'foreground',
  'panel', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
  'muted', 'muted-foreground', 'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'success', 'warning', 'info',
  'border', 'input', 'ring',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'viewport', 'viewport-grid',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];

export const THEMES: Readonly<Record<ThemeName, Readonly<Record<TokenName, string>>>> = {
  dark: {
    background: '0.145 0.002 286',            // #0a0a0b
    foreground: '0.947 0.003 286',
    panel: '0.183 0.004 286',                 // #121214
    card: '0.206 0.006 286',                  // #17171a
    'card-foreground': '0.947 0.003 286',
    popover: '0.225 0.007 286',
    'popover-foreground': '0.947 0.003 286',
    primary: '0.585 0.204 277',               // indigo-500
    'primary-foreground': '0.985 0 0',
    secondary: '0.241 0.008 286',
    'secondary-foreground': '0.947 0.003 286',
    muted: '0.241 0.008 286',
    'muted-foreground': '0.660 0.013 286',
    accent: '0.270 0.010 286',
    'accent-foreground': '0.970 0.002 286',
    destructive: '0.637 0.208 25.3',          // red-500
    'destructive-foreground': '0.985 0 0',
    success: '0.696 0.149 162.5',             // emerald-500
    warning: '0.769 0.165 70.1',              // amber-500
    info: '0.754 0.139 232.7',                // sky-400
    border: '1 0 0 / 0.08',
    input: '1 0 0 / 0.12',
    ring: '0.680 0.158 277',
    // Categorical chart slots: validated (dataviz validate_palette, dark surface #17171a) —
    // inside the L 0.48–0.67 band, adjacent normal-vision ΔE ≥ 23. Slot 4 is drawn dashed.
    'chart-1': '0.650 0.170 277',             // indigo
    'chart-2': '0.665 0.150 65',              // amber
    'chart-3': '0.665 0.120 182',             // teal
    'chart-4': '0.640 0.190 12',              // rose
    'chart-5': '0.640 0.170 293.5',           // violet
    viewport: '0.235 0.006 260',
    'viewport-grid': '0.330 0.008 260',
  },
  light: {
    background: '0.985 0 0',
    foreground: '0.210 0.006 286',
    panel: '0.975 0.001 286',
    card: '1 0 0',
    'card-foreground': '0.210 0.006 286',
    popover: '1 0 0',
    'popover-foreground': '0.210 0.006 286',
    primary: '0.511 0.230 277',               // indigo-600
    'primary-foreground': '0.985 0 0',
    secondary: '0.955 0.002 286',
    'secondary-foreground': '0.210 0.006 286',
    muted: '0.955 0.002 286',
    'muted-foreground': '0.520 0.014 286',
    accent: '0.935 0.004 286',
    'accent-foreground': '0.210 0.006 286',
    destructive: '0.577 0.215 27.3',          // red-600
    'destructive-foreground': '0.985 0 0',
    success: '0.596 0.127 163.2',             // emerald-600
    warning: '0.666 0.157 58.3',              // amber-600
    info: '0.588 0.139 242',                  // sky-600
    border: '0 0 0 / 0.09',
    input: '0 0 0 / 0.15',
    ring: '0.511 0.230 277',
    'chart-1': '0.511 0.230 277',
    'chart-2': '0.666 0.157 58.3',
    'chart-3': '0.600 0.118 184.7',
    'chart-4': '0.586 0.222 17.6',
    'chart-5': '0.541 0.247 293',
    viewport: '0.880 0.004 260',
    'viewport-grid': '0.780 0.006 260',
  },
};

/** Parse "L C H" / "L C H / a" into numbers (alpha defaults to 1). */
export function parseOklch(triplet: string): { l: number; c: number; h: number; alpha: number } {
  const [lch, a] = triplet.split('/');
  const [l, c, h] = lch.trim().split(/\s+/).map(Number);
  return { l, c, h, alpha: a === undefined ? 1 : Number(a) };
}

/**
 * OKLCH → linear sRGB (Björn Ottosson's OKLab matrices), clamped to the gamut.
 * Writes into `out` so callers on hot paths do not allocate.
 */
export function oklchToLinearSrgb(l: number, c: number, hDeg: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h), b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const L = l_ * l_ * l_, M = m_ * m_ * m_, S = s_ * s_ * s_;
  out[0] = clamp01(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S);
  out[1] = clamp01(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S);
  out[2] = clamp01(-0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S);
  return out;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Linear-sRGB triple for a theme token (for THREE.Color#setRGB with LinearSRGBColorSpace). */
export function tokenLinearRgb(theme: ThemeName, name: TokenName): [number, number, number] {
  const { l, c, h } = parseOklch(THEMES[theme][name]);
  return oklchToLinearSrgb(l, c, h);
}
