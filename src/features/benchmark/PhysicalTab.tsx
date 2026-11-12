import { useId, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, Loader2, Play, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, Num } from '@/components/data-table';
import { useT } from '@/i18n';
import { fmt } from '@/lib/utils';
import { parseSeed } from '@/features/controls/seed';
import { useBenchStore } from './benchStore';
import type { PhysicalResult } from './physical';
import { EmptyState } from './EmptyState';

/** Paired physical comparison of controllers A / B / C on one seed. */
export function PhysicalTab(): JSX.Element {
  const t = useT();
  const seedId = useId();
  const results = useBenchStore(s => s.physical);
  const running = useBenchStore(s => s.running);
  const seed = useBenchStore(s => s.physicalSeed);
  const [draft, setDraft] = useState(String(seed));
  const parsed = parseSeed(draft);

  const columns = useMemo<ColumnDef<PhysicalResult>[]>(() => [
    { id: 'controller', header: t('bench.col.controller'), accessorFn: r => r.controller, cell: ({ row }) => t(`experiment.controller.${row.original.controller}`) },
    { id: 'eh', header: t('bench.col.eh'), accessorFn: r => r.E_h ?? undefined, cell: ({ row }) => <Num value={fmt(row.original.E_h === null ? null : row.original.E_h * 1000, 2)} />, meta: { align: 'right', unit: t('unit.mm') } },
    { id: 'etraj', header: t('bench.col.etraj'), accessorFn: r => r.E_traj ?? undefined, cell: ({ row }) => <Num value={fmt(row.original.E_traj === null ? null : row.original.E_traj * 1000, 1)} />, meta: { align: 'right', unit: t('unit.mm') } },
    {
      id: 'safe', header: t('bench.col.safeHold'), accessorFn: r => Number(r.safeHold),
      cell: ({ row }) => row.original.safeHold
        ? <Badge tone="success"><Check className="size-3" aria-hidden />{t('common.yes')}</Badge>
        : <Badge tone="destructive"><X className="size-3" aria-hidden />{t('common.no')}</Badge>,
      meta: { align: 'right' },
    },
  ], [t]);
  const chart = (results ?? []).map(r => ({ controller: r.controller, eh: (r.E_h ?? 0) * 1000 }));

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader><CardTitle>{t('bench.physical.title')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <CardDescription>{t('bench.physical.hint')}</CardDescription>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (parsed.ok) { useBenchStore.getState().setPhysicalSeed(parsed.value); void useBenchStore.getState().runPhysical(); } }}>
            <div className="space-y-1.5">
              <Label htmlFor={seedId} className="caption">{t('controls.seed')}</Label>
              <Input id={seedId} inputMode="numeric" className="num" value={draft} onChange={e => setDraft(e.target.value)} aria-invalid={!parsed.ok} />
            </div>
            <Button type="submit" className="w-full" disabled={!parsed.ok || running !== null}>
              {running === 'physical' ? <Loader2 className="animate-spin" /> : <Play />}
              {t('bench.compare')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {results ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden">
            <DataTable data={results} columns={columns} getRowId={r => r.controller} sortLabel={col => t('telemetry.sortBy', { col })} caption={t('bench.physical.title')} />
          </Card>
          <Card>
            <CardHeader><CardTitle>E_h <span className="text-xs font-normal text-muted-foreground">{t('unit.mm')}</span></CardTitle></CardHeader>
            <CardContent>
              <div className="h-40">
                <ResponsiveContainer>
                  <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap="30%">
                    <CartesianGrid stroke="oklch(var(--muted-foreground) / 0.14)" vertical={false} />
                    <XAxis dataKey="controller" tick={{ fill: 'oklch(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'oklch(var(--muted-foreground) / 0.3)' }} />
                    <YAxis tick={{ fill: 'oklch(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'oklch(var(--foreground) / 0.06)' }} isAnimationActive={false} formatter={(v: number) => [`${v.toFixed(2)} ${t('unit.mm')}`, 'E_h']} contentStyle={{ background: 'oklch(var(--popover))', border: '1px solid oklch(var(--border))', borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="eh" fill="oklch(var(--chart-1))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <EmptyState title={t('bench.physical.empty')} hint={t('bench.physical.emptyHint')} />
      )}
    </div>
  );
}
