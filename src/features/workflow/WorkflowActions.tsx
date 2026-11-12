import { useId } from 'react';
import { BatteryLow, Construction, Flame, Mountain, ScanEye, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Hint } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { useSim } from '@/features/sim/simStore';
import type { FactoryMission } from '@/missions/FactoryMission';
import type { WildfireMission } from '@/missions/WildfireMission';
import type { MiningMission } from '@/missions/MiningMission';
import type { WorkflowSnapshot } from '@/missions/workflow/types';
import { currentWorkflow } from './common';

/** Mission-specific operator actions of the workflow missions (factory, wildfire, mine). */
export function WorkflowActions({ kind }: { kind: WorkflowSnapshot['kind'] }): JSX.Element {
  const t = useT();
  const ready = useSim(s => s.phase === 'ready' && !s.holding);
  if (kind === 'factory') return <FactoryActions ready={ready} />;
  if (kind === 'wildfire') return <WildfireActions ready={ready} />;
  return <MiningActions ready={ready} t={t} />;
}

function FactoryActions({ ready }: { ready: boolean }): JSX.Element {
  const t = useT();
  const blocked = useSim(s => s.workflow?.kind === 'factory' && s.workflow.kpi.corridorBlocked);
  const m = (): FactoryMission | undefined => currentWorkflow<FactoryMission>();
  return (
    <div className="grid gap-2">
      <Hint label={t('controls.fault.hint')}>
        <Button variant="secondary" disabled={!ready} onClick={() => m()?.injectFault()}><Wrench />{t('controls.fault')}</Button>
      </Hint>
      <Hint label={t('controls.corridor.hint')}>
        <Button variant={blocked ? 'outline' : 'secondary'} disabled={!ready} aria-pressed={blocked} onClick={() => m()?.toggleCorridor()}><Construction />{t(blocked ? 'controls.corridor.open' : 'controls.corridor')}</Button>
      </Hint>
      <Hint label={t('controls.battery.hint')}>
        <Button variant="secondary" disabled={!ready} onClick={() => m()?.injectBatteryDrop()}><BatteryLow />{t('controls.battery')}</Button>
      </Hint>
    </div>
  );
}

function WildfireActions({ ready }: { ready: boolean }): JSX.Element {
  const t = useT();
  const id = useId();
  const wind = useSim(s => (s.workflow?.kind === 'wildfire' ? s.workflow.kpi.wind : 0));
  const m = (): WildfireMission | undefined => currentWorkflow<WildfireMission>();
  return (
    <div className="grid gap-3">
      <Hint label={t('controls.ignite.hint')}>
        <Button variant="secondary" disabled={!ready} onClick={() => m()?.igniteRandom()}><Flame />{t('controls.ignite')}</Button>
      </Hint>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={id} className="caption">{t('controls.wind')}</Label>
          <span className="num text-xs">{wind.toFixed(1)} {t('unit.mps')}</span>
        </div>
        <Slider id={id} min={0} max={14} step={0.5} value={[wind]} onValueChange={([v]) => { const w = m(); if (w) w.wind = v; }} thumbLabel={t('controls.wind')} />
      </div>
    </div>
  );
}

function MiningActions({ ready, t }: { ready: boolean; t: ReturnType<typeof useT> }): JSX.Element {
  const id = useId();
  const visor = useSim(s => s.workflow?.kind === 'mining' && s.workflow.kpi.lidarVisor);
  const m = (): MiningMission | undefined => currentWorkflow<MiningMission>();
  return (
    <div className="grid gap-3">
      <Hint label={t('controls.collapse.hint')}>
        <Button variant="secondary" disabled={!ready} onClick={() => m()?.triggerCollapse()}><Mountain />{t('controls.collapse')}</Button>
      </Hint>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor={id} className="flex items-center gap-1.5"><ScanEye className="size-3.5" aria-hidden />{t('controls.lidar')}</Label>
          <p className="text-2xs text-muted-foreground">{t('controls.lidar.hint')}</p>
        </div>
        <Switch id={id} checked={visor} onCheckedChange={v => { const w = m(); if (w) w.lidarVisor = v; }} />
      </div>
    </div>
  );
}
