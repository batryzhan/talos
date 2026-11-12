import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { DataTable, Num } from '@/components/data-table';
import { useT, type MessageKey, type Translate } from '@/i18n';
import { cn, fmt } from '@/lib/utils';
import type { WorkflowRow, WorkflowSnapshot } from '@/missions/workflow/types';

const LOW_BATTERY = 0.25;

/** Badge tone of a module FSM label. */
export function taskTone(r: Pick<WorkflowRow, 'task' | 'hold' | 'active'>): BadgeTone {
  if (r.hold) return 'destructive';
  if (!r.active || r.task.includes('CHARG')) return 'info';
  if (/WAIT|QUEUE|BROKEN|NO_|FULL|EXIT|COLLAPSE/.test(r.task)) return 'warning';
  if (/CUTTING|WELDING|REPAIR|DIAGNOS|SUPPRESS|CLEARING|MINING|SCAN|RELAY_ACTIVE|LOADING|DUMPING|REFILL|SYNC|THERMAL|ILLUMIN/.test(r.task)) return 'success';
  if (r.task === 'IDLE' || r.task === 'READY') return 'neutral';
  return 'primary';
}

export function moduleLabel(t: Translate, cap: WorkflowRow['module']): string {
  return t(`wf.module.${cap}` as MessageKey);
}

/** Columns: robot, module, task / auction J_ij, progress, mission column, t̂ of the edge, battery, epoch. */
export function workflowColumns(t: Translate, kind: WorkflowSnapshot['kind']): ColumnDef<WorkflowRow>[] {
  const extra: ColumnDef<WorkflowRow>[] = kind === 'wildfire'
    ? [{ id: 'load', header: t('col.water'), accessorFn: r => r.load ?? undefined, sortUndefined: 'last', cell: ({ row }) => row.original.load === undefined ? <span className="text-muted-foreground">—</span> : <Num value={fmt(row.original.load, 0)} />, meta: { align: 'right', unit: t('unit.L') } }]
    : kind === 'mining'
      ? [
        { id: 'load', header: t('col.ore'), accessorFn: r => r.load ?? undefined, sortUndefined: 'last', cell: ({ row }) => row.original.load === undefined ? <span className="text-muted-foreground">—</span> : <span className="inline-flex gap-1.5"><Num value={fmt(row.original.load, 0)} /><span className="num text-muted-foreground">{fmt((row.original.loadPct ?? 0) * 100, 0)}%</span></span>, meta: { align: 'right', unit: t('unit.kg') } },
        { id: 'lidar', header: t('col.lidar'), accessorFn: r => r.lidar ?? '', cell: ({ row }) => <span className="font-mono text-2xs text-muted-foreground">{row.original.lidar ?? '—'}</span> },
      ]
      : [];
  return [
    { id: 'id', header: t('col.id'), accessorFn: r => r.id, cell: ({ row }) => <Num value={String(row.original.id).padStart(2, '0')} className="text-muted-foreground" />, meta: { className: 'w-10' } },
    { id: 'name', header: t('col.robot'), accessorFn: r => r.name, cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.name}</span> },
    { id: 'module', header: t('col.module'), accessorFn: r => r.module, cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{moduleLabel(t, row.original.module)}</span> },
    {
      id: 'task', header: t('col.task'), accessorFn: r => r.task,
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <Badge tone={taskTone(row.original)} className="font-mono">{row.original.task}</Badge>
          {row.original.target && <span className="max-w-44 truncate text-xs text-muted-foreground">{row.original.target}</span>}
          {row.original.bid !== null && <span className="num whitespace-nowrap text-2xs text-muted-foreground">J={fmt(row.original.bid, 1)}</span>}
        </span>
      ),
      meta: { hint: t('col.bid.hint') },
    },
    {
      id: 'progress', header: t('col.progress'), accessorFn: r => r.progress,
      cell: ({ row }) => (
        <span className="inline-flex items-center justify-end gap-2">
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(row.original.progress * 100)}%` }} /></span>
          <Num value={fmt(row.original.progress * 100, 0)} />
        </span>
      ),
      meta: { align: 'right', unit: '%', hint: t('col.progress.hint') },
    },
    ...extra,
    { id: 'edge', header: t('col.edge'), accessorFn: r => r.edgeEstimate, cell: ({ row }) => <Num value={row.original.edgeEstimate > 0 ? fmt(row.original.edgeEstimate, 1) : '—'} className="text-muted-foreground" />, meta: { align: 'right', unit: t('unit.s'), hint: t('col.edge.hint') } },
    {
      id: 'battery', header: t('col.battery'), accessorFn: r => r.battery,
      cell: ({ row }) => { const low = row.original.battery < LOW_BATTERY; return <Num value={fmt(row.original.battery * 100, 1)} className={cn(low ? 'text-warning' : 'text-foreground')} />; },
      meta: { align: 'right', unit: '%', hint: t('col.battery.hint') },
    },
    { id: 'epoch', header: t('col.epoch'), accessorFn: r => r.epoch, cell: ({ row }) => <Num value={String(row.original.epoch)} className="text-muted-foreground" />, meta: { align: 'right', hint: t('col.epoch.hint'), className: 'w-16' } },
  ];
}

/** Heterogeneous fleet telemetry for the workflow missions. */
export function WorkflowTable({ snapshot, selectedId, onSelect }: { snapshot: WorkflowSnapshot; selectedId: number | null; onSelect: (id: number) => void }): JSX.Element {
  const t = useT();
  const columns = useMemo(() => workflowColumns(t, snapshot.kind), [t, snapshot.kind]);
  return (
    <DataTable
      data={snapshot.rows}
      columns={columns}
      getRowId={r => String(r.id)}
      selectedId={selectedId === null ? null : String(selectedId)}
      onRowClick={r => onSelect(r.id)}
      rowLabel={r => r.name}
      sortLabel={col => t('telemetry.sortBy', { col })}
      caption={t('telemetry.title')}
      empty={t('telemetry.empty')}
    />
  );
}
