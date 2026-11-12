import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable, Num } from '@/components/data-table';
import { Sparkline } from '@/components/sparkline';
import { useT, type Translate } from '@/i18n';
import { cn, fmt } from '@/lib/utils';
import { rhoTone, stateTone, type FleetRow } from './rows';

const TONE_TEXT = { success: 'text-success', warning: 'text-warning', destructive: 'text-destructive', neutral: 'text-muted-foreground' } as const;
const LOW_BATTERY = 0.25;

/** `hasTeams`: robots without a team are reserves; in single-robot modes there are no teams at all. */
export function fleetColumns(t: Translate, hasTeams = true): ColumnDef<FleetRow>[] {
  return [
    {
      id: 'id', header: t('col.id'), accessorFn: r => r.id,
      cell: ({ row }) => <Num value={String(row.original.id).padStart(2, '0')} className="text-muted-foreground" />,
      meta: { className: 'w-12' },
    },
    {
      id: 'team', header: t('col.team'), accessorFn: r => r.team ?? undefined, sortUndefined: 'last',
      cell: ({ row }) => row.original.team ?? <span className="text-muted-foreground">{hasTeams ? t('telemetry.reserve') : '—'}</span>,
    },
    {
      id: 'state', header: t('col.state'), accessorFn: r => r.state,
      cell: ({ row }) => <Badge tone={stateTone(row.original.state)}>{row.original.state}</Badge>,
    },
    {
      id: 'force', header: t('col.force'), accessorFn: r => r.force ?? undefined, sortUndefined: 'last',
      cell: ({ row }) => <Num value={fmt(row.original.force, 1)} />,
      meta: { align: 'right', unit: t('unit.N'), hint: t('col.force.hint') },
    },
    {
      id: 'height', header: t('col.height'), accessorFn: r => r.height,
      cell: ({ row }) => <Num value={fmt(row.original.height, 1)} />,
      meta: { align: 'right', unit: t('unit.mm'), hint: t('col.height.hint') },
    },
    {
      id: 'battery', header: t('col.battery'), accessorFn: r => r.battery,
      cell: ({ row }) => {
        const low = row.original.battery < LOW_BATTERY;
        return (
          <span className={cn('inline-flex items-center justify-end gap-2', low ? 'text-warning' : 'text-muted-foreground')}>
            <Sparkline values={row.original.batteryTrend} min={0} max={1} width={40} />
            <Num value={fmt(row.original.battery * 100, 1)} className={low ? 'text-warning' : 'text-foreground'} />
          </span>
        );
      },
      meta: { align: 'right', unit: '%', hint: t('col.battery.hint') },
    },
    {
      id: 'eh', header: t('col.eh'), accessorFn: r => r.eh ?? undefined, sortUndefined: 'last',
      cell: ({ row }) => (
        <span className="inline-flex items-center justify-end gap-2 text-muted-foreground">
          {row.original.ehTrend.length > 1 && <Sparkline values={row.original.ehTrend} min={0} width={36} />}
          <Num value={fmt(row.original.eh, 3)} className={(row.original.eh ?? 0) >= 1 ? 'text-warning' : 'text-foreground'} />
        </span>
      ),
      meta: { align: 'right', unit: t('unit.mm'), hint: t('col.eh.hint') },
    },
    {
      id: 'rho', header: t('col.rho'), accessorFn: r => r.rho ?? undefined, sortUndefined: 'last',
      cell: ({ row }) => <Num value={fmt(row.original.rho, 3)} className={TONE_TEXT[rhoTone(row.original.rho)]} />,
      meta: { align: 'right', unit: t('unit.m'), hint: t('col.rho.hint') },
    },
    {
      id: 'epoch', header: t('col.epoch'), accessorFn: r => r.epoch ?? undefined, sortUndefined: 'last',
      cell: ({ row }) => <Num value={row.original.epoch === null ? '—' : String(row.original.epoch)} className="text-muted-foreground" />,
      meta: { align: 'right', hint: t('col.epoch.hint'), className: 'w-16' },
    },
  ];
}

export interface FleetTableProps {
  rows: FleetRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  hasTeams?: boolean;
}

/** Fleet telemetry: one row per robot, sortable, click / Enter focuses the camera on the robot. */
export function FleetTable({ rows, selectedId, onSelect, hasTeams = true }: FleetTableProps): JSX.Element {
  const t = useT();
  const columns = useMemo(() => fleetColumns(t, hasTeams), [t, hasTeams]);
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={r => String(r.id)}
      selectedId={selectedId === null ? null : String(selectedId)}
      onRowClick={r => onSelect(r.id)}
      rowLabel={r => t('robot.title', { id: r.id })}
      sortLabel={col => t('telemetry.sortBy', { col })}
      caption={t('telemetry.title')}
      empty={t('telemetry.empty')}
    />
  );
}
