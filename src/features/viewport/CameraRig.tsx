import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import CameraControlsImpl from 'camera-controls';
import { Sphere, Vector3 } from 'three';
import type { Engine } from '@/platform/Engine';
import type { MissionDef } from '@/app/missions';
import { useUiStore } from '@/store/ui';
import { SelectionTracker } from './robots';

const ORBIT_POLAR = 0.95;
const AUTO_ORBIT_SPEED = 0.12; // rad/s

/**
 * Camera: drei CameraControls (camera-controls) with three modes —
 *  orbit (free), top (map-style: left drag pans, no tilt), auto (slow azimuth sweep) —
 * and smooth follow of the selected robot or team (fit-to-sphere on selection).
 */
export function CameraRig({ engine, mission }: { engine: Engine; mission: MissionDef }): JSX.Element {
  const controls = useRef<CameraControls>(null);
  const camera = useThree(s => s.camera);
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const mode = useUiStore(s => s.camera);
  const selection = useUiStore(s => s.selection);
  const scratch = useMemo(() => ({ center: new Vector3(), target: new Vector3(), sphere: new Sphere(), tracker: new SelectionTracker() }), []);
  const clock = useRef(0);

  useLayoutEffect(() => {
    const [px, py, pz] = mission.camera.position, [tx, ty, tz] = mission.camera.target;
    controls.current?.setLookAt(px, py, pz, tx, ty, tz, false);
    // Dev-only handles for browser automation (README screenshots, profiling); stripped from production builds.
    if (import.meta.env.DEV) Object.assign(window, { __talosCamera: camera, __talosControls: controls.current, __talosGl: gl, __talosScene: scene });
  }, [mission, camera, gl, scene]);

  // Frame the new selection once; per-frame follow happens in useFrame.
  useEffect(() => {
    const c = controls.current;
    if (!c || !selection) return;
    const r = scratch.tracker.update(engine, selection, clock.current, scratch.center);
    if (r < 0) return;
    scratch.sphere.center.copy(scratch.center);
    scratch.sphere.radius = r;
    void c.fitToSphere(scratch.sphere, true);
  }, [selection, engine, scratch]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const { ACTION } = CameraControlsImpl;
    if (mode === 'top') {
      c.minPolarAngle = 0;
      c.maxPolarAngle = 0;
      c.mouseButtons.left = ACTION.TRUCK;
      c.mouseButtons.right = ACTION.ROTATE;
      c.touches.one = ACTION.TOUCH_TRUCK;
      void c.rotatePolarTo(0, true);
    } else {
      c.minPolarAngle = 0;
      c.maxPolarAngle = 1.48;
      c.mouseButtons.left = ACTION.ROTATE;
      c.mouseButtons.right = ACTION.TRUCK;
      c.touches.one = ACTION.TOUCH_ROTATE;
      if (c.polarAngle < 0.2) void c.rotatePolarTo(ORBIT_POLAR, true);
    }
  }, [mode]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    clock.current += delta;
    const st = useUiStore.getState();
    if (st.selection && scratch.tracker.update(engine, st.selection, clock.current, scratch.center) >= 0) {
      void c.moveTo(scratch.center.x, scratch.center.y, scratch.center.z, true);
    }
    if (st.camera === 'auto') void c.rotate(delta * AUTO_ORBIT_SPEED, 0, true);
    // Gamepad sticks drive relative to the view direction.
    c.getTarget(scratch.target);
    engine.pad.setCameraYaw(Math.atan2(camera.position.y - scratch.target.y, camera.position.x - scratch.target.x));
  });

  return <CameraControls ref={controls} makeDefault minDistance={0.8} maxDistance={mission.mode===5?190:90} maxPolarAngle={1.48} smoothTime={0.22} draggingSmoothTime={0.08} dollySpeed={0.6} />;
}
