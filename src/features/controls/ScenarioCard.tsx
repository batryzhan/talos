import { useMemo } from 'react';
import { ChevronRight, MapPinned } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { MissionDef } from '@/app/missions';
import { HeavyConstructionSim } from '@/missions/HeavyConstructionSim';
import { SmartFactorySim } from '@/missions/SmartFactorySim';
import { useUiStore } from '@/store/ui';
import { useSim } from '@/features/sim/simStore';

interface TeamInfo { id: string; robots: number; mass: number }

function planOf(mission: MissionDef): { teams: TeamInfo[]; route?: { x: number; y: number }[]; reserves: number[]; chargers: number } {
  if (mission.mode === 1 || mission.mode === 2) {
    const plan = mission.mode === 1 ? new HeavyConstructionSim() : new SmartFactorySim();
    return {
      teams: plan.teams.map(s => ({ id: s.teamId, robots: s.agentIds.length, mass: s.mass ?? 0 })),
      route: mission.mode === 1 ? (plan as HeavyConstructionSim).route : undefined,
      reserves: plan.reserves,
      chargers: plan.chargers.length,
    };
  }
  return { teams: [], reserves: [], chargers: 0 };
}

/** Mission brief: what happens, which teams carry what, route / reserves; teams focus the camera. */
export function ScenarioCard({ mission }: { mission: MissionDef }): JSX.Element {
  const t = useT();
  const plan = useMemo(() => planOf(mission), [mission]);
  const phases = useSim(s => s.teams);
  const selection = useUiStore(s => s.selection);
  const select = useUiStore(s => s.select);
  const Icon = mission.icon;
  const last = plan.route?.[plan.route.length - 1];

  return (
    <Card>
      <CardHeader className="pb-1.5"><CardTitle><Icon aria-hidden />{t('scenario.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <CardDescription className="leading-5">{t(mission.description)}</CardDescription>

        {plan.teams.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="caption">{t('scenario.teams')}</h3>
            <ul className="-mx-1.5 space-y-px">
              {plan.teams.map(team => {
                const active = selection?.kind === 'team' && selection.id === team.id;
                const phase = phases.find(p => p.id === team.id)?.phase;
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      onClick={() => select({ kind: 'team', id: team.id })}
                      aria-label={t('scenario.focusTeam', { team: team.id })}
                      aria-pressed={active}
                      className={cn(
                        'group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active && 'bg-primary/10',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col leading-4">
                        <span className="truncate font-medium">{team.id}</span>
                        {phase && <span className="truncate font-mono text-[10px] text-muted-foreground">{phase}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{t('scenario.robots', { n: team.robots })}</span>
                      <span className="num w-12 text-right text-xs">{team.mass}<span className="ml-0.5 font-sans text-2xs text-muted-foreground">{t('unit.kg')}</span></span>
                      <ChevronRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {mission.mode === 0 && <Fact label={t('scenario.payload')} value={t('scenario.single')} />}
        {mission.mode === 4 && (
          <button
            type="button"
            onClick={() => select({ kind: 'team', id: 'MACRO' })}
            className="flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-medium">{t('scenario.macroTeam')} 2×2</span>
            <span className="text-xs text-muted-foreground">{t('scenario.macroDetail')}</span>
          </button>
        )}
        {last && plan.route && (
          <Fact
            icon={<MapPinned className="size-3.5" aria-hidden />}
            label={t('scenario.route')}
            value={t('scenario.routeValue', { n: plan.route.length, x: last.x, y: last.y })}
          />
        )}
        {plan.reserves.length > 0 && (
          <Fact label={t('scenario.reserves')} value={<span className="flex gap-1">{plan.reserves.map(id => <Badge key={id} className="num">#{id}</Badge>)}</span>} />
        )}
        {plan.chargers > 0 && <Fact label={t('scenario.chargers')} value={<span className="num">{plan.chargers}</span>} />}
      </CardContent>
    </Card>
  );
}

function Fact({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
