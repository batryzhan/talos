import { useId } from 'react';
import { FlaskConical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT, type MessageKey } from '@/i18n';
import { POWER_LIMITS, useUiStore, type CameraMode } from '@/store/ui';
import type { ControllerKind } from '@/contracts/types';

const CONTROLLERS: readonly { value: ControllerKind; label: MessageKey }[] = [
  { value: 'A', label: 'experiment.controller.A' },
  { value: 'B', label: 'experiment.controller.B' },
  { value: 'C', label: 'experiment.controller.C' },
];
const CAMERAS: readonly { value: CameraMode; label: MessageKey }[] = [
  { value: 'orbit', label: 'experiment.camera.orbit' },
  { value: 'top', label: 'experiment.camera.top' },
  { value: 'auto', label: 'experiment.camera.auto' },
];
const MAX_LOSS = 0.3;

/** Lift-team controller selector (A / B / C). */
export function ControllerSelect({ disabled }: { disabled?: boolean }): JSX.Element {
  const t = useT();
  const id = useId();
  const controller = useUiStore(s => s.controller);
  const setController = useUiStore(s => s.setController);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="caption">{t('experiment.controller')}</Label>
      <Select value={controller} onValueChange={v => setController(v as ControllerKind)} disabled={disabled}>
        <SelectTrigger id={id} aria-label={t('experiment.controller')}><SelectValue /></SelectTrigger>
        <SelectContent>
          {CONTROLLERS.map(c => <SelectItem key={c.value} value={c.value}>{t(c.label)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Controller, radio loss, engineering overlay, camera mode and speed limit. */
export function ExperimentCard({ mode }: { mode: number }): JSX.Element {
  const t = useT();
  const lossId = useId(), overlayId = useId(), overlayHint = useId();
  const lossP = useUiStore(s => s.lossP);
  const overlay = useUiStore(s => s.overlay);
  const camera = useUiStore(s => s.camera);
  const powerLimit = useUiStore(s => s.powerLimit);
  const { setLossP, setOverlay, setCamera, setPowerLimit } = useUiStore.getState();
  const teams = mode === 1 || mode === 2 || mode===5;
  const learning=useUiStore(s=>s.routeLearning);
  const radio = mode !== 0;

  return (
    <Card>
      <CardHeader><CardTitle><FlaskConical aria-hidden />{t('experiment.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {teams && <ControllerSelect />}

        {radio && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor={lossId} className="caption">{t('experiment.loss')}</Label>
              <span className="num text-xs">{Math.round(lossP * 100)}%</span>
            </div>
            <Slider
              id={lossId}
              min={0} max={MAX_LOSS * 100} step={1}
              value={[Math.round(Math.min(lossP, MAX_LOSS) * 100)]}
              onValueChange={([v]) => setLossP(v / 100)}
              thumbLabel={t('experiment.loss')}
            />
            <p className="text-2xs text-muted-foreground">{t('experiment.loss.hint')}</p>
          </div>
        )}

        {mode===5&&<div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5"><Label htmlFor={`${overlayId}-learn`}>{t('experiment.learning')}: {learning?'вкл':'выкл'}</Label><p className="text-2xs text-muted-foreground">{t('experiment.learning.hint')}</p></div>
          <Switch id={`${overlayId}-learn`} checked={learning} onCheckedChange={useUiStore.getState().setRouteLearning} />
        </div>}
        {teams && (
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor={overlayId}>{t('experiment.overlay')}</Label>
              <p id={overlayHint} className="text-2xs text-muted-foreground">{t('experiment.overlay.hint')}</p>
            </div>
            <Switch id={overlayId} checked={overlay} onCheckedChange={setOverlay} aria-describedby={overlayHint} />
          </div>
        )}

        <div className="space-y-1.5">
          <span className="caption block" id={`${overlayId}-camera`}>{t('experiment.camera')}</span>
          <ToggleGroup type="single" className="w-full" value={camera} onValueChange={v => v && setCamera(v as CameraMode)} aria-labelledby={`${overlayId}-camera`}>
            {CAMERAS.map(c => <ToggleGroupItem key={c.value} value={c.value}>{t(c.label)}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>

        <div className="space-y-1.5">
          <span className="caption block" id={`${overlayId}-speed`}>{t('experiment.speed')}</span>
          <ToggleGroup type="single" className="w-full" value={String(powerLimit)} onValueChange={v => v && setPowerLimit(Number(v))} aria-labelledby={`${overlayId}-speed`}>
            {POWER_LIMITS.map(p => <ToggleGroupItem key={p} value={String(p)} className="num">{p * 100}%</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </CardContent>
    </Card>
  );
}
