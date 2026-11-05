/**
 * Geometry quality gates for the Industrial TALOS model (threejs-procedural-geometry):
 * support datums, wheel clearance, footprint, pairwise solid clashes of named parts at both stroke
 * extremes, cable routing clearance, outward winding of closed shells, compile-by-slot, plate spring.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BASE_TOP_Z, CASCADE_GAP, CHASSIS_TOP_Z, CORNERS, FRAME_BASE_Z, FRAME_TOP_Z, GANTRY, MOUNT_TOP_Z, PAD_BASE_Z,
  PLATE_BOTTOM_Z, SHEAVE, SPOOL, ViperSlideRig, WHEEL, columnOverlap, innerBottomZ,
} from '../src/robot/ViperSlideRig';
import { NAMEPLATE, SIDE_PLATE, TRAY_TOP_Z, TalosChassis, dressStraferModel } from '../src/robot/TalosChassis';
import { partBox, type Assembly, type Part } from '../src/robot/geometryKit';
import { DEFAULT_LIFT_PARAMS } from '../src/robot/liftDrive';
import { getMaterialDebugView, pbr, setMaterialDebugView } from '../src/robot/materials';
import { CORNER_NODE, DRIVE_OMEGA_FREE, FRAME, FRAME_BOTTOM_Z, MECANUM_140, ROBOT_FOOTPRINT } from '../src/robot/straferSpec';
import { ROLLER_CENTRE_R, buildMecanumWheel } from '../src/robot/MecanumWheel';
import { MECANUM_SIGNS } from '../src/robot/mecanum';
import { WHEEL_ORDER } from '../src/contracts/types';

const EPS = 1e-6;
const H_MAX = DEFAULT_LIFT_PARAMS.hMax;
/** Frame envelope 432 × 360 (+1 mm) — gantry and dressing stay inside the U-channel perimeter. */
const FOOT = { x: FRAME.hx + 0.001, y: FRAME.hy + 0.003 + 0.001 + 1e-6 }; // + nameplate thickness

function setup(h: number) {
  const rig = new ViperSlideRig({ compile: false });
  const chassis = new TalosChassis({ compile: false });
  const root = new THREE.Group();
  root.add(rig.root, chassis.root);
  rig.setHeight(h);
  root.updateMatrixWorld(true);
  const parts: Part[] = [...rig.assembly.parts, ...chassis.assembly.parts];
  return { rig, chassis, parts, root };
}

const isCable = (p: Part) => p.name.startsWith('wire_');
const allowed = (a: Part, b: Part) => a.allow.includes(b.name) || b.allow.includes(a.name);

/** Overlap depth along each axis (negative = separated). */
function overlap(a: THREE.Box3, b: THREE.Box3): [number, number, number] {
  return [
    Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x),
    Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y),
    Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z),
  ];
}

