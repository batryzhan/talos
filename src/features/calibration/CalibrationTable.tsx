import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, Num } from '@/components/data-table';
import { useT, type Translate } from '@/i18n';
import { cn } from '@/lib/utils';
import { EQ1_ROWS } from '@/core/calibration/chassisKinematics';
import type { WheelTelemetry } from '@/core/calibration/snapshot';

const ARROWS: Record<string, string> = { '1,1': '↗', '1,-1': '↖', '-1,1': '↙', '-1,-1': '↘' };

function columns(t: Translate): ColumnDef<WheelTelemetry>[] {
  return [
    { id: 'wheel', header: t('cal.col.wheel'), accessorFn: r => r.id, cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.id}</span>, meta: { className: 'w-16' } },
    {
      id: 'raw', header: t('cal.col.raw'), accessorFn: r => r.raw,
      cell: ({ row }) => <Num value={row.original.raw.toFixed(2)} className="text-muted-foreground" />,
      meta: { align: 'right', unit: t('unit.radps') },
    },
    {
      id: 'scaled', header: t('cal.col.scaled'), accessorFn: r => r.scaled,
      cell: ({ row }) => <Num value={row.original.scaled.toFixed(2)} className={Math.abs(row.original.scaled - row.original.raw) > 1e-3 ? 'text-warning' : undefined} />,
      meta: { align: 'right', unit: t('unit.radps') },
    },
    {
      id: 'actual', header: t('cal.col.actual'), accessorFn: r => r.actual,
      cell: ({ row }) => <Num value={row.original.actual.toFixed(2)} />,
      meta: { align: 'right', unit: t('unit.radps') },
    },
    { id: 'rpm', header: t('cal.col.rpm'), accessorFn: r => r.rpm, cell: ({ row }) => <Num value={row.original.rpm.toFixed(0)} />, meta: { align: 'right' } },
    { id: 'rim', header: t('cal.col.rim'), accessorFn: r => r.rim, cell: ({ row }) => <Num value={row.original.rim.toFixed(3)} />, meta: { align: 'right', unit: t('unit.mps') } },
    {
      id: 'load', header: t('cal.col.load'), accessorFn: r => r.load,
      cell: ({ row }) => {
        const l = row.original.load;
        return (
          <span className="inline-flex items-center justify-end gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className={cn('block h-full rounded-full', l > 0.98 ? 'bg-destructive' : l > 0.8 ? 'bg-warning' : 'bg-info')} style={{ width: `${Math.round(l * 100)}%` }} />
            </span>
            <Num value={(l * 100).toFixed(0)} />
          </span>
        );
      },
      meta: { align: 'right', unit: '%' },
    },
    {
      id: 'traction', header: t('cal.col.traction'), accessorFn: r => r.actual,
      cell: ({ row }) => {
        const i = ['FL', 'FR', 'RL', 'RR'].indexOf(row.original.id), w = row.original.actual;
        if (Math.abs(w) < 0.05) return <span className="text-muted-foreground">{t('cal.idle')}</span>;
        const sgn = Math.sign(w);
        return <span className="text-xs"><span className="mr-1 font-mono text-success">{ARROWS[`${sgn},${sgn * -EQ1_ROWS[i][0]}`]}</span>{t(w > 0 ? 'cal.forward' : 'cal.reverse')}</span>;
      },
    },
  ];
}

/** Bottom dock of /calibration: one row per wheel (equations 1 and 2, actual rate, load, thrust). */
export function CalibrationTable({ wheels }: { wheels: WheelTelemetry[] }): JSX.Element {
  const t = useT();
  const cols = useMemo(() => columns(t), [t]);
  return (
    <DataTable
      data={wheels}
      columns={cols}
      getRowId={r => r.id}
      sortLabel={col => t('telemetry.sortBy', { col })}
      caption={t('cal.dock')}
    />
  );
}
