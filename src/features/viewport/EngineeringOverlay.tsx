import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, ConeGeometry, DoubleSide, Matrix4, Object3D, SphereGeometry, type InstancedMesh, type Mesh, type MeshBasicMaterial } from 'three';

type FillMesh = Mesh<BufferGeometry, MeshBasicMaterial>;
import type { Engine } from '@/platform/Engine';
import { stability } from '@/physics/M1';
import { useUiStore } from '@/store/ui';
import { scenePalette, type ScenePalette } from './palette';
import { LinePool, type LinePoolHandle } from './LinePool';

/** Overlay refresh rate: the radio rate (20 Hz) — the data it shows changes no faster than that. */
const UPDATE_PERIOD = 1 / 20;
const LINES = 192;
const VECTORS = 48;
const MARKERS = 96;
const PACKETS = 64;
const MAX_LOADS = 8;
const MAX_HULL = 24;
/** Newton → metre scale of reaction vectors (180 N = 1 m). */
const FORCE_SCALE = 1 / 180;
/** A link whose freshest packet is older than this is drawn fully faded. */
const LINK_STALE_S = 0.5;
const LINK_Z = 0.62;

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * CAD-style engineering layer (drawn on top of the scene, like a GIS layer):
 *  - support polygon (translucent fill + outline; green when stable, red when ρ < 0) and CoM → nearest edge;
 *  - support reaction vectors with arrowheads (info → amber above 80 % of F_allow → red above F_allow);
 *  - ring radio links whose brightness tracks packet freshness, with packets travelling along them;
 *  - docking link in the factory (green once mated).
 * Everything is pooled; the frame loop only writes into preallocated buffers.
 */