function signedVolume(geo: THREE.BufferGeometry): number {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

describe('goBILDA / REV specification', () => {
  it('Strafer frame 432 × 360 mm, 46 mm ground clearance, columns on the corner nodes', () => {
    expect(FRAME.length).toBe(0.432);
    expect(FRAME.width).toBe(0.36);
    expect(2 * FRAME.hx).toBeCloseTo(FRAME.length, 12);
    expect(2 * FRAME.hy).toBeCloseTo(FRAME.width, 12);
    expect(FRAME_BOTTOM_Z).toBeCloseTo(0.046, 12);
    expect(FRAME_BOTTOM_Z).toBeCloseTo(FRAME.groundClearance, 12);
    expect(CHASSIS_TOP_Z - FRAME_BOTTOM_Z).toBeCloseTo(FRAME.height, 12);
    expect(CORNER_NODE.x).toBeCloseTo(0.192, 12);
    expect(CORNER_NODE.y).toBeCloseTo(0.156, 12);
  });

  it('cargo plate covers the full 432 × 360 frame', () => {
    const { parts } = setup(0);
    const p = partBox(parts.find(q => q.name === 'cargo_plate')!);
    expect(p.max.x - p.min.x).toBeCloseTo(0.432, 6);
    expect(p.max.y - p.min.y).toBeCloseTo(0.36, 6);
  });

  it('140 mm mecanum: 16 rollers at 45°, contact envelope r = 70 mm, X layout of formula 14', () => {
    expect(MECANUM_140.diameter).toBe(0.14);
    expect(ROLLER_CENTRE_R + MECANUM_140.roller.rMax).toBeCloseTo(0.07, 12);
    WHEEL_ORDER.forEach((id, i) => {
      const w = buildMecanumWheel(id);
      const rollers = w.children.filter(c => c.name.startsWith('roller_'));
      expect(rollers).toHaveLength(16);
      expect(w.position.z).toBeCloseTo(MECANUM_140.r, 12);
      for (const r of rollers) {
        const a = new THREE.Vector3(...(r.userData.axis as [number, number, number]));
        expect(Math.acos(Math.abs(a.y))).toBeCloseTo(Math.PI / 4, 9); // 45° to the axle
        expect(Math.hypot(r.position.x, r.position.z)).toBeCloseTo(ROLLER_CENTRE_R, 9);
      }
      // floor roller (φ = −π/2) slope sign = formula-14 row sign s_y
      const ax = (w.userData.axisXY as [number, number])[0];
      expect(Math.sign(ax)).toBe(MECANUM_SIGNS[i][0]);
      const bottom = rollers.find(r => Math.abs(Math.atan2(r.position.z, r.position.x) + Math.PI / 2) < 1e-6)!;
      expect(Math.sign((bottom.userData.axis as number[])[0])).toBe(MECANUM_SIGNS[i][0]);
      // wheel bottom touches the floor; wheel stays outboard of the 360 mm frame
      w.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(w, true);
      expect(b.min.z).toBeGreaterThanOrEqual(-1e-3);
      expect(b.min.z).toBeLessThan(2e-3);
      expect(Math.min(Math.abs(b.min.y), Math.abs(b.max.y))).toBeGreaterThan(FRAME.hy);
    });
  });

  it('5203 223 rpm drive and footprint incl. wheel overhang', () => {
    expect(DRIVE_OMEGA_FREE).toBeCloseTo(223 * 2 * Math.PI / 60, 12);
    expect(ROBOT_FOOTPRINT.halfX).toBeCloseTo(0.238, 12);
  });
});

describe('gantry datums & support', () => {
  it('stack heights are exact', () => {
    expect(MOUNT_TOP_Z).toBeCloseTo(CHASSIS_TOP_Z + GANTRY.mount.t, 12);
    expect(BASE_TOP_Z).toBeCloseTo(MOUNT_TOP_Z + GANTRY.base.length, 12);
    expect(FRAME_BASE_Z).toBeCloseTo(innerBottomZ(0) + GANTRY.inner.length, 12);
    expect(PAD_BASE_Z).toBeCloseTo(PLATE_BOTTOM_Z + GANTRY.plate.t + GANTRY.sensor.proud, 12);
  });

  it('two-section cascade: 1.5 mm stage gap, ≥ 40 mm overlap at h_max', () => {
    expect(columnOverlap(H_MAX)).toBeGreaterThanOrEqual(0.04);
    expect(CASCADE_GAP).toBeCloseTo(0.0015, 12);
  });

  it('cable drive: rope leaves the spool tangentially and drops into the cascade gap', () => {
    const { parts } = setup(0);
    for (const c of CORNERS) {
      const rope = parts.find(p => p.name === `wire_rope_${c.key}`)!.mesh.geometry as THREE.TubeGeometry;
      const pts = rope.parameters.path.getSpacedPoints(60) as THREE.Vector3[];
      const first = pts[0], last = pts[pts.length - 1];
      expect(Math.abs(first.x) - SPOOL.x).toBeCloseTo(GANTRY.spool.r, 9);          // drum tangent
      expect(first.z).toBeCloseTo(SPOOL.z, 9);
      const boreFace = GANTRY.column.x - (GANTRY.base.half - GANTRY.base.slotD - GANTRY.base.wall);
      const innerFace = GANTRY.column.x - GANTRY.inner.half;
      expect(Math.abs(last.x) - GANTRY.rope.r).toBeGreaterThanOrEqual(boreFace - 1e-9);
      expect(Math.abs(last.x) + GANTRY.rope.r).toBeLessThanOrEqual(innerFace + 1e-9);
      expect(Math.max(...pts.map(p => p.z))).toBeCloseTo(SHEAVE.z + SHEAVE.r, 3);  // over the sheave
    }
  });

  it('every part rests on its support (named contacts)', () => {
    const { parts } = setup(0);
    const box = (n: string) => partBox(parts.find(p => p.name === n)!);
    for (const c of CORNERS) {
      const m = box(`mount_plate_${c.key}`);
      expect(m.min.z).toBeCloseTo(CHASSIS_TOP_Z, 6);
      // mount plate lies exactly on the 48 mm corner node of the frame
      expect(Math.max(Math.abs(m.min.x), Math.abs(m.max.x))).toBeLessThanOrEqual(FRAME.hx + EPS);
      expect(Math.min(Math.abs(m.min.x), Math.abs(m.max.x))).toBeGreaterThanOrEqual(FRAME.hx - 0.048 - EPS);
      expect(Math.max(Math.abs(m.min.y), Math.abs(m.max.y))).toBeLessThanOrEqual(FRAME.hy + EPS);
      expect(Math.min(Math.abs(m.min.y), Math.abs(m.max.y))).toBeGreaterThanOrEqual(FRAME.hy - 0.048 - EPS);
      expect(box(`base_${c.key}`).min.z).toBeCloseTo(m.max.z, 6);
      expect(box(`spool_block_${c.key}`).min.z).toBeCloseTo(CHASSIS_TOP_Z, 6);
      expect(box(`cube_${c.key}`).min.z).toBeCloseTo(box(`inner_${c.key}`).max.z, 6);
      expect(box(`load_cell_${c.key}`).min.z).toBeCloseTo(box(`cube_${c.key}`).max.z, 6);
    }
    expect(box('cargo_plate').min.z).toBeCloseTo(FRAME_TOP_Z + GANTRY.loadCell.t, 6);
    expect(box('bar_front').max.z).toBeCloseTo(FRAME_TOP_Z, 6);
    expect(box('bay_tray').min.z).toBeCloseTo(CHASSIS_TOP_Z, 6);
    expect(box('control_hub').min.z).toBeCloseTo(TRAY_TOP_Z, 6);
    expect(box('battery').min.z).toBeCloseTo(TRAY_TOP_Z, 6);
    for (const s of ['L', 'R']) {
      const n = box(`nameplate_${s}`);
      expect(Math.min(Math.abs(n.min.y), Math.abs(n.max.y))).toBeCloseTo(SIDE_PLATE.y, 6);
      expect(n.min.z).toBeGreaterThanOrEqual(SIDE_PLATE.z0 - EPS);
      expect(n.max.z).toBeLessThanOrEqual(SIDE_PLATE.z1 + EPS);
      expect(n.max.x - n.min.x).toBeCloseTo(2 * NAMEPLATE.hx, 6);
    }
  });

  it('columns stand on the corner nodes and every part clears the 140 mm wheel envelope by ≥ 4 mm', () => {
    const { parts } = setup(0);
    for (const c of CORNERS) {
      const base = partBox(parts.find(p => p.name === `base_${c.key}`)!);
      expect(Math.abs((base.min.x + base.max.x) / 2)).toBeCloseTo(CORNER_NODE.x, 6);
      expect(Math.abs((base.min.y + base.max.y) / 2)).toBeCloseTo(CORNER_NODE.y, 6);
    }
    for (const p of parts) for (const c of CORNERS) {
      const wy = c.sy * WHEEL.y;
      const wheel = new THREE.Box3(
        new THREE.Vector3(c.sx * WHEEL.x - WHEEL.r, wy - WHEEL.halfWidth - 0.004, 0),
        new THREE.Vector3(c.sx * WHEEL.x + WHEEL.r, wy + WHEEL.halfWidth + 0.004, WHEEL.topZ + 0.004),
      );
      expect(overlap(partBox(p), wheel).some(v => v <= 0), `${p.name} intrudes into wheel ${c.key}`).toBe(true);
    }
  });
});

describe('footprint & solid clashes', () => {
  it.each([0, H_MAX])('all parts inside the 432 × 360 frame envelope (h=%s)', h => {
    for (const p of setup(h).parts) {
      const b = partBox(p);
      expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), p.name).toBeLessThanOrEqual(FOOT.x);
      expect(Math.max(Math.abs(b.min.y), Math.abs(b.max.y)), p.name).toBeLessThanOrEqual(FOOT.y);
    }
  });

  it.each([0, H_MAX / 2, H_MAX])('no unintended solid intersections between named parts (h=%s)', h => {
    const { parts, rig, root } = setup(h);
    rig.setLoad(1e9); rig.animate(2); root.updateMatrixWorld(true); // worst-case plate deflection
    const solids = parts.filter(p => !isCable(p));
    const boxes = solids.map(p => partBox(p));
    const clashes: string[] = [];
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      if (allowed(solids[i], solids[j])) continue;
      const o = overlap(boxes[i], boxes[j]);
      if (o.every(v => v > 3e-4)) clashes.push(`${solids[i].name} × ${solids[j].name} (${o.map(v => (v * 1000).toFixed(1)).join('/')} mm)`);
    }
    expect(clashes).toEqual([]);
  });

  it('cables: centrelines never cross, and stay out of non-entry parts', () => {
    const { parts } = setup(0);
    const cables = parts.filter(isCable).map(p => {
      const g = p.mesh.geometry as THREE.TubeGeometry;
      return { p, r: g.parameters.radius, pts: g.parameters.path.getSpacedPoints(80) as THREE.Vector3[] };
    });
    for (let i = 0; i < cables.length; i++) for (let j = i + 1; j < cables.length; j++) {
      let d = Infinity;
      for (const a of cables[i].pts) for (const b of cables[j].pts) d = Math.min(d, a.distanceTo(b));
      expect(d, `${cables[i].p.name} × ${cables[j].p.name}`).toBeGreaterThanOrEqual(cables[i].r + cables[j].r - 2e-4);
    }
    const solids = parts.filter(p => !isCable(p));
    for (const c of cables) {
      const mid = c.pts.slice(16, -16); // endpoints are intentional entries into connectors
      for (const s of solids) {
        if (allowed(c.p, s)) continue;
        const b = partBox(s).expandByScalar(-2e-4);
        const hits = mid.filter(q => b.distanceToPoint(q) < c.r - 4e-4);
        expect(hits.length, `${c.p.name} runs through ${s.name}`).toBe(0);
      }
    }
  });

  it('closed shells wind outward (positive signed volume)', () => {
    for (const p of setup(0).parts) {
      if (isCable(p)) continue;
      expect(signedVolume(p.mesh.geometry), p.name).toBeGreaterThan(0);
    }
  });
});

