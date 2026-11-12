import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { Loader2, Play, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DataTable, Num } from '@/components/data-table';
import { useT, type MessageKey } from '@/i18n';
import { Kpi } from '@/features/workflow/common';
import { LEARNING_RUNS, S1_SCENARIOS, gainHistogram, type S1MapSummary } from '@/core/routing/s1Experiment';
import { useBenchStore } from './benchStore';
import { EmptyState } from './EmptyState';
import { SERIES_COLORS } from './format';

const AXIS = { fill: 'oklch(var(--muted-foreground))', fontSize: 11 } as const;
const pct1 = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** Experiment S1: 150 edge-closure scenarios with learned edge times (equation 6). */
export function S1Lab(): JSX.Element {
  const t = useT();
  const s1 = useBenchStore(s => s.s1);
  const running = useBenchStore(s => s.running);
  const progress = useBenchStore(s => s.s1Progress);

  const curve = useMemo(() => s1?.learningCurve.map((e, m) => ({ m, e: e * 100 })) ?? [], [s1]);
  const bins = useMemo(() => (s1 ? gainHistogram(s1.scenarios) : []), [s1]);
  const columns = useMemo<ColumnDef<S1MapSummary>[]>(() => [
    { id: 'map', header: t('bench.s1.col.map'), accessorFn: r => r.map, cell: ({ row }) => t(`bench.s1.map.${row.original.map}` as MessageKey) },
    { id: 'cases', header: t('bench.s1.col.cases'), accessorFn: r => r.cases, cell: ({ row }) => <Num value={String(row.original.cases)} />, meta: { align: 'right' } },
    { id: 'orig', header: t('bench.s1.col.original'), accessorFn: r => r.originalPassable, cell: ({ row }) => <Num value={`${row.original.originalPassable} · ${pct1(row.original.originalPassable / row.original.cases)}`} />, meta: { align: 'right' } },
    { id: 'repl', header: t('bench.s1.col.replanned'), accessorFn: r => r.reachable, cell: ({ row }) => <Num value={`${row.original.reachable} · ${pct1(row.original.reachable / row.original.cases)}`} />, meta: { align: 'right' } },
    { id: 'static', header: t('bench.s1.col.static'), accessorFn: r => r.meanStatic, cell: ({ row }) => <Num value={row.original.meanStatic.toFixed(1)} />, meta: { align: 'right', unit: t('unit.s') } },
    { id: 'learned', header: t('bench.s1.col.learned'), accessorFn: r => r.meanLearned, cell: ({ row }) => <Num value={row.original.meanLearned.toFixed(1)} />, meta: { align: 'right', unit: t('unit.s') } },
    { id: 'gain', header: t('bench.s1.col.gain'), accessorFn: r => r.meanGain, cell: ({ row }) => <Num value={pct1(row.original.meanGain)} className={row.original.meanGain > 0 ? 'text-success' : undefined} />, meta: { align: 'right' } },
  ], [t]);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader><CardTitle><Route aria-hidden />{t('bench.s1.title')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">{t('bench.s1.hint')}</p>
          <p className="text-xs leading-5 text-muted-foreground">{t('bench.s1.baseline')}</p>
          <Button className="w-full" disabled={running !== null} onClick={() => void useBenchStore.getState().runS1()}>
            {running === 's1' ? <Loader2 className="animate-spin" /> : <Play />}
            {t('bench.s1.run')}
          </Button>
          <p className="text-2xs text-muted-foreground">{t('bench.s1.runHint')}</p>
          {progress && (
            <div className="space-y-1.5" aria-live="polite">
              <Progress value={(progress.done / progress.total) * 100} aria-label={t('bench.s1.progress', { done: progress.done, total: progress.total })} />
              <p className="num text-2xs text-muted-foreground">{t('bench.s1.progress', { done: progress.done, total: progress.total })}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {!s1 ? <EmptyState title={t('bench.s1.empty')} hint={t('bench.s1.emptyHint')} /> : (
        <div className="min-w-0 space-y-4">
          <dl className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Kpi label={t('bench.s1.original')} value={`${s1.originalPassable} / ${s1.total}`} sub={pct1(s1.originalPassable / s1.total)} />
            <Kpi label={t('bench.s1.replanned')} value={`${s1.reachable} / ${s1.total}`} tone="success" sub={pct1(s1.reachable / s1.total)} />
            <Kpi label={t('bench.s1.gain')} value={pct1(s1.meanGain)} tone={s1.meanGain > 0 ? 'success' : undefined} sub={t('bench.s1.gain.sub', { static: s1.meanStatic.toFixed(1), learned: s1.meanLearned.toFixed(1) })} />
            <Kpi label={t('bench.s1.estError')} value={pct1(s1.learningCurve[LEARNING_RUNS])} tone="info" sub={t('bench.s1.estError.sub', { before: pct1(s1.learningCurve[0]), after: pct1(s1.learningCurve[LEARNING_RUNS]) })} />
          </dl>
          <p className="text-2xs text-muted-foreground">
            {t('bench.s1.faster')}: <span className="num text-foreground">{s1.faster}</span> · = <span className="num text-foreground">{s1.equal}</span> · ▲ <span className="num text-foreground">{s1.slower}</span>
            {' · '}{t('bench.s1.unreachable')}: <span className="num text-foreground">{S1_SCENARIOS - s1.reachable}</span>
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader className="flex-wrap"><CardTitle>{t('bench.s1.curve')}</CardTitle><CardDescription className="w-full text-xs">{t('bench.s1.curve.hint')}</CardDescription></CardHeader>
              <CardContent>
                <div className="h-56 w-full">
                  <ResponsiveContainer>
                    <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
                      <CartesianGrid stroke="oklch(var(--muted-foreground) / 0.14)" vertical={false} />
                      <XAxis dataKey="m" type="number" domain={[0, LEARNING_RUNS]} tickCount={LEARNING_RUNS + 1} tick={AXIS} tickLine={false} axisLine={{ stroke: 'oklch(var(--muted-foreground) / 0.3)' }}
                        label={{ value: t('bench.s1.runs'), position: 'insideBottom', offset: -10, fill: 'oklch(var(--muted-foreground))', fontSize: 11 }} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
                      <Tooltip content={<CurveTooltip />} cursor={{ stroke: 'oklch(var(--muted-foreground) / 0.4)' }} isAnimationActive={false} />
                      <Line dataKey="e" stroke={SERIES_COLORS[0]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'oklch(var(--card))' }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader className="flex-wrap"><CardTitle>{t('bench.s1.hist')}</CardTitle><CardDescription className="w-full text-xs">{t('bench.s1.hist.hint', { equal: s1.equal })}</CardDescription></CardHeader>
              <CardContent>
                <div className="h-56 w-full">
                  <ResponsiveContainer>
                    <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 18, left: -14 }} barCategoryGap={2}>
                      <CartesianGrid stroke="oklch(var(--muted-foreground) / 0.14)" vertical={false} />
                      <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: 'oklch(var(--muted-foreground) / 0.3)' }} interval="preserveStartEnd"
                        label={{ value: '%', position: 'insideBottomRight', offset: -10, fill: 'oklch(var(--muted-foreground))', fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                      <ReferenceLine x="0" stroke="oklch(var(--muted-foreground) / 0.5)" strokeDasharray="3 3" />
                      <Tooltip content={<BinTooltip />} cursor={{ fill: 'oklch(var(--foreground) / 0.06)' }} isAnimationActive={false} />
                      <Bar dataKey="count" fill={SERIES_COLORS[1]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader><CardTitle>{t('bench.s1.maps')}</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <DataTable data={s1.maps} columns={columns} getRowId={r => r.map} sortLabel={col => t('telemetry.sortBy', { col })} caption={t('bench.s1.maps')} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function CurveTooltip({ active, payload }: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { m: number; e: number };
  return <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md">m = <span className="num">{p.m}</span> · |t̂ − t|/t = <span className="num">{p.e.toFixed(1)}%</span></div>;
}

function BinTooltip({ active, payload }: TooltipProps<number, string>): JSX.Element | null {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload as { from: number; to: number; count: number };
  return <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md"><span className="num">{Math.round(b.from * 100)}…{Math.round(b.to * 100)}%</span> · <span className="num">{b.count}</span></div>;
}
