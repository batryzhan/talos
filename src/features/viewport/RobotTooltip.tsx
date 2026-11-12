import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n';
import { fmt } from '@/lib/utils';
import { useSim } from '@/features/sim/simStore';
import { stateTone } from '@/features/telemetry/rows';

/** Hover card above a robot: ID, state, F_i, h_i, b_i (values refresh at 4 Hz). */
export function RobotTooltip({ id }: { id: number }): JSX.Element {
  const t = useT();
  const row = useSim(s => s.rows.find(r => r.id === id));
  const chassis = useSim(s => s.macro?.chassis.find(c => c.id === id));

  return (
    <div className="pointer-events-none mb-16 w-48 -translate-y-1/2 select-none rounded-lg border bg-popover/95 p-2.5 text-xs text-popover-foreground shadow-lg backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t('robot.title', { id })}</span>
        {row && <Badge tone={stateTone(row.state)}>{row.state}</Badge>}
        {chassis && <Badge tone={chassis.latch === 'STRUCTURAL_LOCK' ? 'success' : chassis.latch === 'DISCONNECTED' ? 'neutral' : 'warning'}>{chassis.latch.replace('_', ' ')}</Badge>}
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        {row && (
          <>
            {row.team && <Item label={t('robot.team')} value={row.team} plain />}
            <Item label={t('robot.force')} value={fmt(row.force, 1)} unit={t('unit.N')} />
            <Item label={t('robot.height')} value={fmt(row.height, 1)} unit={t('unit.mm')} />
            <Item label={t('robot.battery')} value={fmt(row.battery * 100, 1)} unit="%" />
          </>
        )}
        {chassis && <Item label={t('robot.power')} value={fmt(chassis.power, 1)} unit={t('unit.W')} />}
      </dl>
      <p className="mt-1.5 text-2xs text-muted-foreground">{t('robot.clickHint')}</p>
    </div>
  );
}

function Item({ label, value, unit, plain }: { label: string; value: string; unit?: string; plain?: boolean }): JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={plain ? 'text-right' : 'num text-right'}>
        {value}
        {unit && <span className="ml-0.5 font-sans text-2xs text-muted-foreground">{unit}</span>}
      </dd>
    </>
  );
}