describe('compile & animation', () => {
  it('compiles 100+ named parts into a handful of draw meshes per robot', () => {
    const named = new ViperSlideRig({ compile: false }).assembly.parts.length + new TalosChassis({ compile: false }).assembly.parts.length;
    const count = (a: Assembly) => { let n = 0; Object.values(a.groups).forEach(g => g.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; })); return n; };
    const draws = count(new ViperSlideRig().assembly) + count(new TalosChassis().assembly);
    expect(named).toBeGreaterThan(100);
    expect(draws).toBeLessThanOrEqual(30);
  });

  it('carriage moves exactly h; pad top = PAD_BASE_Z + h', () => {
    const rig = new ViperSlideRig({ compile: false });
    rig.setHeight(0.12);
    rig.root.updateMatrixWorld(true);
    expect(partBox(rig.assembly.part('inner_FL')).min.z).toBeCloseTo(innerBottomZ(0.12), 6);
    expect(rig.padTopZ).toBeCloseTo(PAD_BASE_Z + 0.12, 12);
  });

  it('plate spring: critically damped, terminal lock, frame-rate independent', () => {
    const run = (dt: number) => {
      const rig = new ViperSlideRig({ compile: false });
      rig.setLoad(1e9);
      let peak = 0;
      for (let t = 0; t < 0.25; t += dt) { rig.animate(dt); peak = Math.max(peak, rig.deflection); }
      return { d: rig.deflection, peak };
    };
    const a = run(1 / 30), b = run(1 / 144);
    expect(a.peak).toBeLessThanOrEqual(GANTRY.maxDeflection + 1e-9);   // no overshoot (ζ = 1)
    expect(Math.abs(a.d - b.d)).toBeLessThan(1e-4);
    const rig = new ViperSlideRig({ compile: false });
    rig.setLoad(1e9); for (let i = 0; i < 300; i++) rig.animate(1 / 60);
    expect(rig.deflection).toBe(GANTRY.maxDeflection);                  // exact terminal pose
    rig.animate(-1); rig.animate(NaN);                                  // ignored
    expect(rig.deflection).toBe(GANTRY.maxDeflection);
  });
});

