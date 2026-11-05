// Stage 2: take the cached OpenCascade meshes, split into chassis / 4 mecanum wheels
// (hub + individual rollers), decimate, colour by part and write a single GLB.
//   node tools/build.mjs <cache.bin> <out.glb>
import fs from 'fs';
import v8 from 'v8';
import { Document, NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

const [, , cachePath, outPath] = process.argv;
const { nodes, meshes } = v8.deserialize(fs.readFileSync(cachePath));
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;

const TARGET_RATIO = Number(process.env.RATIO || 0.2); // fraction of triangles kept
const MIN_TRIS = 120; // never reduce tiny parts below this

// ---------- materials ----------
const PALETTE = {
  aluminum: { c: [0.72, 0.73, 0.75], m: 0.9, r: 0.38 },
  darkAlu:  { c: [0.20, 0.21, 0.23], m: 0.8, r: 0.45 },
  gold:     { c: [0.85, 0.62, 0.12], m: 0.85, r: 0.35 },
  steel:    { c: [0.55, 0.56, 0.58], m: 1.0, r: 0.30 },
  black:    { c: [0.04, 0.04, 0.045], m: 0.1, r: 0.7 },
  rubber:   { c: [0.07, 0.07, 0.075], m: 0.0, r: 0.9 },
  rollerGray: { c: [0.30, 0.31, 0.33], m: 0.0, r: 0.8 },
  motor:    { c: [0.12, 0.12, 0.14], m: 0.6, r: 0.5 },
  brass:    { c: [0.75, 0.55, 0.25], m: 1.0, r: 0.3 },
};
function pickMaterial(name, ctx) {
  const n = name || '';
  if (/Gearbox Face|Gearbox Base$|Gearbox Barrel \(/.test(n)) return 'gold';
  if (/Gearbox Base Mounting|Gearbox Barrel Screw|2800-|2801-|2806-|2812-|screw|snap ring|e-clip|2106 Series|2807-/i.test(n)) return 'steel';
  if (/5103 Gearbox/.test(n)) return 'gold';
  if (/motor shield|encoder/i.test(n)) return /pin/i.test(n) ? 'brass' : 'black';
  if (/motor shaft|axle|shaft/i.test(n)) return 'steel';
  if (/5000-/.test(n)) return 'motor';
  if (/slant side plate/.test(n)) return 'darkAlu';
  if (/roller cover/.test(n)) return 'rubber';
  if (/roller core|roller shim/.test(n)) return 'rollerGray';
  if (/3606-XXXX-0096 core/.test(n)) return 'darkAlu';
  if (/1613-/.test(n)) return 'steel';
  if (/1120-|1201-|1310-|1504-|1600-|1611-|2315-|2106-/.test(n)) return 'aluminum';
  return ctx === 'wheel' ? 'steel' : 'aluminum';
}

// ---------- geometry helpers ----------
function weldAndSimplify(m) {
  const nIn = m.idx.length / 3;
  // weld by position + normal so hard edges stay hard but face seams close
  const map = new Map();
  const pos = [], nor = [], idx = new Uint32Array(m.idx.length);
  for (let i = 0; i < m.idx.length; i++) {
    const v = m.idx[i];
    const px = m.pos[v * 3], py = m.pos[v * 3 + 1], pz = m.pos[v * 3 + 2];
    const nx = m.nor ? m.nor[v * 3] : 0, ny = m.nor ? m.nor[v * 3 + 1] : 0, nz = m.nor ? m.nor[v * 3 + 2] : 0;
    const key = `${Math.round(px * 1e5)},${Math.round(py * 1e5)},${Math.round(pz * 1e5)},${Math.round(nx * 20)},${Math.round(ny * 20)},${Math.round(nz * 20)}`;
    let id = map.get(key);
    if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(px, py, pz); nor.push(nx, ny, nz); }
    idx[i] = id;
  }
  const P = new Float32Array(pos), N = new Float32Array(nor);
  let I = idx;
  if (nIn > MIN_TRIS) {
    const target = Math.max(MIN_TRIS, Math.floor(nIn * TARGET_RATIO)) * 3;
    const [out] = MeshoptSimplifier.simplifyWithAttributes(I, P, 3, N, 3, [0.6, 0.6, 0.6], null, target, 0.02, ['Sparse']);
    I = out;
  }
  // compact
  const remap = new Int32Array(P.length / 3).fill(-1);
  const P2 = [], N2 = [], I2 = new Uint32Array(I.length);
  for (let i = 0; i < I.length; i++) {
    const v = I[i];
    if (remap[v] < 0) { remap[v] = P2.length / 3; P2.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); N2.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); }
    I2[i] = remap[v];
  }
  return { pos: new Float32Array(P2), nor: new Float32Array(N2), idx: I2 };
}

