import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Small geometry kit for procedural robot modules (Z-up, metres, robot-local frame). */
export const box = (w: number, d: number, h: number, x = 0, y = 0, z = 0): T.BufferGeometry => new T.BoxGeometry(w, d, h).translate(x, y, z);

/** Cylinder with its axis along Z. */
export const cylZ = (r: number, h: number, x = 0, y = 0, z = 0, seg = 16, rTop = r): T.BufferGeometry =>
  new T.CylinderGeometry(rTop, r, h, seg).rotateX(Math.PI / 2).translate(x, y, z);

/** Cylinder with its axis along Y. */
export const cylY = (r: number, h: number, x = 0, y = 0, z = 0, seg = 16): T.BufferGeometry => new T.CylinderGeometry(r, r, h, seg).translate(x, y, z);

/** Cylinder with its axis along X. */
export const cylX = (r: number, h: number, x = 0, y = 0, z = 0, seg = 16, rTop = r): T.BufferGeometry =>
  new T.CylinderGeometry(rTop, r, h, seg).rotateZ(-Math.PI / 2).translate(x, y, z);

export const sphere = (r: number, x = 0, y = 0, z = 0, w = 14, h = 10): T.BufferGeometry => new T.SphereGeometry(r, w, h).translate(x, y, z);

/** Rod between two points. */
export function rod(a: readonly number[], b: readonly number[], r: number, seg = 8): T.BufferGeometry {
  const p = new T.Vector3(a[0], a[1], a[2]), q = new T.Vector3(b[0], b[1], b[2]), v = q.clone().sub(p);
  const g = new T.CylinderGeometry(r, r, v.length(), seg);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** Merge parts into one indexed geometry (position / normal / uv only). */
export function merge(parts: T.BufferGeometry[]): T.BufferGeometry {
  const clean = parts.map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(clean);
  if (!m) throw new Error('module geometry merge failed');
  parts.forEach(g => g.dispose());
  clean.forEach(g => g.dispose());
  return m;
}

/**
 * goBILDA 140 mm Mecanum wheel: 16 dark rollers around a silver hub with steel side plates. The
 * roller stripes are vertex colours, so the spin direction (equation 1 wheel rates) reads clearly.
 */
export function mecanumWheel(): T.BufferGeometry {
  const rollers = new T.CylinderGeometry(0.07, 0.07, 0.034, 32, 1);
  const plates = [-0.0185, 0.0185].map(y => new T.CylinderGeometry(0.06, 0.06, 0.004, 24).translate(0, y, 0));
  const hub = new T.CylinderGeometry(0.026, 0.026, 0.05, 12);
  const parts = [rollers, ...plates, hub];
  const colors: number[][] = [];
  const dark = new T.Color(0x1d1f22), light = new T.Color(0x3a3d42), steel = new T.Color(0xa8aeb4), yellow = new T.Color(0xe2b530);
  parts.forEach((g, gi) => {
    const p = g.getAttribute('position'), c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      let col = steel;
      if (gi === 0) { const a = Math.atan2(p.getZ(i), p.getX(i)); col = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 16) % 2 ? dark : light; }
      if (gi === 3) col = yellow;
      col.toArray(c, i * 3);
    }
    colors.push(Array.from(c));
  });
  const merged = mergeGeometries(parts.map((g, i) => { g.setAttribute('color', new T.Float32BufferAttribute(colors[i], 3)); return g; }));
  parts.forEach(g => g.dispose());
  if (!merged) throw new Error('wheel merge failed');
  return merged;
}
