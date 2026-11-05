/**
 * Procedural hard-surface kit for the TALOS robot (threejs-procedural-geometry).
 *
 * Workflow: build NAMED parts (one mesh per semantic part, exact dimensions, explicit frames) →
 * audit them (tests/robotGeometry.test.ts: support, clearance, footprint, clashes) → compile into
 * ONE draw mesh per (motion layer × material slot). Indicators stay separate (per-robot colour).
 *
 * Frames: robot local, Z-up, metres, +x forward, +y left.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr, type MaterialIdentity } from './materials';

// ───────────────────────── profiles ─────────────────────────

export function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  r = Math.max(0, Math.min(r, w / 2, d / 2));
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Clockwise rounded-rect hole (holes wind opposite to the outer contour). */
export function roundedRectHole(w: number, d: number, r: number): THREE.Path {
  const p = new THREE.Path();
  const x = -w / 2, y = -d / 2;
  r = Math.max(0, Math.min(r, w / 2, d / 2));
  p.moveTo(x + r, y);
  p.quadraticCurveTo(x, y, x, y + r); p.lineTo(x, y + d - r);
  p.quadraticCurveTo(x, y + d, x + r, y + d); p.lineTo(x + w - r, y + d);
  p.quadraticCurveTo(x + w, y + d, x + w, y + d - r); p.lineTo(x + w, y + r);
  p.quadraticCurveTo(x + w, y, x + w - r, y); p.lineTo(x + r, y);
  return p;
}

export function circleHole(r: number, seg = 12): THREE.Path {
  const p = new THREE.Path();
  p.absarc(0, 0, r, 0, Math.PI * 2, true);
  p.getPoints(seg);
  return p;
}

/**
 * T-slot extrusion section: square of half size `a` with one slot per face (opening half width c,
 * depth d) and a centre bore. `bore` = { kind: 'square', half } for a telescoping outer stage,
 * { kind: 'round', r } for the core hole of a solid stage.
 */
export function tslotShape(a: number, c: number, d: number, bore: { kind: 'square'; half: number } | { kind: 'round'; r: number }): THREE.Shape {
  const s = new THREE.Shape();
  const pts: [number, number][] = [
    [-a, -a], [-c, -a], [-c, -a + d], [c, -a + d], [c, -a], [a, -a],
    [a, -c], [a - d, -c], [a - d, c], [a, c], [a, a],
    [c, a], [c, a - d], [-c, a - d], [-c, a], [-a, a],
    [-a, c], [-a + d, c], [-a + d, -c], [-a, -c],
  ];
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  if (bore.kind === 'square') s.holes.push(roundedRectHole(2 * bore.half, 2 * bore.half, 0.0015));
  else s.holes.push(circleHole(bore.r));
  return s;
}

// ───────────────────────── solids ─────────────────────────

/**
 * Extrude a shape along +z so the solid spans z ∈ [0, height] EXACTLY, with a small bevel on the
 * caps (every visible manufactured edge gets a bevel). The outline is NOT grown by the bevel:
 * bevelSize is negative-compensated by offsetting the cap only (bevelOffset).
 */
export function extrudeZ(shape: THREE.Shape, height: number, bevel = 0.0006, curveSegments = 4): THREE.BufferGeometry {
  const b = Math.min(bevel, height / 4);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-5, height - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,      // outline stays at the nominal profile; the bevel cuts inward
    bevelSegments: 1,
    curveSegments,
  });
  geo.translate(0, 0, b);
  return geo;
}

/** Beveled rounded box spanning x,y centred and z ∈ [0, h]. Optional rectangular hole (thick shell). */
export function beveledBox(w: number, d: number, h: number, opts: { radius?: number; bevel?: number; hole?: { w: number; d: number; r?: number } } = {}): THREE.BufferGeometry {
  const r = opts.radius ?? Math.min(w, d) * 0.08;
  const s = roundedRectShape(w, d, r);
  if (opts.hole) s.holes.push(roundedRectHole(opts.hole.w, opts.hole.d, opts.hole.r ?? Math.max(0, r - (w - opts.hole.w) / 2)));
  return extrudeZ(s, h, opts.bevel ?? Math.min(0.0008, Math.min(w, d, h) / 8));
}

/** Rotate a +z-extruded solid so its length runs along +x (or +y), centred on the origin. */
export function alongAxis(geo: THREE.BufferGeometry, axis: 'x' | 'y', length: number): THREE.BufferGeometry {
  geo.translate(0, 0, -length / 2);
  if (axis === 'x') geo.rotateY(Math.PI / 2);
  else geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Cylinder whose axis is +z, spanning z ∈ [0, h]. */
export function cylinderZ(r: number, h: number, seg = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, h / 2);
  return g;
}

