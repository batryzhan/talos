import { ChevronDown, ChevronUp, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePlural, useT } from '@/i18n';
import { useUiStore } from '@/store/ui';
import { useSim } from '@/features/sim/simStore';
import { FleetTable } from './FleetTable';
import { WorkflowTable } from './WorkflowTable';
import { CalibrationTable } from '@/features/calibration/CalibrationTable';

/** Bottom dock: header bar (always visible) + lift-fleet table or heterogeneous workflow table. */
export function TelemetryDock({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }): JSX.Element {
  const t = useT();
  const plural = usePlural();
  const rows = useSim(s => s.rows);
  const workflow = useSim(s => s.workflow);
  const wheels = useSim(s => s.calibration?.wheels ?? null);
  const selection = useUiStore(s => s.selection);
  const select = useUiStore(s => s.select);
  const selectedId = selection?.kind === 'agent' ? selection.id : null;
  const count = workflow ? workflow.rows.length : rows.length;
  const onSelect = (id: number): void => select({ kind: 'agent', id });

  return (
    <section aria-labelledby="telemetry-title" className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Gauge className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="telemetry-title" className="text-sm font-semibold">{t('telemetry.title')}</h2>
        {wheels ? <span className="text-xs text-muted-foreground">{t('cal.dock')}</span>
          : count > 0 && <span className="text-xs text-muted-foreground">{plural('telemetry.count', count)}</span>}
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onToggle} aria-label={collapsed ? t('telemetry.expand') : t('telemetry.collapse')} aria-expanded={!collapsed}>
          {collapsed ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </header>
      {!collapsed && (
        <ScrollArea className="min-h-0 flex-1" horizontal>
          {wheels ? (
            <div className="min-w-[720px]">
              <CalibrationTable wheels={wheels} />
            </div>
          ) : workflow ? (
            <div className="min-w-[880px]">
              <WorkflowTable snapshot={workflow} selectedId={selectedId} onSelect={onSelect} />
            </div>
          ) : (
            <div className="min-w-[720px]">
              <FleetTable rows={rows} selectedId={selectedId} onSelect={onSelect} hasTeams={rows.some(r => r.team !== null)} />
            </div>
          )}
        </ScrollArea>
      )}
    </section>
  );
}
