import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { translate, useT } from '@/i18n';
import { useUiStore } from '@/store/ui';
import { AppHeader } from './AppHeader';
import { DEFAULT_ROUTE, MISSIONS, legacyModeRoute, type RouteId } from './missions';

// Code-split by mode: three / R3F load with the first mission, Recharts only with the lab.
const MissionPage = lazy(() => import('@/pages/MissionPage'));
const BenchmarkPage = lazy(() => import('@/pages/BenchmarkPage'));

function routeIdOf(pathname: string): RouteId | null {
  if (pathname === '/benchmark') return 'benchmark';
  return MISSIONS.find(m => m.path === pathname)?.id ?? null;
}

/** `/` and old `/?mode=N` links → readable routes. */
function RootRedirect(): JSX.Element {
  const { search } = useLocation();
  return <Navigate to={legacyModeRoute(search) ?? DEFAULT_ROUTE} replace />;
}

function PageSkeleton(): JSX.Element {
  return (
    <div className="flex size-full gap-px bg-border">
      <div className="hidden w-80 shrink-0 space-y-3 bg-panel p-3 lg:block">
        {[140, 200, 260].map(h => <Skeleton key={h} style={{ height: h }} />)}
      </div>
      <div className="flex flex-1 flex-col gap-px">
        <Skeleton className="flex-1 rounded-none bg-viewport" />
        <div className="h-44 bg-panel" />
      </div>
    </div>
  );
}

function NotFound(): JSX.Element {
  const t = useT();
  return (
    <main id="main" className="flex size-full flex-col items-center justify-center gap-3">
      <p className="text-sm font-medium">{t('notFound.title')}</p>
      <Button asChild variant="outline" size="sm"><Link to={DEFAULT_ROUTE}>{t('notFound.back')}</Link></Button>
    </main>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error): { error: Error } { return { error }; }
  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const lang = useUiStore.getState().lang;
    return (
      <div role="alert" className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-6 text-destructive" aria-hidden />
        <p className="text-sm font-medium">{translate(lang, 'error.title')}</p>
        <p className="max-w-md break-words text-xs text-muted-foreground">{this.state.error.message}</p>
        <Button size="sm" variant="outline" onClick={() => location.reload()}>{translate(lang, 'error.reload')}</Button>
      </div>
    );
  }
}

function Shell(): JSX.Element {
  const location = useLocation();
  const current = routeIdOf(location.pathname);
  return (
    <div className="flex h-full flex-col">
      <AppHeader current={current} />
      <div className="relative min-h-0 flex-1">
        <ErrorBoundary key={location.pathname}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="absolute inset-0"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Suspense fallback={<PageSkeleton />}>
                <Routes location={location}>
                  <Route path="/" element={<RootRedirect />} />
                  {MISSIONS.map(m => <Route key={m.id} path={m.path} element={<MissionPage mission={m} />} />)}
                  <Route path="/benchmark" element={<BenchmarkPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </div>
    </div>
  );
}

/** Theme class and document language follow the UI store. */
function useDocumentPreferences(): void {
  const theme = useUiStore(s => s.theme);
  const lang = useUiStore(s => s.lang);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `TALOS · ${translate(lang, 'app.tagline')}`;
  }, [lang]);
}

export function App(): JSX.Element {
  useDocumentPreferences();
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TooltipProvider delayDuration={350} skipDelayDuration={150}>
        <Shell />
      </TooltipProvider>
    </BrowserRouter>
  );
}
