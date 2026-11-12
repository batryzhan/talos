import { ArrowLeftRight, ArrowUpDown, Gauge, Hand, MoveDiagonal, OctagonMinus, Orbit, RotateCw, ScanLine, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useT, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSim, useSimStore } from '@/features/sim/simStore';
import { MANEUVERS, type ManeuverId } from '@/core/calibration/CalibrationProgram';

const ICONS: Record<ManeuverId, LucideIcon> = {
  forward: ArrowUpDown, strafe: ArrowLeftRight, diagonal: MoveDiagonal, rotate: RotateCw,
  combined: Orbit, saturation: Gauge, brake: OctagonMinus,
};

/** /calibration brief: chassis description, test manoeuvre picker and the running script phase. */
export function CalibrationScenarioCard(): JSX.Element {
  const t = useT();
  const ready = useSim(s => s.phase === 'ready');
  const maneuver = useSim(s => s.calibration?.maneuver ?? 'forward');
  const manual = useSim(s => s.calibration?.manual ?? false);
  const leg = useSim(s => s.calibration?.leg ?? 'move');
  const progress = useSim(s => s.calibration?.progress ?? 0);
  const cycles = useSim(s => s.calibration?.cycles ?? 0);

  const pick = (id: ManeuverId): void => { useSimStore.getState().engine?.selectManeuver(id); };

  return (
    <Card>
      <CardHeader className="pb-1.5"><CardTitle><ScanLine aria-hidden />{t('scenario.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <CardDescription className="leading-5">{t('scenario.calibration')}</CardDescription>

        <div className="space-y-1.5">
          <h3 id="cal-maneuvers" className="caption">{t('cal.maneuvers')}</h3>
          <div role="group" aria-labelledby="cal-maneuvers" className="grid grid-cols-2 gap-1">
            {MANEUVERS.map(id => {
              const Icon = ICONS[id];
              const active = id === maneuver && !manual;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!ready}
                  aria-pressed={active}
                  title={t(`cal.m.${id}.hint` as MessageKey)}
                  onClick={() => pick(id)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-md border px-2 text-left text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
                    active ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
                    id === 'brake' && 'col-span-2',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t(`cal.m.${id}` as MessageKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {manual ? (
          <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs" role="status">
            <Hand className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <div className="space-y-0.5"><p className="font-medium">{t('cal.manual')}</p><p className="text-muted-foreground">{t('cal.manualHint')}</p></div>
          </div>
        ) : (
          <div className="space-y-1.5" aria-live="polite">
            <p className="text-xs leading-5 text-muted-foreground">{t(`cal.m.${maneuver}.hint` as MessageKey)}</p>
            <div className="flex items-center justify-between text-2xs">
              <span className="text-muted-foreground">{t(`cal.leg.${leg}` as MessageKey)}</span>
              <span className="num text-muted-foreground">{t('cal.cycle', { n: cycles + 1 })}</span>
            </div>
            <Progress value={progress * 100} aria-label={t(`cal.leg.${leg}` as MessageKey)} className="h-1" />
          </div>
        )}
        {!manual && <p className="text-2xs text-muted-foreground">{t('cal.manualHint')}</p>}
      </CardContent>
    </Card>
  );
}
