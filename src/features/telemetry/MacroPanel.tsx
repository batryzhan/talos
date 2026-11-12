import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { DataTable, Num } from '@/components/data-table';
import { Sparkline } from '@/components/sparkline';
import { useT } from '@/i18n';
import { cn, fmt } from '@/lib/utils';
import type { MacroChassisRow, MacroSnapshot } from '@/features/sim/simStore';
import type { LatchStatus, StressLevel } from '@/types/metamorphic';
import { sci } from '@/features/benchmark/format';

const CONSENSUS_THRESHOLD = 0.01;
const LATCH_TONE: Record<LatchStatus, BadgeTone> = {
  DISCONNECTED: 'neutral', APPROACHING: 'warning', ALIGNING: 'warning', LATCHED: 'info', STRUCTURAL_LOCK: 'success',
};
const STRESS_TONE: Record<StressLevel, string> = { NOMINAL: 'text-success', ELEVATED: 'text-warning', CRITICAL: 'text-destructive' };

/** Metamorphic swarm telemetry: KPI strip (lock, current, D(k), latch load, route, bridge, radio) + per-chassis table. */
export function MacroPanel({ macro, selectedId, onSelect }: { macro: MacroSnapshot; selectedId: number | null; onSelect: (id: number) => void }): JSX.Element {
  const t = useT();
  const converged = macro.locked && macro.residual <= CONSENSUS_THRESHOLD;
  const columns = useMemo<ColumnDef<MacroChassisRow>[]>(() => [
    { id: 'id', header: t('col.id'), accessorFn: r => r.id, cell: ({ row }) => <Num value={String(row.original.id).padStart(2, '0')} className="text-muted-foreground" />, meta: { className: 'w-12' } },
    { id: 'role', header: t('macro.role'), accessorFn: r => r.role, cell: ({ row }) => t(row.original.role === 'worker' ? 'macro.role.worker' : 'macro.role.reserve') },
    { id: 'latch', header: t('robot.latch'), accessorFn: r => r.latch, cell: ({ row }) => <Badge tone={LATCH_TONE[row.original.latch]}>{row.original.latch.replace('_', ' ')}</Badge> },
    { id: 'power', header: t('robot.power'), accessorFn: r => r.power, cell: ({ row }) => <Num value={fmt(row.original.power, 1)} />, meta: { align: 'right', unit: t('unit.W') } },
  ], [t]);

  return (
    <div className="flex flex-col gap-3 p-3 lg:flex-row">
      <dl className="grid flex-1 grid-cols-2 content-start gap-2 self-start sm:grid-cols-4">
        <Kpi label={t('macro.lock')}>
          <Badge tone={macro.locked ? 'success' : macro.assembling ? 'warning' : 'neutral'} dot live={macro.assembling}>
            {macro.locked ? t('macro.locked') : macro.assembling ? t('macro.assembling', { n: macro.lockedCount, m: macro.required }) : t('macro.solo')}
          </Badge>
        </Kpi>
        <Kpi label={t('macro.current')}><Num value={fmt(macro.totalCurrent, 2)} unit={t('unit.A')} /></Kpi>
        <Kpi label={t('macro.residual')}>
          <span className={cn('inline-flex items-center gap-2', converged ? 'text-success' : 'text-warning')}>
            <Num value={sci(macro.residual)} unit={t('unit.A')} className="text-foreground" />
            <Sparkline values={macro.residualTrend.map(v => Math.log10(Math.max(v, 1e-6)))} width={44} />
          </span>
        </Kpi>
        <Kpi label={t('macro.stress')}><Num value={fmt(macro.peakStress * 100, 0)} unit="%" className={STRESS_TONE[macro.stress]} /></Kpi>
        <Kpi label={t('macro.route')}>
          <span className="flex items-baseline gap-1.5">
            <Badge tone={macro.routeStatus === 'UNREACHABLE' ? 'destructive' : 'success'}>{macro.routeStatus}</Badge>
            {Number.isFinite(macro.routeCost) && <Num value={macro.routeCost.toFixed(1)} unit={t('unit.m')} />}
          </span>
        </Kpi>
        <Kpi label={t('macro.bridge')}><Badge tone={macro.bridgeStatus === 'HOLDING' ? 'success' : macro.bridgeStatus === 'DEPLOYING' ? 'warning' : 'neutral'}>{macro.bridgeStatus}</Badge></Kpi>
        <Kpi label={t('macro.quorum')}><Badge tone={macro.quorum === 'STABLE' ? 'success' : macro.quorum === 'DEGRADED' ? 'warning' : 'destructive'}>{macro.quorum}</Badge></Kpi>
        <Kpi label={t('macro.delivery')}><Num value={fmt(macro.delivery * 100, 1)} unit="%" /></Kpi>
      </dl>
      <div className="min-w-0 rounded-md border lg:w-[26rem]">
        <DataTable
          data={macro.chassis}
          columns={columns}
          getRowId={r => String(r.id)}
          selectedId={selectedId === null ? null : String(selectedId)}
          onRowClick={r => onSelect(r.id)}
          rowLabel={r => t('robot.title', { id: r.id })}
          sortLabel={col => t('telemetry.sortBy', { col })}
          caption={t('macro.title')}
        />
      </div>
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-2">
      <dt className="mb-1 truncate text-2xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
