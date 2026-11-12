import { ArrowDown, Factory } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import { cn, fmt } from '@/lib/utils';
import { useSim } from '@/features/sim/simStore';
import type { FactoryKpi } from '@/missions/workflow/types';
import { BrigadeList, Fact, type BrigadeInfo } from './common';

const BRIGADES: BrigadeInfo[] = [
  { id: 'Cutter', capability: 'PLASMA_CUTTER', size: 4 },
  { id: 'Welder', capability: 'ARC_WELDER', size: 6 },
  { id: 'Mechanic', capability: 'REPAIR_DIAGNOSTIC', size: 4 },
  { id: 'Logistics', capability: 'ROLLER_CARRIER', size: 4 },
  { id: 'Reserve', capability: 'MULTI_SWAP', size: 2 },
];

/** /factory brief: Swarm Agentic Workflow chain with counters, brigades, live J_ij auction and M0 seam consensus. */
export default function FactoryScenarioCard(): JSX.Element {
  const t = useT();
  const kpi = useSim(s => (s.workflow?.kind === 'factory' ? s.workflow.kpi : null));
  const steps: { label: string; done: number; busy: number }[] = [
    { label: t('factory.cut'), done: kpi?.cut ?? 0, busy: kpi?.inCutting ?? 0 },
    { label: t('factory.weld'), done: kpi?.welded ?? 0, busy: kpi?.inWelding ?? 0 },
    { label: t('factory.repair'), done: kpi?.repaired ?? 0, busy: kpi?.inRepair ?? 0 },
    { label: t('factory.ship'), done: kpi?.delivered ?? 0, busy: kpi?.inHauling ?? 0 },
  ];
  return (
    <Card>
      <CardHeader className="pb-1.5"><CardTitle><Factory aria-hidden />{t('scenario.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <CardDescription className="leading-5">{t('scenario.factory')}</CardDescription>

        <div className="space-y-1.5">
          <h3 className="caption">{t('wf.chain')}</h3>
          <ol className="space-y-0.5" aria-label={t('wf.chain')}>
            {steps.map((s, i) => (
              <li key={s.label}>
                <div className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm', s.busy > 0 && 'border-primary/40 bg-primary/5')}>
                  <span className="num text-2xs text-muted-foreground">0{i + 1}</span>
                  <span className="flex-1 truncate">{s.label}</span>
                  {s.busy > 0 && <Badge tone="primary" dot live className="num">{s.busy}</Badge>}
                  <span className="num w-8 text-right font-medium">{s.done}</span>
                </div>
                {i < steps.length - 1 && <ArrowDown className="mx-auto my-0.5 size-3 text-muted-foreground" aria-hidden />}
              </li>
            ))}
          </ol>
        </div>

        <BrigadeList brigades={BRIGADES} />
        {kpi && <AuctionTable kpi={kpi} />}
        {kpi && (
          <div className="space-y-1.5">
            <h3 className="caption">{t('factory.consensus')}</h3>
            {kpi.weldConsensus.map(c => (
              <Fact key={c.jig} label={t('factory.jig', { id: c.jig })} value={
                <span className="inline-flex items-center gap-1.5">
                  D(k) = {c.spread > 0 ? c.spread.toFixed(4) : '—'}
                  <Badge tone={c.converged ? 'success' : 'neutral'}>{c.converged ? '≤ 0.01' : '—'}</Badge>
                </span>
              } />
            ))}
          </div>
        )}
        {kpi && (
          <div className="space-y-1 border-t pt-2">
            <Fact label={t('factory.faults')} value={<span className={kpi.faults ? 'text-destructive' : ''}>{kpi.faults}</span>} />
            <Fact label={t('wf.replans')} value={kpi.replans} />
            <Fact label={t('wf.updates')} value={kpi.updates} />
            <Fact label={t('wf.epoch')} value={kpi.epoch} />
            <Fact label={t('wf.restore')} value={kpi.restoreSeconds === null ? '—' : `${fmt(kpi.restoreSeconds, 1)} ${t('unit.s')}`} />
            {kpi.lastObservation && <p className="text-2xs text-muted-foreground">{t('wf.lastEdge', { edge: kpi.lastObservation.edge, before: kpi.lastObservation.before.toFixed(1), after: kpi.lastObservation.after.toFixed(1) })}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuctionTable({ kpi }: { kpi: FactoryKpi }): JSX.Element {
  const t = useT();
  const a = kpi.auction;
  return (
    <div className="space-y-1.5">
      <h3 className="caption flex items-baseline justify-between gap-2">{t('factory.auction')}<span className="font-mono text-2xs normal-case text-muted-foreground">t̂ + w_q·q + w_e·r + w_u·u</span></h3>
      {!a ? <p className="text-xs text-muted-foreground">{t('factory.auction.empty')}</p> : (
        <>
          <p className="text-xs">{t('factory.auction.machine', { machine: a.machine })}</p>
          <table className="w-full text-xs">
            <caption className="sr-only">{t('factory.auction')}</caption>
            <thead>
              <tr className="text-2xs text-muted-foreground"><th className="py-0.5 text-left font-medium">{t('col.robot')}</th><th className="text-right font-medium">t̂</th><th className="text-right font-medium">q</th><th className="text-right font-medium">r</th><th className="text-right font-medium">u</th><th className="text-right font-medium">J</th></tr>
            </thead>
            <tbody>
              {a.bids.map(b => (
                <tr key={b.name} className={cn(b.won && 'text-success')}>
                  <td className="py-0.5 font-medium">{b.name}</td>
                  <td className="num text-right">{b.t.toFixed(1)}</td>
                  <td className="num text-right">{b.q}</td>
                  <td className="num text-right">{b.r.toFixed(2)}</td>
                  <td className="num text-right">{b.u.toFixed(2)}</td>
                  <td className="num text-right font-medium">{b.cost.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
