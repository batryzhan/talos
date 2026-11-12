import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Crosshair, RotateCcw, X } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Hint } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { useUiStore } from '@/store/ui';
import { useSim, type SimSnapshot } from '@/features/sim/simStore';

const FPS_ALERT = 40;

export type SimStatus = 'loading' | 'running' | 'paused' | 'hold' | 'error';

export function simStatus(s: Pick<SimSnapshot, 'phase' | 'holding'>, paused: boolean): SimStatus {
  if (s.phase === 'error') return 'error';
  if (s.phase === 'loading') return 'loading';
  if (s.holding) return 'hold';
  return paused ? 'paused' : 'running';
}

const STATUS: Record<SimStatus, { tone: BadgeTone; label: MessageKey; live: boolean }> = {
  loading: { tone: 'neutral', label: 'status.loading', live: true },
  running: { tone: 'success', label: 'status.running', live: true },
  paused: { tone: 'warning', label: 'status.paused', live: false },
  hold: { tone: 'destructive', label: 'status.hold', live: true },
  error: { tone: 'destructive', label: 'status.error', live: false },
};

export function StatusBadge(): JSX.Element {
  const t = useT();
  const phase = useSim(s => s.phase);
  const holding = useSim(s => s.holding);
  const paused = useUiStore(s => s.paused);
  const st = STATUS[simStatus({ phase, holding }, paused)];
  return <Badge tone={st.tone} dot live={st.live} role="status">{t(st.label)}</Badge>;
}

/** Light HUD over the canvas: status + model time (top-left), frame stats only when slow (top-right). */
export function ViewportHud(): JSX.Element {
  const t = useT();
  const time = useSim(s => s.time);
  const fps = useSim(s => s.fps);
  const frameMs = useSim(s => s.frameMs);
  const phase = useSim(s => s.phase);
  const selection = useUiStore(s => s.selection);
  const select = useUiStore(s => s.select);
  const workflow = useSim(s => s.workflow?.kind ?? null);
  const overlay = useUiStore(s => s.overlay);
  const slow = phase === 'ready' && fps < FPS_ALERT;

  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-md border bg-panel/80 px-2 py-1 shadow-sm backdrop-blur">
          <StatusBadge />
          <Hint label={t('hud.time')}>
            <span className="num text-xs text-foreground" tabIndex={0}>
              {time.toFixed(1)}<span className="ml-0.5 font-sans text-2xs text-muted-foreground">{t('unit.s')}</span>
            </span>
          </Hint>
        </div>
      </div>

      {workflow && overlay && <OverlayLegend kind={workflow} />}
      <AnimatePresence>
        {slow && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-none absolute right-3 top-3 rounded-md border bg-panel/80 px-2 py-1 text-2xs text-muted-foreground backdrop-blur"
          >
            <span className="num text-warning">{Math.round(fps)}</span> {t('hud.fps')} · <span className="num">{frameMs.toFixed(1)}</span> {t('unit.ms')}/{t('hud.frame')}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selection && phase === 'ready' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md border bg-panel/85 py-0.5 pl-2 pr-0.5 text-xs shadow-sm backdrop-blur"
          >
            <Crosshair className="size-3.5 text-primary" aria-hidden />
            <span>{t('hud.following', { target: selection.kind === 'agent' ? t('hud.robot', { id: selection.id }) : t('hud.team', { id: selection.id }) })}</span>
            <Button variant="ghost" size="icon-sm" aria-label={t('hud.stopFollow')} onClick={() => select(null)}>
              <X />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Skeleton + GLB download progress while the robot model loads. */
export function ViewportLoading(): JSX.Element {
  const t = useT();
  const phase = useSim(s => s.phase);
  const progress = useSim(s => s.progress);
  return (
    <AnimatePresence>
      {phase === 'loading' && (
        <motion.div
          initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-viewport"
          aria-busy="true"
        >
          <div className="grid w-64 grid-cols-3 gap-2 opacity-60" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" style={{ animationDelay: `${i * 90}ms` }} />)}
          </div>
          <div className="w-64 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{progress > 0 ? t('viewport.loading') : t('viewport.preparing')}</span>
              <span className="num">{Math.round(progress * 100)}%</span>
            </div>
            <Progress value={progress * 100} aria-label={t('viewport.loading')} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ViewportError(): JSX.Element | null {
  const t = useT();
  const error = useSim(s => s.error);
  const phase = useSim(s => s.phase);
  const seed = useUiStore(s => s.seed);
  const restart = useUiStore(s => s.restart);
  if (phase !== 'error') return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-viewport/90 p-6" role="alert">
      <div className="max-w-sm rounded-lg border bg-card p-4 shadow-lg">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
          {t('viewport.error')}
        </div>
        <p className="mb-3 break-words text-sm text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={() => restart(seed)}>
          <RotateCcw />
          {t('common.retry')}
        </Button>
      </div>
    </div>
  );
}

const LEGEND: Record<'factory' | 'wildfire' | 'mining', [MessageKey, string][]> = {
  factory: [['legend.open', 'bg-info'], ['legend.fast', 'bg-success'], ['legend.slow', 'bg-warning'], ['legend.closed', 'bg-destructive'], ['legend.route', 'bg-primary']],
  wildfire: [['legend.radio', 'bg-success'], ['legend.relay', 'bg-info'], ['legend.closed', 'bg-destructive'], ['legend.route', 'bg-warning']],
  mining: [['legend.scanned', 'bg-success'], ['legend.unknown', 'bg-muted-foreground'], ['legend.closed', 'bg-destructive'], ['legend.route', 'bg-warning']],
};

/** Key of the engineering layer drawn inside the workflow scenes. */
function OverlayLegend({ kind }: { kind: 'factory' | 'wildfire' | 'mining' }): JSX.Element {
  const t = useT();
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 space-y-1 rounded-md border bg-panel/90 p-2 text-2xs backdrop-blur">
      <p className="font-medium">{t('legend.title')}</p>
      {LEGEND[kind].map(([key, color]) => (
        <p key={key} className="flex items-center gap-1.5 text-muted-foreground"><span className={`h-0.5 w-4 rounded ${color}`} aria-hidden />{t(key)}</p>
      ))}
    </div>
  );
}
