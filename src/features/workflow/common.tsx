import { ChevronRight } from 'lucide-react';
import { useT, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';
import { useSim, useSimStore } from '@/features/sim/simStore';
import type { ModuleCapability } from '@/core/agents/taskModule';
import type { WorkflowMission } from '@/missions/workflow/WorkflowMission';

/** The running workflow mission, for operator actions (never read per frame by React). */
export function currentWorkflow<M extends WorkflowMission>(): M | undefined {
  return useSimStore.getState().engine?.workflow as M | undefined;
}

export interface BrigadeInfo { id: string; capability: ModuleCapability; size: number }

/** Brigade list: module, live robot count; a click focuses the camera on the brigade. */
export function BrigadeList({ brigades, activity }: { brigades: readonly BrigadeInfo[]; activity?: Record<string, string> }): JSX.Element {
  const t = useT();
  const selection = useUiStore(s => s.selection);
  const select = useUiStore(s => s.select);
  const teams = useSim(s => s.teams);
  return (
    <div className="space-y-1.5">
      <h3 className="caption">{t('wf.brigades')}</h3>
      <ul className="-mx-1.5 space-y-px">
        {brigades.map(b => {
          const active = selection?.kind === 'team' && selection.id === b.id;
          const n = teams.find(x => x.id === b.id)?.robots ?? b.size;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => select({ kind: 'team', id: b.id })}
                aria-label={t('wf.focusTeam', { team: b.id })}
                aria-pressed={active}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active && 'bg-primary/10',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col leading-4">
                  <span className="truncate font-medium">{b.id}-1..{b.size}</span>
                  <span className="truncate text-2xs text-muted-foreground">{t(`wf.module.${b.capability}` as MessageKey)} · <span className="font-mono">{b.capability}</span></span>
                </span>
                {activity?.[b.id] && <span className="font-mono text-2xs text-muted-foreground">{activity[b.id]}</span>}
                <span className="num w-6 text-right text-xs">{n}</span>
                <ChevronRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const TONE_TEXT = { success: 'text-success', warning: 'text-warning', destructive: 'text-destructive', info: 'text-info' } as const;

/** Compact KPI tile. */
export function Kpi({ label, value, unit, tone, sub }: { label: string; value: string; unit?: string; tone?: 'success' | 'warning' | 'destructive' | 'info'; sub?: string }): JSX.Element {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-2">
      <dt className="mb-0.5 truncate text-2xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('num text-base leading-5', tone && TONE_TEXT[tone])}>
        {value}{unit && <span className="ml-0.5 font-sans text-2xs text-muted-foreground">{unit}</span>}
      </dd>
      {sub && <p className="truncate text-2xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Fact({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="num text-right">{value}</span>
    </div>
  );
}
