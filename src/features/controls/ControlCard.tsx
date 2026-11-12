import { useId, useState } from 'react';
import { ArrowUpFromLine, OctagonX, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Hint } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { useUiStore } from '@/store/ui';
import { useSim, useSimStore } from '@/features/sim/simStore';
import { parseSeed, type SeedError } from './seed';
import type { WorkflowSnapshot } from '@/missions/workflow/types';
import { WorkflowActions } from '@/features/workflow/WorkflowActions';

const SEED_ERRORS: Record<SeedError, MessageKey> = {
  empty: 'controls.seedError.empty', integer: 'controls.seedError.integer', range: 'controls.seedError.range',
};

/** Seed + restart, lift (lift-team missions) or mission actions (workflow missions), emergency stop (confirmed), pause. */
export function ControlCard({ workflow }: { workflow?: WorkflowSnapshot['kind'] }): JSX.Element {
  const t = useT();
  const seed = useUiStore(s => s.seed);
  const paused = useUiStore(s => s.paused);
  const restart = useUiStore(s => s.restart);
  const setPaused = useUiStore(s => s.setPaused);
  const ready = useSim(s => s.phase === 'ready');
  const [draft, setDraft] = useState(String(seed));
  const parsed = parseSeed(draft);
  const seedId = useId(), hintId = useId();

  const submit = (): void => { if (parsed.ok) restart(parsed.value); };
  const engine = (): ReturnType<typeof useSimStore.getState>['engine'] => useSimStore.getState().engine;

  return (
    <Card>
      <CardHeader><CardTitle><SlidersHorizontal aria-hidden />{t('controls.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <form className="space-y-1.5" onSubmit={e => { e.preventDefault(); submit(); }}>
          <Label htmlFor={seedId} className="caption">{t('controls.seed')}</Label>
          <Input
            id={seedId}
            inputMode="numeric"
            autoComplete="off"
            className="num"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            aria-invalid={!parsed.ok}
            aria-describedby={hintId}
          />
          <p id={hintId} className={parsed.ok ? 'text-2xs text-muted-foreground' : 'text-2xs text-destructive'} aria-live="polite">
            {parsed.ok ? t('controls.seedHint') : t(SEED_ERRORS[parsed.error])}
          </p>
          <Button type="submit" variant="secondary" className="w-full" disabled={!parsed.ok}>
            <RotateCcw />
            {t('controls.restart')}
          </Button>
        </form>

        {workflow && <WorkflowActions kind={workflow} />}

        <div className="flex gap-2">
          {!workflow && (
            <Hint label={t('controls.lift.hint')}>
              <Button variant="default" className="flex-1" disabled={!ready} onClick={() => engine()?.lift()}>
                <ArrowUpFromLine />
                {t('controls.lift')}
              </Button>
            </Hint>
          )}
          <Hint label={paused ? t('controls.resume') : t('controls.pause')}>
            <Button variant="outline" size={workflow ? 'default' : 'icon'} className={workflow ? 'flex-1' : undefined} disabled={!ready} onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? t('controls.resume') : t('controls.pause')}>
              {paused ? <Play /> : <Pause />}
              {workflow && (paused ? t('controls.resume') : t('controls.pause'))}
            </Button>
          </Hint>
        </div>

        <AlertDialog>
          <Hint label={t('controls.hold.hint')}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full" disabled={!ready}>
                <OctagonX />
                {t('controls.hold')}
              </Button>
            </AlertDialogTrigger>
          </Hint>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('controls.hold.title')}</AlertDialogTitle>
              <AlertDialogDescription>{t('controls.hold.body')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => engine()?.hold()}>
                {t('controls.hold.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