function bbox(pos) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let k = 0; k < pos.length; k += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[k + a]); mx[a] = Math.max(mx[a], pos[k + a]); }
  return { mn, mx, c: mn.map((v, i) => (v + mx[i]) / 2) };
}

// principal axis of a point cloud (power iteration on covariance)
function principalAxis(pos) {
  const n = pos.length / 3; const mean = [0, 0, 0];
  for (let k = 0; k < pos.length; k += 3) for (let a = 0; a < 3; a++) mean[a] += pos[k + a] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < pos.length; k += 3) {
    const d = [pos[k] - mean[0], pos[k + 1] - mean[1], pos[k + 2] - mean[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j];
  }
  let v = [1, 0.7, 0.3];
  for (let it = 0; it < 60; it++) {
    const w = [0, 1, 2].map(i => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]);
    const l = Math.hypot(...w) || 1; v = w.map(x => x / l);
  }
  return v;
}

// ---------- analyse the assembly ----------
const frameNode = nodes[0];
const wheelNodes = nodes.filter(n => /^3606-/.test(n.name));
const looseNodes = nodes.filter((n, i) => i > 0 && !/^3606-/.test(n.name));
console.log('wheels:', wheelNodes.length, 'loose parts:', looseNodes.length);

// ground reference: bottom of wheels, chassis footprint centre
const wheelInfo = wheelNodes.map(n => {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const mi of n.meshes) { const b = bbox(meshes[mi].pos); for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], b.mn[a]); mx[a] = Math.max(mx[a], b.mx[a]); } }
  return { node: n, center: mn.map((v, i) => (v + mx[i]) / 2), radius: (mx[2] - mn[2]) / 2, mn, mx };
});
const R = wheelInfo.reduce((s, w) => s + w.radius, 0) / 4;
const cx = wheelInfo.reduce((s, w) => s + w.center[0], 0) / 4;
const cy = wheelInfo.reduce((s, w) => s + w.center[1], 0) / 4;
const zc = wheelInfo.reduce((s, w) => s + w.center[2], 0) / 4;
const origin = [cx, cy, zc - R]; // robot origin: footprint centre on the floor
console.log('wheel radius', R.toFixed(4), 'origin', origin.map(v => v.toFixed(4)).join(','));

// ---------- glTF ----------
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('robot');
const root = doc.createNode('robot');
scene.addChild(root);
const mats = {};
for (const [k, v] of Object.entries(PALETTE)) {
  mats[k] = doc.createMaterial(k).setBaseColorFactor([...v.c, 1]).setMetallicFactor(v.m).setRoughnessFactor(v.r);
}

