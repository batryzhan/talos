import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { useT } from '@/i18n';
import { STEPS, THRESHOLD, type M0Row } from './m0Series';
import { SERIES_COLORS, pct, powerOfTen, sci } from './format';

export interface ChartSeries { row: M0Row; label: string; color: string; dashed: boolean }

/** The series on the chart for one N: p = 0 / 10 / 30 % from the 900-run block, plus a matching custom run. */
export function chartSeries(rows: readonly M0Row[], custom: readonly M0Row[], n: number, customLabel: string): ChartSeries[] {
  const base = rows.filter(r => r.series === '900' && r.n === n).sort((a, b) => a.p - b.p)
    .map((row, i) => ({ row, label: `p = ${pct(row.p)}`, color: SERIES_COLORS[i], dashed: false }));
  const extra = custom.find(r => r.n === n);
  return extra ? [...base, { row: extra, label: `${customLabel}: p = ${pct(extra.p)}, ε = ${extra.eps}`, color: SERIES_COLORS[3], dashed: true }] : base;
}

const LOG_FLOOR = -8;
type Point = { k: number } & Record<string, number>;

/**
 * Mean log₁₀ D(k) per series with the D = 0.01 threshold. A dot on the threshold line marks each
 * series' mean K from the results table, so the chart and the table can be read against each other.
 */
export function M0Chart({ series }: { series: ChartSeries[] }): JSX.Element {
  const t = useT();
  const data = useMemo<Point[]>(() => Array.from({ length: STEPS + 1 }, (_, k) => {
    const p: Point = { k } as Point;
    series.forEach((s, i) => { p[`s${i}`] = Math.max(LOG_FLOOR, Math.log10(Math.max(s.row.curve[k], 1e-12))); });
    return p;
  }), [series]);
  const yMin = Math.min(-3, Math.floor(Math.min(...data.flatMap(p => series.map((_, i) => p[`s${i}`])))));
  const ticks = Array.from({ length: -yMin + 1 }, (_, i) => -i).filter(v => v >= yMin);

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="legend">
        {series.map(s => (
          <li key={s.row.key} className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={s.dashed ? '4 3' : undefined} /></svg>
            <span>{s.label}</span>
            <span className="text-muted-foreground">K̄ <span className="num text-foreground">{Number.isFinite(s.row.mean) ? s.row.mean.toFixed(1) : '—'}</span></span>
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-muted-foreground">
          <svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" /></svg>
          {t('bench.threshold')}
        </li>
      </ul>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 18, left: 4 }}>
            <CartesianGrid stroke="oklch(var(--muted-foreground) / 0.14)" vertical={false} />
            <XAxis
              dataKey="k" type="number" domain={[0, STEPS]} ticks={[0, 20, 40, 60, 80, 100]}
              tick={{ fill: 'oklch(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'oklch(var(--muted-foreground) / 0.3)' }}
              label={{ value: t('bench.iteration'), position: 'insideBottom', offset: -10, fill: 'oklch(var(--muted-foreground))', fontSize: 11 }}
            />
            <YAxis
              type="number" domain={[yMin, 0]} ticks={ticks} width={40}
              tickFormatter={powerOfTen} tick={{ fill: 'oklch(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false}
            />
            <ReferenceLine y={Math.log10(THRESHOLD)} stroke="oklch(var(--foreground) / 0.55)" strokeDasharray="3 3" />
            <Tooltip content={<ChartTooltip series={series} />} cursor={{ stroke: 'oklch(var(--foreground) / 0.3)', strokeWidth: 1 }} isAnimationActive={false} />
            {series.map((s, i) => (
              <Line
                key={s.row.key} dataKey={`s${i}`} type="monotone" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={false} activeDot={{ r: 4, stroke: 'oklch(var(--card))', strokeWidth: 2 }} isAnimationActive={false} name={s.label}
              />
            ))}
            {series.map(s => Number.isFinite(s.row.mean) && (
              <ReferenceDot key={`k-${s.row.key}`} x={s.row.mean} y={Math.log10(THRESHOLD)} r={4.5} fill={s.color} stroke="oklch(var(--card))" strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, series }: TooltipProps<number, string> & { series: ChartSeries[] }): JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">k = <span className="num text-foreground">{label}</span></p>
      <ul className="space-y-0.5">
        {series.map((s, i) => {
          const d = s.row.curve[Number(label)];
          return (
            <li key={s.row.key} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="flex-1">{s.label}</span>
              <span className="num">D = {sci(d)}</span>
              <span className="num w-10 text-right text-muted-foreground">{payload.find(p => p.dataKey === `s${i}`)?.value?.toFixed(2)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
