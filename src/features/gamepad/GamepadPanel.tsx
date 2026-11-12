import { Gamepad2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { usePadSnapshot } from '@/features/sim/pad';
import type { XboxButton } from '@/contracts/types';
import { KeyboardHint } from './KeyboardHint';

const FACE: readonly { b: XboxButton; cls: string; pos: string }[] = [
  { b: 'Y', cls: 'data-[on=true]:bg-warning data-[on=true]:text-black', pos: 'col-start-2 row-start-1' },
  { b: 'X', cls: 'data-[on=true]:bg-info data-[on=true]:text-black', pos: 'col-start-1 row-start-2' },
  { b: 'B', cls: 'data-[on=true]:bg-destructive data-[on=true]:text-white', pos: 'col-start-3 row-start-2' },
  { b: 'A', cls: 'data-[on=true]:bg-success data-[on=true]:text-black', pos: 'col-start-2 row-start-3' },
];
const DPAD: readonly { b: XboxButton; pos: string; label: string }[] = [
  { b: 'DPAD_UP', pos: 'col-start-2 row-start-1', label: '▲' },
  { b: 'DPAD_LEFT', pos: 'col-start-1 row-start-2', label: '◀' },
  { b: 'DPAD_RIGHT', pos: 'col-start-3 row-start-2', label: '▶' },
  { b: 'DPAD_DOWN', pos: 'col-start-2 row-start-3', label: '▼' },
];

/** Right panel: compact controller visualisation, or a one-line hint when no gamepad is present. */
export function GamepadPanel({ onClose }: { onClose?: () => void }): JSX.Element {
  const t = useT();
  const s = usePadSnapshot();
  const on = (b: XboxButton): boolean => s.pressed.includes(b);

  return (
    <aside aria-labelledby="gamepad-title" className="flex h-full flex-col bg-panel">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Gamepad2 className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="gamepad-title" className="text-sm font-semibold">{t('gamepad.title')}</h2>
        <Badge tone={s.connected ? 'success' : 'neutral'} dot>{s.connected ? t('header.gamepadOn') : t('header.gamepadOff')}</Badge>
        <span className="ml-auto" />
        <KeyboardHint />
        {onClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('gamepad.close')}><X /></Button>}
      </header>

      {!s.connected ? (
        <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <Gamepad2 className="size-4 shrink-0" aria-hidden />
          <p>{t('gamepad.missing')}</p>
        </div>
      ) : (
        <div className="space-y-4 overflow-y-auto p-3">
          <p className="truncate text-2xs text-muted-foreground" title={s.id ?? undefined}>{s.id}</p>

          <div className="grid grid-cols-2 gap-3">
            <Trigger label="LT" value={s.leftTrigger} bumper={on('LB')} bumperLabel="LB" />
            <Trigger label="RT" value={s.rightTrigger} bumper={on('RB')} bumperLabel="RB" />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Stick label={t('gamepad.leftStick')} x={s.leftStickRaw.x} y={s.leftStickRaw.y} pressed={on('LS')} />
            <div className="grid grid-cols-3 grid-rows-3 gap-0.5">
              {DPAD.map(d => (
                <span key={d.b} data-on={on(d.b)} className={cn('flex size-5 items-center justify-center rounded-sm bg-muted text-[9px] text-muted-foreground data-[on=true]:bg-primary data-[on=true]:text-primary-foreground', d.pos)} aria-hidden>{d.label}</span>
              ))}
            </div>
            <div className="grid grid-cols-3 grid-rows-3 gap-0.5" aria-hidden>
              {FACE.map(f => (
                <span key={f.b} data-on={on(f.b)} className={cn('flex size-6 items-center justify-center rounded-full border bg-muted text-2xs font-semibold text-muted-foreground transition-colors', f.cls, f.pos)}>{f.b}</span>
              ))}
            </div>
            <Stick label={t('gamepad.rightStick')} x={s.rightStickRaw.x} y={s.rightStickRaw.y} pressed={on('RS')} />
          </div>

          <div className="flex justify-center gap-2" aria-hidden>
            {(['BACK', 'GUIDE', 'START'] as const).map(b => (
              <span key={b} data-on={on(b)} className="rounded-full border bg-muted px-2 py-px text-[10px] text-muted-foreground data-[on=true]:bg-primary data-[on=true]:text-primary-foreground">{b}</span>
            ))}
          </div>

          <Separator />
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <Stat label={t('gamepad.focus')} value={s.focus.kind === 'agent' ? `#${s.focus.agentId}` : s.focus.teamId} />
            <Stat label={t('experiment.controller')} value={s.controller} />
            <Stat label={t('gamepad.power')} value={`${Math.round(s.powerLimit * 100)}%`} />
          </dl>
          <p className="text-2xs leading-4 text-muted-foreground">{t('gamepad.mapping')}</p>
        </div>
      )}
    </aside>
  );
}

function Stick({ label, x, y, pressed }: { label: string; x: number; y: number; pressed: boolean }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role="img"
        aria-label={`${label}: ${x.toFixed(2)}, ${y.toFixed(2)}`}
        className={cn('relative size-14 rounded-full border bg-muted/60', pressed && 'border-primary')}
      >
        <span className="absolute inset-1/2 size-px bg-border" aria-hidden />
        <span
          className="absolute left-1/2 top-1/2 size-4 rounded-full bg-primary shadow transition-transform duration-75"
          style={{ transform: `translate(calc(-50% + ${x * 20}px), calc(-50% + ${-y * 20}px))` }}
          aria-hidden
        />
      </div>
      <span className="text-2xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Trigger({ label, value, bumper, bumperLabel }: { label: string; value: number; bumper: boolean; bumperLabel: string }): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-2xs">
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{label}</span>
          <span data-on={bumper} className="rounded-sm bg-muted px-1 text-[10px] text-muted-foreground data-[on=true]:bg-primary data-[on=true]:text-primary-foreground">{bumperLabel}</span>
        </span>
        <span className="num text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(value.toFixed(2))}>
        <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md border bg-card px-2 py-1.5">
      <dt className="caption truncate">{label}</dt>
      <dd className="num truncate text-sm">{value}</dd>
    </div>
  );
}