describe('materials', () => {
  it('Strafer dressing: yellow PU roller covers, black hubs', () => {
    const mk = (name: string, mat: string) => { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: mat })); m.name = name; return m; };
    const wheel = new THREE.Group(); wheel.name = 'wheel_FL';
    const roller = new THREE.Group(); roller.name = 'roller_FL_0';
    roller.add(mk('cover', 'rubber'), mk('core', 'rollerGray'), mk('pin', 'steel'));
    wheel.add(mk('hub', 'darkAlu'), roller);
    dressStraferModel(wheel);
    const mat = (n: string) => (wheel.getObjectByName(n) as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
    expect(mat('cover').color.getHex()).toBe(0xeab308);
    expect(mat('hub')).toBe(pbr('blackAnodized'));
    expect(mat('pin')).toBe(pbr('steelFastener'));
  });

  it('materials are shared between robots; debug views round-trip', () => {
    const mats = (r: ViperSlideRig) => { const s = new Set<THREE.Material>(); r.root.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) s.add(m); }); return s; };
    const a = mats(new ViperSlideRig()), b = mats(new ViperSlideRig());
    expect([...a].filter(m => b.has(m)).length).toBe(a.size);
    setMaterialDebugView('roughness');
    expect(pbr('compositePlate').color.r).toBeCloseTo(0.78, 2);
    setMaterialDebugView('none');
    expect(getMaterialDebugView()).toBe('none');
    expect(pbr('tealPowderCoat').color.getHex()).toBe(0x115e59);
  });
});
