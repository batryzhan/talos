import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import type { Engine } from '@/platform/Engine';
import type { MissionDef } from '@/app/missions';
import { useT } from '@/i18n';
import { useUiStore } from '@/store/ui';
import { useSim } from '@/features/sim/simStore';
import { LabFloor, SceneSetup } from './SceneSetup';
import { FrameProbe, SimulationDriver } from './SimulationDriver';
import { CameraRig } from './CameraRig';
import { RobotPicking } from './RobotPicking';
import { ShadowProxies } from './ShadowProxies';
import { EngineeringOverlay } from './EngineeringOverlay';
import { TeamLabels } from './TeamLabels';
import { Effects } from './Effects';
import { ViewportHud, ViewportLoading, ViewportError } from './ViewportHud';
import { WorkflowBadges } from './WorkflowBadges';
import { CalibrationOverlay } from './CalibrationOverlay';


function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** The 3D viewport of a mission: R3F canvas + light HUD, loading and error states. */
export function Viewport({ engine, mission }: { engine: Engine; mission: MissionDef }): JSX.Element {
  const t = useT();
  const scope = useRef<HTMLDivElement>(null);
  const supported = useMemo(webglAvailable, []);
  const overlay = useUiStore(s => s.overlay);
  const phase = useSim(s => s.phase);
  const teams = useSim(useShallow(s => s.teams.map(team => team.id)));

  // Tab cycles teams only while keyboard focus is inside the viewport.
  useEffect(() => {
    engine.keyboardScope = scope.current;
    return () => { engine.keyboardScope = null; };
  }, [engine]);

  const ready = phase === 'ready';
  const payloadTeams = teams.filter(id => engine.loads.some(l => l.spec.teamId === id));

  return (
    <div
      ref={scope}
      tabIndex={0}
      role="application"
      aria-label={t('viewport.label')}
      data-keyboard-scope="sim"
      className="relative size-full overflow-hidden bg-viewport outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {supported ? (
        <Canvas
          shadows
          flat
          dpr={[1, 1.75]}
          gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
          camera={{ fov: 45, near: 0.05, far: 320, up: [0, 0, 1], position: [...mission.camera.position] }}
          onPointerMissed={() => useUiStore.getState().select(null)}
        >
          <SimulationDriver engine={engine} />
          <FrameProbe />
          <SceneSetup mission={mission} />
          {(mission.mode === 0) && <LabFloor />}
          <primitive object={engine.scene} />
          {ready && engine.workflow && <WorkflowBadges engine={engine} />}
          <CameraRig engine={engine} mission={mission} />
          {ready && engine.agents.length > 0 && <ShadowProxies key={`shadow-${engine.agents.length}`} engine={engine} />}
          {ready && <RobotPicking key={`pick-${engine.agents.length}`} engine={engine} />}
          {ready && overlay && <EngineeringOverlay engine={engine} />}
          {ready && engine.calibration && <CalibrationOverlay engine={engine} />}
          {ready && payloadTeams.length > 0 && <TeamLabels engine={engine} teams={payloadTeams} />}
          <Effects />
        </Canvas>
      ) : (
        <div className="flex size-full items-center justify-center p-6">
          <p className="max-w-sm text-center text-sm text-muted-foreground">{t('viewport.noWebgl')}</p>
        </div>
      )}
      <ViewportHud />
      <ViewportLoading />
      <ViewportError />
    </div>
  );
}
