import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { motion } from 'framer-motion';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/i18n';
import { useMediaQuery, useWindowSize } from '@/lib/use-media-query';
import type { MissionDef } from '@/app/missions';
import { useUiStore } from '@/store/ui';
import { useEngineSession } from '@/features/sim/useEngineSession';
import { Viewport } from '@/features/viewport/Viewport';
import { TelemetryDock } from '@/features/telemetry/TelemetryDock';
import { ScenarioCard } from '@/features/controls/ScenarioCard';
import { ControlCard } from '@/features/controls/ControlCard';
import { ExperimentCard } from '@/features/controls/ExperimentCard';
import { LogCard } from '@/features/log/LogCard';
import { GamepadPanel } from '@/features/gamepad/GamepadPanel';

const RescueScenarioCard=lazy(()=>import('@/features/rescue/RescueScenarioCard'));

const HEADER_PX = 44;
const LEFT_PX = 320;
const RIGHT_PX = 300;
const DOCK_PX = 180;
const DOCK_BAR_PX = 36;

function MissionSidebar({ mission }: { mission: MissionDef }): JSX.Element {
  return (
    <ScrollArea className="h-full bg-panel">
      <motion.div
        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex flex-col gap-3 p-3"
      >
        {mission.mode===5?<Suspense fallback={<Skeleton className="h-48" />}><RescueScenarioCard /></Suspense>:<ScenarioCard mission={mission} />}
        <ControlCard metamorphic={mission.mode === 4} rescue={mission.mode===5} />
        <ExperimentCard mode={mission.mode} />
        <LogCard missionId={mission.id} />
      </motion.div>
    </ScrollArea>
  );
}

/** Mission screen: scenario sidebar | 3D viewport over the telemetry dock | gamepad panel. */
export default function MissionPage({ mission }: { mission: MissionDef }): JSX.Element {
  const t = useT();
  useLayoutEffect(() => { useUiStore.getState().enterMission(); }, [mission.id]);
  const engine = useEngineSession(mission);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const { width, height } = useWindowSize();
  const leftOpen = useUiStore(s => s.leftOpen);
  const rightOpen = useUiStore(s => s.rightOpen);
  const bottomOpen = useUiStore(s => s.bottomOpen);
  const mobileLeftOpen = useUiStore(s => s.mobileLeftOpen);
  const { setRightOpen, setBottomOpen, setMobileLeftOpen } = useUiStore.getState();
  const dock = useRef<ImperativePanelHandle>(null);

  const pctW = (px: number): number => Math.min(60, (px / Math.max(width, 1)) * 100);
  const bodyH = Math.max(height - HEADER_PX, 1);
  const pctH = (px: number): number => Math.min(80, (px / bodyH) * 100);

  useEffect(() => {
    const p = dock.current;
    if (!p) return;
    if (bottomOpen && p.isCollapsed()) p.expand();
    if (!bottomOpen && !p.isCollapsed()) p.collapse();
  }, [bottomOpen]);

  const viewport = engine
    ? <Viewport engine={engine} mission={mission} />
    : <Skeleton className="size-full rounded-none bg-viewport" />;

  const center = (
    <ResizablePanelGroup direction="vertical">
      <ResizablePanel id="viewport" order={1} minSize={30}>
        <main id="main" className="size-full">{viewport}</main>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        id="dock" order={2} ref={dock}
        defaultSize={bottomOpen ? pctH(DOCK_PX) : pctH(DOCK_BAR_PX)}
        minSize={pctH(120)} maxSize={65}
        collapsible collapsedSize={pctH(DOCK_BAR_PX)}
        onCollapse={() => setBottomOpen(false)} onExpand={() => setBottomOpen(true)}
      >
        <TelemetryDock collapsed={!bottomOpen} onToggle={() => setBottomOpen(!bottomOpen)} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );

  if (!desktop) {
    return (
      <div className="size-full">
        {center}
        <Sheet open={mobileLeftOpen} onOpenChange={setMobileLeftOpen}>
          <SheetContent side="left" className="p-0" closeLabel={t('common.close')}>
            <SheetTitle className="sr-only">{t('scenario.title')}</SheetTitle>
            <SheetDescription className="sr-only">{t(mission.description)}</SheetDescription>
            <MissionSidebar mission={mission} />
          </SheetContent>
        </Sheet>
        <Sheet open={rightOpen} onOpenChange={setRightOpen}>
          <SheetContent side="right" className="p-0" closeLabel={t('common.close')}>
            <SheetTitle className="sr-only">{t('gamepad.title')}</SheetTitle>
            <SheetDescription className="sr-only">{t('gamepad.mapping')}</SheetDescription>
            <GamepadPanel />
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal">
      {leftOpen && (
        <>
          <ResizablePanel id="left" order={1} defaultSize={pctW(LEFT_PX)} minSize={pctW(260)} maxSize={pctW(480)}>
            <MissionSidebar mission={mission} />
          </ResizablePanel>
          <ResizableHandle />
        </>
      )}
      <ResizablePanel id="center" order={2} minSize={35}>
        {center}
      </ResizablePanel>
      {rightOpen && (
        <>
          <ResizableHandle />
          <ResizablePanel id="right" order={3} defaultSize={pctW(RIGHT_PX)} minSize={pctW(240)} maxSize={pctW(420)}>
            <motion.div className="h-full" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
              <GamepadPanel onClose={() => setRightOpen(false)} />
            </motion.div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
