import { Pickaxe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useT } from '@/i18n';
import { fmt } from '@/lib/utils';
import { useSim } from '@/features/sim/simStore';
import { BrigadeList, Fact, Kpi, type BrigadeInfo } from './common';

const BRIGADES: BrigadeInfo[] = [
  { id: 'Scanner-Light', capability: 'LIDAR_ILLUMINATOR', size: 6 },
  { id: 'Miner-Drill', capability: 'ROTARY_EXCAVATOR', size: 6 },
  { id: 'Hauler-Cart', capability: 'ORE_HOPPER_CART', size: 6 },
];

/** /mining brief: production, survey progress, active faces, collapses (S1), the three squads. */
export default function MiningScenarioCard(): JSX.Element {
  const t = useT();
  const k = useSim(s => (s.workflow?.kind === 'mining' ? s.workflow.kpi : null));
  const activity = Object.fromEntries((k?.teams ?? []).map(x => [x.id, `${x.working}/${x.size}`]));
  return (
    <Card>
      <CardHeader className="pb-1.5"><CardTitle><Pickaxe aria-hidden />{t('scenario.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <CardDescription className="leading-5">{t('scenario.mining')}</CardDescription>
        <dl className="grid grid-cols-2 gap-2">
          <Kpi label={t('mining.mined')} value={fmt((k?.minedKg ?? 0) / 1000, 2)} unit={t('unit.t')} tone="success" sub={`${t('mining.delivered')}: ${fmt((k?.delivered ?? 0) / 1000, 2)} ${t('unit.t')}`} />
          <Kpi label={t('mining.explored')} value={fmt((k?.explored ?? 0) * 100, 0)} unit="%" tone="info" />
          <Kpi label={t('mining.faces')} value={`${k?.activeFaces ?? 0}/6`} tone={k && k.activeFaces > 0 ? 'success' : 'warning'} />
          <Kpi label={t('mining.blocked')} value={String(k?.collapses ?? 0)} tone={k && k.collapses > 0 ? 'destructive' : undefined} />
        </dl>
        {k && <Progress value={k.explored * 100} aria-label={t('mining.explored')} />}
        <BrigadeList brigades={BRIGADES} activity={activity} />
        {k && (
          <div className="space-y-1 border-t pt-2">
            <Fact label={t('wf.replans')} value={k.replans} />
            <Fact label={t('wf.updates')} value={k.updates} />
            <Fact label={t('wf.epoch')} value={k.epoch} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