export function EngineeringOverlay({ engine }: { engine: Engine }): JSX.Element {
  const theme = useUiStore(s => s.theme);
  const palette = scenePalette(theme);
  const lines = useRef<LinePoolHandle>(null);
  const vectors = useRef<LinePoolHandle>(null);
  const markers = useRef<InstancedMesh>(null);
  const arrows = useRef<InstancedMesh>(null);
  const packets = useRef<InstancedMesh>(null);
  const fills = useRef<(FillMesh | null)[]>([]);
  const timer = useRef(UPDATE_PERIOD);
  const clock = useRef(0);

  const res = useMemo(() => {
    const fillGeometries = Array.from({ length: MAX_LOADS }, () => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(MAX_HULL * 3), 3));
      const index: number[] = [];
      for (let i = 1; i < MAX_HULL - 1; i++) index.push(0, i, i + 1);
      g.setIndex(index);
      g.setDrawRange(0, 0);
      return g;
    });
    const cone = new ConeGeometry(0.045, 0.12, 12);
    cone.rotateX(Math.PI / 2); // tip along +Z
    return {
      fillGeometries,
      cone,
      sphere: new SphereGeometry(1, 12, 8),
      dummy: new Object3D(),
      color: new Color(),
      packetLinks: new Float32Array(PACKETS * 4), // x0, y0, x1, y1 per packet
      packetCount: 0,
    };
  }, []);

  useLayoutEffect(() => () => {
    res.fillGeometries.forEach(g => g.dispose());
    res.cone.dispose();
    res.sphere.dispose();
  }, [res]);

  useFrame((_, delta) => {
    clock.current += delta;
    timer.current += delta;
    if (timer.current >= UPDATE_PERIOD) {
      timer.current = 0;
      rebuild(engine, palette, res, lines.current, vectors.current, markers.current, arrows.current, fills.current);
    }
    animatePackets(res, packets.current, clock.current, palette);
  });

  return (
    <group>
      {res.fillGeometries.map((g, i) => (
        <mesh key={i} ref={el => { fills.current[i] = el as FillMesh | null; }} geometry={g} renderOrder={1} position-z={0.012}>
          <meshBasicMaterial color={palette.success} transparent opacity={0.16} depthWrite={false} depthTest={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      <LinePool ref={lines} limit={LINES} lineWidth={1.8} opacity={0.95} />
      <LinePool ref={vectors} limit={VECTORS} lineWidth={3} />
      <instancedMesh ref={markers} args={[res.sphere, undefined, MARKERS]} frustumCulled={false} renderOrder={4}>
        <meshBasicMaterial toneMapped={false} depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={arrows} args={[res.cone, undefined, VECTORS]} frustumCulled={false} renderOrder={4}>
        <meshBasicMaterial toneMapped={false} depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={packets} args={[res.sphere, undefined, PACKETS]} frustumCulled={false} renderOrder={4}>
        <meshBasicMaterial toneMapped={false} depthTest={false} />
      </instancedMesh>
    </group>
  );
}

type Res = {
  fillGeometries: BufferGeometry[];
  dummy: Object3D;
  color: Color;
  packetLinks: Float32Array;
  packetCount: number;
};


function rebuild(
  e: Engine, pal: ScenePalette, res: Res,
  lines: LinePoolHandle | null, vectors: LinePoolHandle | null,
  markers: InstancedMesh | null, arrows: InstancedMesh | null, fills: (FillMesh | null)[],
): void {
  let li = 0, mi = 0, vi = 0, pi = 0;
  const { dummy, color } = res;
  const marker = (x: number, y: number, z: number, r: number, c: Color): void => {
    if (!markers || mi >= MARKERS) return;
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(r);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    markers.setMatrixAt(mi, dummy.matrix);
    markers.setColorAt(mi, c);
    mi++;
  };

  if (e.ready && !e.metamorphic) {
    for (let k = 0; k < e.loads.length && k < MAX_LOADS; k++) {
      const load = e.loads[k], mgr = e.fleet.team(load.spec.teamId);
      const fill = fills[k];
      if (!mgr) { if (fill) fill.visible = false; continue; }
      const inputs = mgr.getSupportContactInputs();
      const com = load.physics.state.com;
      const d = stability(inputs.map(s => s.pad), com);
      const ok = d.rho >= 0;
      const tone = ok ? pal.success : pal.destructive;

      // Support polygon: translucent fill + outline + vertices.
      const n = Math.min(d.hull.length, MAX_HULL);
      if (fill) {
        fill.visible = n >= 3;
        const g = fill.geometry, pos = g.getAttribute('position') as BufferAttribute;
        for (let i = 0; i < n; i++) pos.setXYZ(i, d.hull[i].x, d.hull[i].y, 0);
        pos.needsUpdate = true;
        g.setDrawRange(0, n >= 3 ? (n - 2) * 3 : 0);
        g.computeBoundingSphere();
        fill.material.color.copy(tone);
      }
      for (let i = 0; i < n && li < LINES; i++) {
        const a = d.hull[i], b = d.hull[(i + 1) % n];
        lines?.set(li++, a.x, a.y, 0.015, b.x, b.y, 0.015, tone);
        marker(a.x, a.y, 0.018, 0.028, tone);
      }
      // Centre of mass and its distance to the nearest edge (stability margin ρ).
      marker(com.x, com.y, 0.02, 0.045, pal.warning);
      if (n >= 3 && li < LINES) lines?.set(li++, com.x, com.y, 0.02, d.nearest.x, d.nearest.y, 0.02, pal.warning);

      // Ring radio links: brightness = packet freshness; HOLD turns the ring red.
      const holding = mgr.agents.some(a => a.mode === 'HOLD');
      for (const [a, b] of mgr.edges) {
        if (li >= LINES) break;
        const u = e.fleet.agent(a)?.pose, v = e.fleet.agent(b)?.pose;
        if (!u || !v) continue;
        const fresh = Math.max(0, 1 - mgr.linkAge(a, b) / LINK_STALE_S);
        color.copy(holding ? pal.destructive : pal.info).lerp(pal.viewport, 0.85 * (1 - fresh));
        lines?.set(li++, u.x, u.y, LINK_Z, v.x, v.y, LINK_Z, color);
        if (fresh > 0.2 && pi < PACKETS) {
          const o = pi++ * 4;
          res.packetLinks[o] = u.x; res.packetLinks[o + 1] = u.y; res.packetLinks[o + 2] = v.x; res.packetLinks[o + 3] = v.y;
        }
      }
    }

    // Support reaction vectors.
    for (const c of e.contacts) {
      if (vi >= VECTORS) break;
      const agent = e.fleet.agent(c.agentId);
      if (!agent) continue;
      const p = agent.getSupportContactInput();
      const ratio = c.force / p.fAllow;
      const tone = ratio > 1 ? pal.destructive : ratio > 0.8 ? pal.warning : pal.info;
      const top = p.padZ + c.force * FORCE_SCALE;
      vectors?.set(vi, p.pad.x, p.pad.y, p.padZ, p.pad.x, p.pad.y, top, tone);
      if (arrows) {
        dummy.position.set(p.pad.x, p.pad.y, top);
        dummy.scale.setScalar(1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        arrows.setMatrixAt(vi, dummy.matrix);
        arrows.setColorAt(vi, tone);
      }
      vi++;
    }

    // Factory docking link.
    if (e.mode === 2 && e.loads.length > 1 && li < LINES) {
      const a = e.loads[0].physics.state, b = e.loads[1].physics.state;
      const mated = e.fleet.dockingTelemetry()[0]?.phase === 'MATED';
      lines?.set(li++, a.pose.x, a.pose.y, a.z + 0.25, b.pose.x, b.pose.y, b.z + 0.25, mated ? pal.success : pal.warning);
    }
  }

  // Collapse unused pool entries.
  for (let k = e.metamorphic ? 0 : Math.min(e.loads.length, MAX_LOADS); k < MAX_LOADS; k++) { const f = fills[k]; if (f) f.visible = false; }
  lines?.commit(li);
  vectors?.commit(vi);
  for (let i = vi; i < VECTORS; i++) arrows?.setMatrixAt(i, HIDDEN);
  if (markers) {
    for (let i = mi; i < MARKERS; i++) markers.setMatrixAt(i, HIDDEN);
    markers.instanceMatrix.needsUpdate = true;
    if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
  }
  if (arrows) {
    arrows.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
  }
  res.packetCount = pi;
}

/** Packets glide along fresh links every frame (cheap: a few matrix writes). */
function animatePackets(res: Res, mesh: InstancedMesh | null, time: number, pal: ScenePalette): void {
  if (!mesh) return;
  const { dummy, packetLinks } = res;
  for (let i = 0; i < PACKETS; i++) {
    if (i >= res.packetCount) { mesh.setMatrixAt(i, HIDDEN); continue; }
    const o = i * 4, phase = (time * 1.5 + i * 0.137) % 1;
    dummy.position.set(packetLinks[o] + (packetLinks[o + 2] - packetLinks[o]) * phase, packetLinks[o + 1] + (packetLinks[o + 3] - packetLinks[o + 1]) * phase, LINK_Z);
    dummy.scale.setScalar(0.03);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, pal.warning);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