/** Fastener head (low countersunk/button head): cylinder along `normal`, base on the surface. */
export function screwHead(normal: THREE.Vector3, r = 0.0032, h = 0.0012): THREE.BufferGeometry {
  const g = cylinderZ(r, h, 10);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  g.applyQuaternion(q);
  return g;
}

/** Dense polyline curve (no spline overshoot). */
class PolylineCurve3 extends THREE.Curve<THREE.Vector3> {
  private readonly cum: number[] = [0];
  constructor(private readonly pts: THREE.Vector3[]) {
    super();
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const L = this.cum[this.cum.length - 1], s = Math.min(Math.max(t, 0), 1) * L;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    return target.lerpVectors(this.pts[i - 1], this.pts[i], (s - this.cum[i - 1]) / seg);
  }
}

/**
 * Cable: tube along a smoothed path through `points`. The centripetal Catmull-Rom is resampled
 * densely and clamped to z ≥ floorZ (the tray it lies on + radius) so it never dips into the floor.
 */
export function cable(points: [number, number, number][], radius = 0.0025, floorZ?: number): THREE.TubeGeometry {
  const spline = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const dense = spline.getSpacedPoints(points.length * 24);
  if (floorZ !== undefined) for (const p of dense) p.z = Math.max(p.z, floorZ);
  return new THREE.TubeGeometry(new PolylineCurve3(dense), points.length * 16, radius, 8, false);
}

// ───────────────────────── assembly ─────────────────────────

export type MotionLayer = 'static' | 'carriage' | 'isolator' | 'plate';

export interface Part {
  name: string;
  mesh: THREE.Mesh;
  identity: MaterialIdentity | 'indicator';
  layer: MotionLayer;
  /** Names of parts this one intentionally touches/penetrates (nested tubes, cable entries). */
  allow: string[];
}

/**
 * Named-part assembly. Parts keep their own mesh until compile(); tests audit `parts`.
 * Layers: static → robot root; carriage → moves +h; plate → child of carriage, moves −deflection.
 */
export class Assembly {
  readonly parts: Part[] = [];
  readonly groups: Record<MotionLayer, THREE.Group> = { static: new THREE.Group(), carriage: new THREE.Group(), isolator: new THREE.Group(), plate: new THREE.Group() };

  constructor(readonly name: string) {
    for (const k of Object.keys(this.groups) as MotionLayer[]) this.groups[k].name = `${name}_${k}`;
    this.groups.carriage.add(this.groups.isolator, this.groups.plate);
  }

  add(name: string, geo: THREE.BufferGeometry, identity: MaterialIdentity | THREE.Material, layer: MotionLayer, pos: [number, number, number] = [0, 0, 0], allow: string[] = []): THREE.Mesh {
    const mat = identity instanceof THREE.Material ? identity : pbr(identity);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(...pos);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.parts.push({ name, mesh, identity: identity instanceof THREE.Material ? 'indicator' : identity, layer, allow });
    this.groups[layer].add(mesh);
    return mesh;
  }

  part(name: string): Part {
    const p = this.parts.find(x => x.name === name);
    if (!p) throw new Error(`Assembly ${this.name}: no part ${name}`);
    return p;
  }

  /** Merge parts into one mesh per (layer, material). Call after auditing named parts. */
  compile(): void {
    for (const layer of Object.keys(this.groups) as MotionLayer[]) {
      const group = this.groups[layer];
      // one draw mesh per material INSTANCE in this layer (shared PBR identities and per-robot
      // indicator materials alike)
      const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
      for (const p of this.parts) {
        if (p.layer !== layer) continue;
        p.mesh.updateMatrix();
        let g = p.mesh.geometry.clone().applyMatrix4(p.mesh.matrix);
        if (g.index) g = g.toNonIndexed();
        for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
        const mat = p.mesh.material as THREE.Material;
        (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(g);
        group.remove(p.mesh);
      }
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos, false);
        geos.forEach(g => g.dispose());
        if (!merged) throw new Error(`Assembly ${this.name}: merge failed for ${layer}/${mat.name}`);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.name = `${this.name}_${layer}_${mat.userData.identity ?? 'indicator'}`;
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
  }

  dispose(): void {
    for (const g of Object.values(this.groups)) g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    for (const p of this.parts) p.mesh.geometry.dispose();
  }
}

/** World-space AABB of a part (after its group transforms). */
export function partBox(p: Part): THREE.Box3 {
  p.mesh.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(p.mesh, true);
}
