import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Matrix4, type InstancedMesh, type Mesh } from 'three';
import type { Engine } from '@/platform/Engine';
import { STRAFER_FOOTPRINT } from '@/robot/TalosRobotAgent';

const PROXY_HEIGHT = 0.32;

/**
 * Shadow proxies. Each Strafer rig is ~100 meshes / 560 k triangles; rendering all of them a second
 * time into the shadow map doubled the frame cost (20 robots ≈ 4 000 draw calls, 22 M triangles).
 * The rigs stop casting; one invisible instanced box per robot (footprint × chassis height) casts
 * instead — one draw call, and from the overhead sun the shadow is indistinguishable.
 */
export function ShadowProxies({ engine }: { engine: Engine }): JSX.Element {
  const proxies = useRef<InstancedMesh>(null);
  const count = engine.agents.length;
  const m = useMemo(() => new Matrix4(), []);

  useLayoutEffect(() => {
    const touched: Mesh[] = [];
    for (const a of engine.agents) a.root.traverse(o => { const mesh = o as Mesh; if (mesh.isMesh && mesh.castShadow) { mesh.castShadow = false; touched.push(mesh); } });
    return () => { for (const mesh of touched) mesh.castShadow = true; };
  }, [engine, count]);

  useFrame(() => {
    const mesh = proxies.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      const p = engine.agents[i].pose;
      m.makeRotationZ(p.theta);
      m.setPosition(p.x, p.y, engine.agents[i].groundZ + PROXY_HEIGHT / 2);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={proxies} args={[undefined, undefined, count]} castShadow frustumCulled={false} raycast={() => null}>
      <boxGeometry args={[STRAFER_FOOTPRINT.halfX * 2, STRAFER_FOOTPRINT.halfY * 2, PROXY_HEIGHT]} />
      {/* Never drawn in the colour pass; the shadow pass uses its own depth material. */}
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </instancedMesh>
  );
}
