import { Link, NavLink } from 'react-router-dom';
import { Gamepad2, Languages, Moon, PanelLeft, Settings2, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Hint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/lib/use-media-query';
import { useUiStore, type Lang } from '@/store/ui';
import type { ThemeName } from '@/design/tokens';
import { usePadValue } from '@/features/sim/pad';
import { LOGO_URL } from '@/robot/logo';
import { NAV_ITEMS, type RouteId } from './missions';

function Logo(): JSX.Element {
  // The mark is an alpha mask, so it follows the theme colour (dark and light).
  const url = `url(${LOGO_URL})`;
  return (
    <span
      aria-hidden
      className="inline-block size-6 bg-primary"
      style={{ WebkitMaskImage: url, maskImage: url, WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' }}
    />
  );
}

/** App header: logo, mode tabs (readable names + tooltip hints), panel toggles, theme / language. */
export function AppHeader({ current }: { current: RouteId | null }): JSX.Element {
  const t = useT();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const theme = useUiStore(s => s.theme);
  const lang = useUiStore(s => s.lang);
  const leftOpen = useUiStore(s => s.leftOpen);
  const rightOpen = useUiStore(s => s.rightOpen);
  const { setTheme, setLang, setLeftOpen, setRightOpen, setMobileLeftOpen } = useUiStore.getState();
  const connected = usePadValue(s => s.connected);
  const mission = current !== null && current !== 'benchmark';

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-panel px-2 sm:px-3">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground">{t('app.skipToContent')}</a>
      {mission && (
        <Hint label={t(desktop ? 'header.toggleSidebar' : 'header.openSidebar')} side="bottom">
          <Button
            variant="ghost" size="icon-sm"
            aria-label={t(desktop ? 'header.toggleSidebar' : 'header.openSidebar')}
            aria-pressed={desktop ? leftOpen : undefined}
            onClick={() => (desktop ? setLeftOpen(!leftOpen) : setMobileLeftOpen(true))}
          >
            <PanelLeft />
          </Button>
        </Hint>
      )}
      <Link to="/" className="flex items-center gap-2 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Logo />
        <span className="text-sm font-semibold tracking-[0.12em]">{t('app.name')}</span>
      </Link>
      <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />

      <nav aria-label={t('nav.label')} className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
        <Tabs value={current ?? ''} activationMode="manual">
          <TabsList className="bg-transparent p-0">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <TabsTrigger value={item.id} asChild className="data-[state=active]:bg-accent data-[state=active]:shadow-none">
                      <NavLink to={item.path} aria-label={t(item.label)}>
                        <Icon aria-hidden />
                        <span className={cn('hidden md:inline', current === item.id && 'inline')}>{t(item.label)}</span>
                      </NavLink>
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t(item.hint)}</TooltipContent>
                </Tooltip>
              );
            })}
          </TabsList>
        </Tabs>
      </nav>

      {mission && (
        <Hint label={connected ? t('header.gamepadOn') : t('header.gamepadOff')} side="bottom">
          <Button variant="ghost" size="icon-sm" className="relative" aria-label={t('header.gamepad')} aria-pressed={rightOpen} onClick={() => setRightOpen(!rightOpen)}>
            <Gamepad2 />
            <span className={cn('absolute right-1 top-1 size-1.5 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/50')} aria-hidden />
          </Button>
        </Hint>
      )}
      <DropdownMenu>
        <Hint label={t('header.settings')} side="bottom">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('header.settings')}><Settings2 /></Button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('header.theme')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={v => setTheme(v as ThemeName)}>
            <DropdownMenuRadioItem value="dark"><Moon />{t('header.theme.dark')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light"><Sun />{t('header.theme.light')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-1.5"><Languages className="size-3" aria-hidden />{t('header.language')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={lang} onValueChange={v => setLang(v as Lang)}>
            <DropdownMenuRadioItem value="ru">Русский</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="kk">Қазақша</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
