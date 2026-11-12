import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';

const KEYS: readonly { keys: string[]; label: MessageKey }[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'gamepad.keys.move' },
  { keys: ['Q', 'E'], label: 'gamepad.keys.turn' },
  { keys: ['Z', 'X'], label: 'gamepad.keys.lift' },
  { keys: ['Space'], label: 'gamepad.keys.hold' },
  { keys: ['Enter'], label: 'gamepad.keys.confirm' },
  { keys: ['Tab'], label: 'gamepad.keys.team' },
  { keys: ['C'], label: 'gamepad.keys.camera' },
];

export function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-b-2 bg-muted px-1 font-mono text-2xs text-foreground">{children}</kbd>;
}

export function KeyboardShortcuts(): JSX.Element {
  const t = useT();
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
      {KEYS.map(k => (
        <div key={k.label} className="contents">
          <dt className="flex gap-0.5">{k.keys.map(key => <Kbd key={key}>{key}</Kbd>)}</dt>
          <dd className="text-xs text-muted-foreground">{t(k.label)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Keyboard icon with the shortcut cheat-sheet in a tooltip. */
export function KeyboardHint({ side = 'left', className }: { side?: 'left' | 'top' | 'bottom' | 'right'; className?: string }): JSX.Element {
  const t = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('gamepad.keyboard')} className={className}>
          <Keyboard />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-none p-3">
        <p className="caption mb-2">{t('gamepad.keyboard')}</p>
        <KeyboardShortcuts />
      </TooltipContent>
    </Tooltip>
  );
}
