import { cn } from '@/lib/utils';

/**
 * Inline trend line for table cells. Plain SVG on purpose: twenty of these update at 4 Hz, which
 * a full chart library per cell would turn into the most expensive part of the table.
 */
export function Sparkline({ values, min, max, className, width = 48, height = 14 }: {
  values: readonly number[];
  min?: number;
  max?: number;
  className?: string;
  width?: number;
  height?: number;
}): JSX.Element | null {
  if (values.length < 2) return <span className={cn('inline-block', className)} style={{ width, height }} aria-hidden />;
  let lo = min ?? Infinity, hi = max ?? -Infinity;
  if (min === undefined || max === undefined) for (const v of values) { if (min === undefined) lo = Math.min(lo, v); if (max === undefined) hi = Math.max(hi, v); }
  const span = hi - lo || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 1 - ((v - lo) / span) * (height - 2)).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn('inline-block overflow-visible align-middle', className)} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      <circle cx={width} cy={height - 1 - ((last - lo) / span) * (height - 2)} r={1.6} fill="currentColor" />
    </svg>
  );
}
