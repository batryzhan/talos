import { Html } from '@react-three/drei';
import { cn } from '@/lib/utils';
import type { Engine } from '@/platform/Engine';
import { useSim } from '@/features/sim/simStore';
import type { WorkflowBadge } from '@/missions/workflow/types';

const TONE: Record<WorkflowBadge['tone'], { dot: string; bar: string }> = {
  destructive: { dot: 'bg-destructive', bar: 'bg-destructive' },
  warning: { dot: 'bg-warning', bar: 'bg-warning' },
  info: { dot: 'bg-info', bar: 'bg-info' },
  success: { dot: 'bg-success', bar: 'bg-success' },
};

/**
 * 3D HTML badges over machines and incidents (breakdown, diagnosis / repair progress, collapse,
 * fire). Data refreshes with the 4 Hz snapshot; positions are static per incident.
 */
export function WorkflowBadges({ engine }: { engine: Engine }): JSX.Element | null {
  const badges = useSim(s => s.workflow?.badges);
  if (!badges?.length || !engine.workflow) return null;
  return (
    <>
      {badges.map(b => (
        <group key={b.id} position={[b.x, b.y, b.z]}>
          <Html center zIndexRange={[20, 5]} style={{ pointerEvents: 'none' }}>
            <div className="w-40 -translate-y-1/2 select-none rounded-md border bg-popover/90 px-2 py-1.5 text-2xs text-popover-foreground shadow-md backdrop-blur">
              <div className="flex items-center gap-1.5">
                <span className={cn('size-1.5 shrink-0 rounded-full', TONE[b.tone].dot, b.progress === null && 'animate-pulse-soft')} aria-hidden />
                <span className="truncate text-xs font-semibold">{b.title}</span>
              </div>
              <p className="truncate text-muted-foreground">{b.detail}</p>
              {b.progress !== null && (
                <div className="mt-1 flex items-center gap-1.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', TONE[b.tone].bar)} style={{ width: `${Math.round(b.progress * 100)}%` }} /></div>
                  <span className="num">{Math.round(b.progress * 100)}%</span>
                </div>
              )}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}
