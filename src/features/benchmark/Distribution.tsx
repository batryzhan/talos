import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { useT } from '@/i18n';
import { histogram, type M0Row } from './m0Series';

/** Histogram of K over the 100 runs of the selected configuration; non-converged runs counted aside. */
export function Distribution({ row, color }: { row: M0Row; color: string }): JSX.Element {
  const t = useT();
  const bins = useMemo(() => histogram(row.ks), [row]);
  return (
    <div className="space-y-2">
      <div className="h-44 w-full">
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap={2}>
            <CartesianGrid stroke="oklch(var(--muted-foreground) / 0.14)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'oklch(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'oklch(var(--muted-foreground) / 0.3)' }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fill: 'oklch(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip content={<BinTooltip />} cursor={{ fill: 'oklch(var(--foreground) / 0.06)' }} isAnimationActive={false} />
            <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-2xs text-muted-foreground">
        K: {t('bench.iteration')} · <span className="num text-foreground">{row.runs - row.failed}</span> / {row.runs} {t('bench.runs')}
        {row.failed > 0 && <> · <span className="num text-warning">{row.failed}</span> {t('bench.notConverged')}</>}
      </p>
    </div>
  );
}

function BinTooltip({ active, payload }: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload?.length) return null;
  const bin = payload[0].payload as { label: string; count: number };
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
      K = <span className="num">{bin.label}</span> · <span className="num">{bin.count}</span>
    </div>
  );
}
