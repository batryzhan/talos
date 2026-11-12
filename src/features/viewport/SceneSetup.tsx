import { Component, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, SoftShadows } from '@react-three/drei';
import { Color, Fog, GridHelper, type LineBasicMaterial } from 'three';
import { useMemo } from 'react';
import type { MissionDef } from '@/app/missions';
import { useUiStore } from '@/store/ui';
import { scenePalette } from './palette';

/** HDR environments are Y-up; the simulation world is Z-up. */
const Z_UP: [number, number, number] = [Math.PI / 2, 0, 0];

/** Background, fog, key + fill light and image-based lighting for one mission. */
export function SceneSetup({ mission }: { mission: MissionDef }): JSX.Element {
  const theme = useUiStore(s => s.theme);
  const scene = useThree(s => s.scene);
  const palette = scenePalette(theme);

  useLayoutEffect(() => {
    const sky = mission.sky === undefined ? palette.viewport : new Color(mission.sky);
    scene.background = sky;
    scene.fog = new Fog(sky, mission.fog[0], mission.fog[1]);
    return () => { scene.fog = null; scene.background = null; };
  }, [scene, palette, mission.fog, mission.sky]);
  const e = mission.shadowExtent;

  return (
    <>
      <SoftShadows size={18} samples={10} focus={0.4} />
      <directionalLight
        castShadow
        position={[...mission.sunPosition]}
        intensity={mission.sun}
        color="#ffe9cf"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.025}
      >
        <orthographicCamera attach="shadow-camera" args={[-e, e, e, -e, 1, e * 3.4]} />
      </directionalLight>
      <hemisphereLight args={['#c4d2df', '#49443d', mission.hemisphere * 0.7]} />
      {mission.ibl === 'studio' && <StudioEnvironment />}
      {mission.ibl === 'warehouse' && (
        <EnvironmentBoundary fallback={<StudioEnvironment />}>
          <Suspense fallback={<StudioEnvironment />}>
            <Environment preset="warehouse" environmentIntensity={0.35} environmentRotation={Z_UP} />
          </Suspense>
        </EnvironmentBoundary>
      )}
    </>
  );
}

/** Offline fallback: a procedural studio environment built from light-formers (no network). */
function StudioEnvironment(): JSX.Element {
  return (
    <Environment resolution={128} environmentIntensity={0.5} environmentRotation={Z_UP}>
      <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[-6, 2, -4]} rotation-y={Math.PI / 3} scale={[6, 3, 1]} />
      <Lightformer form="rect" intensity={0.8} position={[6, 2, 4]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
    </Environment>
  );
}

/** HDRI presets come from a CDN; if that fails the procedural studio takes over silently. */
class EnvironmentBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Calibration pad: shadow-receiving floor, 0.5 m / 5 m grid and contact shadows under the robot. */
export function LabFloor(): JSX.Element {
  const theme = useUiStore(s => s.theme);
  const palette = scenePalette(theme);
  const [minor, major] = useMemo(() => {
    const make = (divisions: number, color: typeof palette.grid, opacity: number): GridHelper => {
      const g = new GridHelper(40, divisions, color, color);
      g.rotation.x = Math.PI / 2;
      g.position.z = 0.002;
      const m = g.material as LineBasicMaterial;
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
      return g;
    };
    return [make(80, palette.gridMajor, 0.14), make(8, palette.gridMajor, 0.4)];
  }, [palette]);

  return (
    <>
      <mesh receiveShadow position={[0, 0, -0.001]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={palette.viewport} roughness={0.95} metalness={0} />
      </mesh>
      <primitive object={minor} />
      <primitive object={major} />
      <ContactShadows rotation-x={Math.PI / 2} position={[-7, -5, 0.004]} scale={8} resolution={512} far={1.2} blur={2.2} opacity={0.55} frames={Infinity} />
    </>
  );
}
