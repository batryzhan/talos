import { Flame } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useT } from '@/i18n';
import { fmt } from '@/lib/utils';
import { useSim } from '@/features/sim/simStore';
import { BrigadeList, Fact, Kpi, type BrigadeInfo } from './common';

const BRIGADES: BrigadeInfo[] = [
  { id: 'Firefighter', capability: 'WATER_CANNON', size: 12 },
  { id: 'Firebreak', capability: 'TRENCH_BLADE', size: 4 },
  { id: 'Scout-Relay', capability: 'THERMAL_RELAY', size: 6 },
  { id: 'Supply', capability: 'TANKER_REFILL', size: 2 },
];

/** /rescue brief: active fires, contained area, fleet water, radio connectivity (LoS + relays). */
export default function WildfireScenarioCard(): JSX.Element {
  const t = useT();
  const k = useSim(s => (s.workflow?.kind === 'wildfire' ? s.workflow.kpi : null));
  const ha = (cells: number): string => fmt(cells * 4 / 10000, 2);
  return (
    <Card>
      <CardHeader className="pb-1.5"><CardTitle><Flame aria-hidden />{t('scenario.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <CardDescription className="leading-5">{t('scenario.rescue')}</CardDescription>
        <dl className="grid grid-cols-2 gap-2">
          <Kpi label={t('wildfire.fires')} value={String(k?.activeFires ?? 0)} tone={k && k.activeFires > 0 ? 'destructive' : 'success'} sub={k ? `${t('wildfire.burning')}: ${ha(k.burningCells)}` : undefined} />
          <Kpi label={t('wildfire.contained')} value={fmt((k?.contained ?? 1) * 100, 0)} unit="%" tone={k && k.contained > 0.9 ? 'success' : 'warning'} />
          <Kpi label={t('wildfire.water')} value={fmt(k?.waterFleet ?? 0, 0)} unit={`/ ${k?.waterCapacity ?? 480} ${t('unit.L')}`} tone="info" />
          <Kpi label={t('wildfire.radio')} value={fmt((k?.connectivity ?? 1) * 100, 0)} unit="%" tone={k && k.connectivity < 0.8 ? 'warning' : 'success'} sub={t('wildfire.relays', { n: k?.relaysActive ?? 0 })} />
        </dl>
        {k && <Progress value={k.contained * 100} aria-label={t('wildfire.contained')} />}
        <BrigadeList brigades={BRIGADES} />
        {k && (
          <div className="space-y-1 border-t pt-2">
            <Fact label={t('wildfire.firebreak')} value={`${fmt(k.firebreakCells * 4, 0)} ${t('unit.m')}²`} />
            <Fact label={t('wildfire.refills')} value={k.refills} />
            <Fact label={t('wf.replans')} value={k.replans} />
            <Fact label={t('wf.updates')} value={k.updates} />
            <Fact label={t('wf.epoch')} value={k.epoch} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