// collect geometry grouped by material, offset by `off`, into a glTF mesh
const stats = { before: 0, after: 0 };
function buildMesh(name, parts, off) {
  const groups = {};
  for (const { m, ctx } of parts) {
    stats.before += m.idx.length / 3;
    const s = weldAndSimplify(m);
    stats.after += s.idx.length / 3;
    const key = pickMaterial(m.name, ctx);
    (groups[key] ??= []).push(s);
  }
  const mesh = doc.createMesh(name);
  for (const [key, list] of Object.entries(groups)) {
    let nv = 0, ni = 0;
    for (const s of list) { nv += s.pos.length / 3; ni += s.idx.length; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const s of list) {
      for (let k = 0; k < s.pos.length; k += 3) {
        P[vo * 3 + k] = s.pos[k] - off[0]; P[vo * 3 + k + 1] = s.pos[k + 1] - off[1]; P[vo * 3 + k + 2] = s.pos[k + 2] - off[2];
      }
      N.set(s.nor, vo * 3);
      for (let k = 0; k < s.idx.length; k++) I[io + k] = s.idx[k] + vo;
      vo += s.pos.length / 3; io += s.idx.length;
    }
    const prim = doc.createPrimitive().setMaterial(mats[key])
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(I).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  return mesh;
}

// chassis (everything that is not a wheel), shifted so the robot origin is on the floor
{
  const parts = [];
  for (const mi of frameNode.meshes) parts.push({ m: meshes[mi], ctx: 'frame' });
  for (const n of looseNodes) for (const mi of n.meshes) parts.push({ m: meshes[mi], ctx: 'frame' });
  const chassis = doc.createNode('chassis').setMesh(buildMesh('chassis', parts, origin));
  root.addChild(chassis);
  console.log('chassis tris', stats.before, '->', stats.after);
}

// wheels
const report = [];
for (const w of wheelInfo) {
  const sx = w.center[0] > cx ? 'F' : 'R';
  const sy = w.center[1] > cy ? 'L' : 'R';
  const id = sx + sy;
  const wc = w.center;
  const wheelNode = doc.createNode('wheel_' + id).setTranslation([wc[0] - origin[0], wc[1] - origin[1], wc[2] - origin[2]]);
  root.addChild(wheelNode);

  // classify meshes: roller parts live on the 0.040 m circle, everything else is hub
  const hub = [], rollerParts = [];
  for (const mi of w.node.meshes) {
    const m = meshes[mi]; const b = bbox(m.pos);
    const r = Math.hypot(b.c[0] - wc[0], b.c[2] - wc[2]);
    const isHubScrew = /2800-|2812-/.test(m.name);
    if (r > 0.032 && !isHubScrew) rollerParts.push({ m, ang: Math.atan2(b.c[2] - wc[2], b.c[0] - wc[0]), b });
    else hub.push({ m, ctx: 'wheel' });
  }
  // roller axles define the roller axes and centres
  const axles = rollerParts.filter(p => /roller axle/.test(p.m.name));
  const rollers = axles.map(a => ({ center: a.b.c, dir: principalAxis(a.m.pos), ang: a.ang, parts: [] }));
  for (const p of rollerParts) {
    let best = null, bd = 1e9;
    for (const r of rollers) { let d = Math.abs(p.ang - r.ang); d = Math.min(d, 2 * Math.PI - d); if (d < bd) { bd = d; best = r; } }
    best.parts.push({ m: p.m, ctx: 'wheel' });
  }
  wheelNode.setMesh(buildMesh('hub_' + id, hub, wc));
  rollers.forEach((r, i) => {
    const ro = r.center;
    const node = doc.createNode(`roller_${id}_${i}`)
      .setTranslation([ro[0] - wc[0], ro[1] - wc[1], ro[2] - wc[2]])
      .setMesh(buildMesh(`roller_${id}_${i}`, r.parts, ro));
    node.setExtras({ axis: r.dir });
    wheelNode.addChild(node);
  });

  // ground-contact roller axis (xy projection) from rollers adjacent to the bottom of the wheel
  const near = rollers.filter(r => Math.abs(r.ang + Math.PI / 2) < 0.4);
  let ax = 0, ay = 0;
  for (const r of near) { const s = Math.sign(r.dir[1]) || 1; ax += s * r.dir[0]; ay += s * r.dir[1]; }
  const l = Math.hypot(ax, ay); ax /= l; ay /= l;
  wheelNode.setExtras({ id, radius: R, axisXY: [ax, ay] });
  report.push(`${id} @ (${(wc[0] - origin[0]).toFixed(3)}, ${(wc[1] - origin[1]).toFixed(3)}) rollers=${rollers.length} near=${near.length} contactAxis=(${ax.toFixed(3)}, ${ay.toFixed(3)}) hubParts=${hub.length} rollerParts=${rollers.reduce((s, r) => s + r.parts.length, 0)}`);
}
console.log(report.join('\n'));
console.log('total tris', stats.before, '->', stats.after);

await new NodeIO().write(outPath, doc);
console.log('wrote', outPath, (fs.statSync(outPath).size / 1e6).toFixed(1), 'MB');
