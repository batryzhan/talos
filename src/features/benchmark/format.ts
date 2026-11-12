const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** 10ⁿ label for an integer log₁₀ tick. */
export function powerOfTen(exp: number): string {
  return `10${String(Math.round(exp)).replace(/[-\d]/g, c => SUP[c] ?? c)}`;
}

/** Compact scientific value: 3.2·10⁻³. */
export function sci(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -1 && e <= 2) return v.toFixed(Math.max(0, digits - e));
  return `${(v / 10 ** e).toFixed(digits - 1)}·${powerOfTen(e)}`;
}

export const pct = (p: number): string => `${Math.round(p * 100)}%`;

/** Categorical chart slot per series (fixed order: p = 0, 10, 30 %, then the custom run). */
export const SERIES_COLORS = ['oklch(var(--chart-1))', 'oklch(var(--chart-2))', 'oklch(var(--chart-3))', 'oklch(var(--chart-4))'] as const;
