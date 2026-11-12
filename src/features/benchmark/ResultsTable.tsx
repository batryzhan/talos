import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable, Num } from '@/components/data-table';
import { useT } from '@/i18n';
import type { M0Row, PairedDelta } from './m0Series';
import { pct } from './format';

/**
 * 13 configurations (+ custom runs): N / p / ε, mean K ± SD, 95 % interval, non-converged count.
 * Rows below 100 % convergence get an amber badge; rows on the chart show their line colour.
 */
export function ResultsTable({ rows, colorOf, selectedKey, onSelect }: {
  rows: M0Row[];
  colorOf: (key: string) => string | undefined;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}): JSX.Element {
  const t = useT();
  const columns = useMemo<ColumnDef<M0Row>[]>(() => [
    {
      id: 'config', header: t('bench.col.config'), accessorFn: r => r.n * 1000 + r.p * 100 + r.eps,
      cell: ({ row: { original: r } }) => {
        const color = colorOf(r.key);
        return (
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: color ?? 'transparent', boxShadow: color ? undefined : 'inset 0 0 0 1px oklch(var(--muted-foreground) / 0.4)' }} aria-hidden />
            <Num value={`${r.n} / ${pct(r.p)} / ${r.eps}`} />
            {r.series === 'custom' ? <Badge tone="primary">{t('bench.custom')}</Badge> : <span className="text-2xs text-muted-foreground">{t('bench.series', { id: r.series })}</span>}
          </span>
        );
      },
    },
    {
      id: 'mean', header: t('bench.col.mean'), accessorFn: r => (Number.isFinite(r.mean) ? r.mean : undefined), sortUndefined: 'last',
      cell: ({ row: { original: r } }) => <Num value={`${r.mean.toFixed(1)} ± ${r.sd.toFixed(1)}`} />,
      meta: { align: 'right' },
    },
    {
      id: 'ci', header: t('bench.col.ci'), accessorFn: r => (Number.isFinite(r.ci) ? r.ci : undefined), sortUndefined: 'last',
      cell: ({ row: { original: r } }) => Number.isFinite(r.ci)
        ? <Num value={`${(r.mean - r.ci).toFixed(1)} … ${(r.mean + r.ci).toFixed(1)}`} />
        : <span className="text-muted-foreground">—</span>,
      meta: { align: 'right' },
    },
    {
      id: 'failed', header: t('bench.col.failed'), accessorFn: r => r.failed,
      cell: ({ row: { original: r } }) => r.failed > 0
        ? <span className="inline-flex items-center gap-2"><Badge tone="warning">{t('bench.convergence', { pct: Math.round(((r.runs - r.failed) / r.runs) * 100) })}</Badge><Num value={String(r.failed)} /></span>
        : <Num value="0" className="text-muted-foreground" />,
      meta: { align: 'right' },
    },
  ], [t, colorOf]);

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={r => r.key}
      selectedId={selectedKey}
      onRowClick={r => onSelect(r.key)}
      rowLabel={r => `N ${r.n}, p ${pct(r.p)}, ε ${r.eps}`}
      sortLabel={col => t('telemetry.sortBy', { col })}
      caption={t('bench.results')}
      rowClassName={r => (r.failed > 0 ? 'bg-warning/[0.04]' : undefined)}
    />
  );
}

/** Paired ΔK with bootstrap intervals as one compact line of prose. */
export function PairedSummary({ paired }: { paired: PairedDelta[] }): JSX.Element | null {
  const t = useT();
  if (!paired.length) return null;
  return (
    <p className="text-xs leading-5 text-muted-foreground">
      <span className="mr-1.5 text-foreground">{t('bench.paired')}:</span>
      {paired.map((d, i) => (
        <span key={d.n} className="whitespace-nowrap">
          {i > 0 && <span className="mx-1.5">·</span>}
          N = {d.n}: ΔK = <span className="num text-foreground">{d.mean >= 0 ? '+' : ''}{d.mean.toFixed(2)}</span>{' '}
          <span className="num">[{d.lo.toFixed(2)}; {d.hi.toFixed(2)}]</span>
        </span>
      ))}
    </p>
  );
}
