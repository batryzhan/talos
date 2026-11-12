import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Matrix4, type Group, type InstancedMesh, type Mesh } from 'three';
import type { Engine } from '@/platform/Engine';
import { useUiStore } from '@/store/ui';
import { scenePalette } from './palette';
import { readRobotPose, robotCount, robotIdAt, robotIndexOf, type MutablePoseZ } from './robots';
import { RobotTooltip } from './RobotTooltip';

/**
 * Invisible instanced hit-boxes (one draw call, one raycast target) instead of raycasting the
 * detailed robot rigs; plus hover / selection rings on the floor and the hover tooltip.
 */
export function RobotPicking({ engine }: { engine: Engine }): JSX.Element {
  const count = robotCount(engine);
  const hits = useRef<InstancedMesh>(null);
  const hoverRing = useRef<Mesh>(null);
  const selectRing = useRef<Mesh>(null);
  const tooltip = useRef<Group>(null);
  const hovered = useUiStore(s => s.hovered);
  const theme = useUiStore(s => s.theme);
  const palette = scenePalette(theme);
  const scratch = useMemo(() => ({ m: new Matrix4(), pose: { x: 0, y: 0, theta: 0, z: 0 } as MutablePoseZ }), []);

  useFrame(() => {
    const mesh = hits.current;
    if (!mesh) return;
    const { m, pose } = scratch;
    for (let i = 0; i < count; i++) {
      if (!readRobotPose(engine, i, pose)) continue;
      m.makeRotationZ(pose.theta);
      m.setPosition(pose.x, pose.y, pose.z + 0.2);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null; // recomputed lazily on the next raycast

    const st = useUiStore.getState();
    placeRing(hoverRing.current, st.hovered !== null && !(st.selection?.kind === 'agent' && st.selection.id === st.hovered) ? st.hovered : null);
    placeRing(selectRing.current, st.selection?.kind === 'agent' ? st.selection.id : null);
    if (tooltip.current && st.hovered !== null && readRobotPose(engine, robotIndexOf(engine, st.hovered), pose)) {
      tooltip.current.position.set(pose.x, pose.y, pose.z + 0.62);
    }
  });

  function placeRing(ring: Mesh | null, id: number | null): void {
    if (!ring) return;
    const ok = id !== null && readRobotPose(engine, robotIndexOf(engine, id), scratch.pose);
    ring.visible = ok;
    if (ok) ring.position.set(scratch.pose.x, scratch.pose.y, scratch.pose.z + 0.006);
  }

  const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>): number | null =>
    e.instanceId === undefined || e.instanceId >= count ? null : robotIdAt(engine, e.instanceId);

  return (
    <>
      <instancedMesh
        ref={hits}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        onPointerMove={e => {
          e.stopPropagation();
          const id = idOf(e);
          if (id !== useUiStore.getState().hovered) useUiStore.getState().hover(id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          useUiStore.getState().hover(null);
          document.body.style.cursor = '';
        }}
        onClick={e => {
          e.stopPropagation();
          const id = idOf(e);
          if (id !== null) useUiStore.getState().select({ kind: 'agent', id });
        }}
      >
        <boxGeometry args={[0.5, 0.56, 0.42]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>

      <mesh ref={hoverRing} visible={false} renderOrder={2}>
        <ringGeometry args={[0.44, 0.48, 48]} />
        <meshBasicMaterial color={palette.muted} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={selectRing} visible={false} renderOrder={2}>
        <ringGeometry args={[0.43, 0.5, 48]} />
        <meshBasicMaterial color={palette.primary} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
      </mesh>

      {hovered !== null && (
        <group ref={tooltip}>
          <Html center zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
            <RobotTooltip id={hovered} />
          </Html>
        </group>
      )}
    </>
  );
}
