/**
 * Industrial TALOS — Four-Post Gantry Lift on the goBILDA Strafer frame (CLAUDE.md v3 §2.2–2.3).
 *
 * Frame: robot local, Z-up, metres, +x forward, +y left. All datums come from straferSpec.ts:
 *   RAIL_TOP_Z = 0.094   U-channel rail top with 140 mm wheels (CAD 0.072 + Δr 0.022)
 *   corner nodes (±0.192, ±0.156)  — centre of the 48 × 48 mm channel joint at each frame corner
 *
 * Per corner (everything stands on the corner node, nothing outboard of the 432 × 360 frame):
 *   mount plate   48 × 48 × 4 mm black plate bolted on the corner node
 *   base stage    44 mm T-slot tube, 210 mm, square bore (static)
 *   coupler       48 mm guide collar at the base mouth (static)
 *   inner stage   30 mm T-slot, moves +h; cascade gap to the bore = 1.5 mm
 *   cable drive   5203 motor + Ø32 mm spool on the side rail, steel rope over a sheave on the
 *                 coupler into the bore → inner stage (formula 15: F ≈ η G τ_m / r_s, 4 corners
 *                 synchronised by the swarm lift loop)
 *   corner cube   black block on the inner-stage top
 *   load cell     button load cell between cube and plate (F_i, δ_i) — moves with the plate
 * Shared (carriage): perimeter bars between the cubes, status LED strip, 432 × 360 × 12 mm
 * composite cargo plate with countersunk screw rows and 4 corner contact pads.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Assembly, alongAxis, beveledBox, cable, extrudeZ, screwHead, tslotShape } from './geometryKit';
import { indicatorMaterial } from './materials';
import { CORNER_NODE, FRAME, MECANUM_140, RAIL_TOP_Z } from './straferSpec';
import { DEFAULT_LIFT_PARAMS } from './liftDrive';

/** Rail top of the chassis frame (v2 name kept for consumers). */
export const CHASSIS_TOP_Z = RAIL_TOP_Z;
/** 140 mm wheel envelope (for clearance checks). */
export const WHEEL = {
  x: MECANUM_140.x, y: MECANUM_140.y, r: MECANUM_140.r,
  halfWidth: MECANUM_140.width / 2,
  topZ: 2 * MECANUM_140.r,
} as const;

export const GANTRY = {
  column: { x: CORNER_NODE.x, y: CORNER_NODE.y },
  mount: { s: 0.048, t: 0.004 },
  base: { half: 0.022, slotC: 0.003, slotD: 0.003, wall: 0.0025, length: 0.21 },
  inner: { half: 0.015, slotC: 0.003, slotD: 0.0025, length: 0.244, lift0: 0.006 },
  coupler: { half: 0.024, clearance: 0.0005, below: 0.022, above: 0.01 },
  /** Lift cable drive (spool radius = DEFAULT_LIFT_PARAMS.spoolRadius). */
  spool: { r: DEFAULT_LIFT_PARAMS.spoolRadius, flangeR: 0.0195, width: 0.016, flangeT: 0.002 },
  sheave: { t: 0.004 },
  rope: { r: 0.0006 },
  cube: 0.046,
  bar: 0.03,
  loadCell: { r: 0.012, t: 0.008 },
  plate: { hx: FRAME.hx, hy: FRAME.hy, t: 0.012 },
  sensor: { r: 0.016, proud: 0.0015 },
  /** Max visual compression of the load-cell stack under load (m). */
  maxDeflection: 0.0015,
  bevel: 0.0006,
} as const;

const Gt = GANTRY;
/** Cascade clearance between the base-stage bore and the inner stage (m). */
export const CASCADE_GAP = Gt.base.half - Gt.base.slotD - Gt.base.wall - Gt.inner.half; // 0.0015
export const MOUNT_TOP_Z = RAIL_TOP_Z + Gt.mount.t;                         // 0.098
export const BASE_TOP_Z = MOUNT_TOP_Z + Gt.base.length;                     // 0.308
export const COUPLER_TOP_Z = BASE_TOP_Z + Gt.coupler.above;                 // 0.318
/** Inner-stage bottom at extension h. */
export function innerBottomZ(h: number): number { return MOUNT_TOP_Z + Gt.inner.lift0 + h; }
/** Inner-stage top at h = 0 → bottom face of the corner cubes. */
export const FRAME_BASE_Z = innerBottomZ(0) + Gt.inner.length;            // 0.348
export const FRAME_TOP_Z = FRAME_BASE_Z + Gt.cube;                          // 0.394
export const PLATE_BOTTOM_Z = FRAME_TOP_Z + Gt.loadCell.t;                  // 0.402
export const PLATE_TOP_Z = PLATE_BOTTOM_Z + Gt.plate.t;                     // 0.414
/** World height of the contact surface (pad tops) at h = 0. */
export const PAD_BASE_Z = PLATE_TOP_Z + Gt.sensor.proud;                    // 0.4155
export const PAD_HALF_EXTENTS = { x: Gt.plate.hx, y: Gt.plate.hy } as const;
/** Square-equivalent half size kept for the v1 contract field `padHalfSize`. */
export const PAD_HALF_SIZE = Math.min(Gt.plate.hx, Gt.plate.hy);

/** Cable-drive datums (|x| measured on the inboard side of each column). */
const ROPE_X = Gt.column.x - Gt.coupler.half - 0.002;                       // 0.166 vertical run
const ROPE_DROP_X = Gt.column.x - Gt.inner.half - CASCADE_GAP / 2;          // 0.17625 into the bore
export const SHEAVE = { x: (ROPE_X + ROPE_DROP_X) / 2, r: (ROPE_DROP_X - ROPE_X) / 2, z: COUPLER_TOP_Z + 0.002 + (ROPE_DROP_X - ROPE_X) / 2 } as const;
export const SPOOL = { x: ROPE_X - Gt.spool.r, z: RAIL_TOP_Z + 0.006 + 0.002 + Gt.spool.flangeR } as const;

/** Column overlap between base and inner stage at extension h (must stay ≥ 40 mm). */
export function columnOverlap(h: number): number { return BASE_TOP_Z - innerBottomZ(h); }

export const CORNERS: readonly { key: string; sx: 1 | -1; sy: 1 | -1 }[] = [
  { key: 'FL', sx: 1, sy: 1 }, { key: 'FR', sx: 1, sy: -1 }, { key: 'RL', sx: -1, sy: 1 }, { key: 'RR', sx: -1, sy: -1 },
];

export interface GantryOptions {
  /** Merge parts into one mesh per material slot (default true). Tests pass false to audit named parts. */
  compile?: boolean;
}

/** Cylinder along +y, centred on the origin. */
function cylY(r: number, len: number, seg = 24): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, len, seg);
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(geos.map(g => (g.index ? g.toNonIndexed() : g)), false);
  geos.forEach(g => g.dispose());
  if (!m) throw new Error('ViperSlideRig: merge failed');
  return m;
}

export class ViperSlideRig {
  readonly root = new THREE.Group();
  readonly assembly = new Assembly('gantry');
  private readonly statusMat = indicatorMaterial(0x3fb950, 2.2);
  private readonly sensorMat = indicatorMaterial(0x555555, 1.6);
  private h = 0;
  // load-cell spring-damper (sim-time, clamped dt, terminal lock)
  private defl = 0;
  private deflVel = 0;
  private deflTarget = 0;

  constructor(opts: GantryOptions = {}) {
    this.root.name = 'four_post_gantry';
    this.assembly.groups.isolator.position.z = FRAME_TOP_Z;
    this.build();
    if (opts.compile ?? true) this.assembly.compile();
    this.root.add(this.assembly.groups.static, this.assembly.groups.carriage);
    this.setHeight(0);
  }

  private build(): void {
    const A = this.assembly;
    const up = new THREE.Vector3(0, 0, 1);

    for (const c of CORNERS) {
      const cx = c.sx * Gt.column.x, cy = c.sy * Gt.column.y;
      const k = c.key;

      // ── mount plate on the corner node (bolted from below through the U-channel web into the
      //    base-stage T-slot nuts, so no screw heads on top under the 44 mm tube) ──
      A.add(`mount_plate_${k}`, beveledBox(Gt.mount.s, Gt.mount.s, Gt.mount.t, { radius: 0.003 }), 'blackAnodized', 'static', [cx, cy, RAIL_TOP_Z], [`base_${k}`]);

      // ── base stage: 44 mm T-slot tube with square bore ──
      const bore = Gt.base.half - Gt.base.slotD - Gt.base.wall;
      A.add(`base_${k}`, extrudeZ(tslotShape(Gt.base.half, Gt.base.slotC, Gt.base.slotD, { kind: 'square', half: bore }), Gt.base.length, Gt.bevel), 'aluminiumAnodized', 'static', [cx, cy, MOUNT_TOP_Z], [`mount_plate_${k}`, `coupler_${k}`, `inner_${k}`]);

      // ── 48 mm guide collar at the base mouth, 2 screws per face (not on the rope face) ──
      const cz0 = BASE_TOP_Z - Gt.coupler.below, ch = Gt.coupler.below + Gt.coupler.above;
      const holeHalf = Gt.base.half + Gt.coupler.clearance;
      A.add(`coupler_${k}`, beveledBox(2 * Gt.coupler.half, 2 * Gt.coupler.half, ch, { radius: 0.002, hole: { w: 2 * holeHalf, d: 2 * holeHalf, r: 0.001 } }), 'blackAnodized', 'static', [cx, cy, cz0], [`base_${k}`, `inner_${k}`]);
      const faces: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      faces.forEach(([nx, ny], f) => {
        if (nx === -c.sx) return; // inboard x face carries the rope
        for (let s = 0; s < 2; s++) {
          const along = (s === 0 ? -1 : 1) * 0.012;
          const px = cx + nx * Gt.coupler.half + (ny !== 0 ? along : 0);
          const py = cy + ny * Gt.coupler.half + (nx !== 0 ? along : 0);
          A.add(`coupler_screw_${k}_${f}_${s}`, screwHead(new THREE.Vector3(nx, ny, 0), 0.0026, 0.0008), 'steelFastener', 'static', [px, py, cz0 + ch * 0.45], [`coupler_${k}`]);
        }
      });

      // ── inner stage (moves with the carriage) ──
      A.add(`inner_${k}`, extrudeZ(tslotShape(Gt.inner.half, Gt.inner.slotC, Gt.inner.slotD, { kind: 'round', r: 0.0042 }), Gt.inner.length, Gt.bevel), 'aluminiumAnodized', 'carriage', [cx, cy, innerBottomZ(0)], [`base_${k}`, `coupler_${k}`, `cube_${k}`]);

      this.buildCableDrive(c);

      // ── corner cube on the inner-stage top ──
      A.add(`cube_${k}`, beveledBox(Gt.cube, Gt.cube, Gt.cube, { radius: 0.004, bevel: 0.0012 }), 'blackAnodized', 'carriage', [cx, cy, FRAME_BASE_Z], [`inner_${k}`, `load_cell_${k}`, 'bar_front', 'bar_rear', 'bar_left', 'bar_right']);

      // ── button load cell (isolator layer origin = FRAME_TOP_Z; its z-scale shows compression) ──
      const lc = new THREE.CylinderGeometry(Gt.loadCell.r, Gt.loadCell.r, Gt.loadCell.t, 24);
      lc.rotateX(Math.PI / 2); lc.translate(0, 0, Gt.loadCell.t / 2);
      A.add(`load_cell_${k}`, lc, 'loadCellAlloy', 'isolator', [cx, cy, 0], [`cube_${k}`, 'cargo_plate']);
    }

    // ── perimeter frame bars between the cubes (top flush with the cubes) ──
    const barZ = FRAME_TOP_Z - Gt.bar;
    const lenX = 2 * (Gt.column.x - Gt.cube / 2), lenY = 2 * (Gt.column.y - Gt.cube / 2);
    const barShape = () => tslotShape(Gt.bar / 2, 0.003, 0.0025, { kind: 'round', r: 0.0042 });
    for (const [name, sy] of [['bar_left', 1], ['bar_right', -1]] as const) {
      const g = alongAxis(extrudeZ(barShape(), lenX, Gt.bevel), 'x', lenX);
      A.add(name, g, 'aluminiumAnodized', 'carriage', [0, sy * Gt.column.y, barZ + Gt.bar / 2], CORNERS.map(c => `cube_${c.key}`));
    }
    for (const [name, sx] of [['bar_front', 1], ['bar_rear', -1]] as const) {
      const g = alongAxis(extrudeZ(barShape(), lenY, Gt.bevel), 'y', lenY);
      A.add(name, g, 'aluminiumAnodized', 'carriage', [sx * Gt.column.x, 0, barZ + Gt.bar / 2], CORNERS.map(c => `cube_${c.key}`));
    }
    // mode status LED strip on the outer face of the front bar
    A.add('status_led', beveledBox(0.002, 0.16, 0.008, { radius: 0.0008, bevel: 0.0003 }), this.statusMat, 'carriage', [Gt.column.x + Gt.bar / 2 + 0.001, 0, barZ + Gt.bar / 2 - 0.004], ['bar_front']);

    // ── 432 × 360 composite cargo plate + countersunk screw rows + corner contact pads ──
    A.add('cargo_plate', beveledBox(2 * Gt.plate.hx, 2 * Gt.plate.hy, Gt.plate.t, { radius: 0.006, bevel: 0.0012 }), 'compositePlate', 'plate', [0, 0, PLATE_BOTTOM_Z], CORNERS.map(c => `load_cell_${c.key}`));
    let n = 0;
    const screw = (x: number, y: number) => A.add(`plate_screw_${n++}`, screwHead(up, 0.0035, 0.0004), 'steelFastener', 'plate', [x, y, PLATE_TOP_Z - 0.0001], ['cargo_plate']);
    for (let x = -0.144; x <= 0.1441; x += 0.048) { screw(x, Gt.column.y); screw(x, -Gt.column.y); }
    for (let y = -0.096; y <= 0.0961; y += 0.048) { screw(Gt.column.x, y); screw(-Gt.column.x, y); }
    for (let x = -0.096; x <= 0.0961; x += 0.096) for (let y = -0.096; y <= 0.0961; y += 0.096) screw(x, y); // centre field
    for (const c of CORNERS) {
      const g = new THREE.CylinderGeometry(Gt.sensor.r, Gt.sensor.r, Gt.sensor.proud + 0.002, 20);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, (Gt.sensor.proud + 0.002) / 2 - 0.002); // seated 2 mm into the plate recess
      A.add(`contact_sensor_${c.key}`, g, this.sensorMat, 'plate', [c.sx * Gt.column.x, c.sy * Gt.column.y, PLATE_TOP_Z], ['cargo_plate']);
    }
  }

  /** 5203 lift motor + spool on the side rail, rope up the inboard face, sheave on the coupler. */
  private buildCableDrive(c: { key: string; sx: 1 | -1; sy: 1 | -1 }): void {
    const A = this.assembly;
    const k = c.key, cy = c.sy * Gt.column.y;
    const sp = Gt.spool;
    const spx = c.sx * SPOOL.x;
    const id = {
      spool: `spool_${k}`, block: `spool_block_${k}`, cheekI: `spool_cheek_${k}_i`, cheekO: `spool_cheek_${k}_o`,
      gear: `lift_gearbox_${k}`, motor: `lift_motor_${k}`, sheave: `sheave_${k}`, rope: `wire_rope_${k}`,
      shc0: `sheave_cheek_${k}_0`, shc1: `sheave_cheek_${k}_1`,
    };

    // pillow block on the side-rail top
    A.add(id.block, beveledBox(0.03, 0.036, 0.006, { radius: 0.002 }), 'blackAnodized', 'static', [spx, cy, RAIL_TOP_Z], [id.cheekI, id.cheekO]);
    // spool: Ø32 drum + two flanges (axis along y)
    const fl1 = cylY(sp.flangeR, sp.flangeT); fl1.translate(0, sp.width / 2 + sp.flangeT / 2, 0);
    const fl2 = cylY(sp.flangeR, sp.flangeT); fl2.translate(0, -sp.width / 2 - sp.flangeT / 2, 0);
    A.add(id.spool, mergeAll([cylY(sp.r, sp.width), fl1, fl2]), 'aluminiumAnodized', 'static', [spx, cy, SPOOL.z], [id.cheekI, id.cheekO, id.rope]);
    // cheek plates either side of the spool
    const cheekY = sp.width / 2 + sp.flangeT + 0.003;
    const cheekZ0 = RAIL_TOP_Z + 0.006;
    for (const [cid, side] of [[id.cheekO, 1], [id.cheekI, -1]] as const) {
      A.add(cid, beveledBox(0.02, 0.003, SPOOL.z + 0.006 - cheekZ0, { radius: 0.001 }), 'blackAnodized', 'static', [spx, cy + c.sy * side * cheekY, cheekZ0], [id.block, id.spool, ...(side < 0 ? [id.gear] : [])]);
    }
    // 5203 gearbox + motor can, coaxial with the spool, inboard of the inner cheek
    const yIn = cy - c.sy * (cheekY + 0.0015);
    const gearL = 0.03, canL = 0.035;
    A.add(id.gear, cylY(0.018, gearL), 'gearboxGold', 'static', [spx, yIn - c.sy * gearL / 2, SPOOL.z], [id.cheekI, id.motor]);
    A.add(id.motor, cylY(0.0165, canL), 'motorCan', 'static', [spx, yIn - c.sy * (gearL + canL / 2), SPOOL.z], [id.gear]);

    // sheave on the coupler top (axis along y) between two cheeks
    const shx = c.sx * SHEAVE.x;
    A.add(id.sheave, cylY(SHEAVE.r, Gt.sheave.t, 20), 'steelFastener', 'static', [shx, cy, SHEAVE.z], [id.shc0, id.shc1, id.rope]);
    for (let i = 0; i < 2; i++) {
      const g = beveledBox(0.0125, 0.0015, 2 * SHEAVE.r + 0.004, { radius: 0.0005, bevel: 0.0002 });
      A.add(i ? id.shc1 : id.shc0, g, 'blackAnodized', 'static', [c.sx * (SHEAVE.x - 0.0006), cy + (i ? 1 : -1) * (Gt.sheave.t / 2 + 0.0012), COUPLER_TOP_Z], [`coupler_${k}`, id.sheave]);
    }

    // steel rope: spool tangent → up the inboard face → over the sheave → down into the bore
    const ropeX = c.sx * ROPE_X, dropX = c.sx * ROPE_DROP_X;
    const pts: [number, number, number][] = [[ropeX, cy, SPOOL.z], [ropeX, cy, (SPOOL.z + SHEAVE.z) / 2], [ropeX, cy, SHEAVE.z]];
    for (let i = 1; i < 8; i++) {
      const a = Math.PI - (Math.PI * i) / 8; // over the top of the sheave
      pts.push([shx + c.sx * SHEAVE.r * Math.cos(a), cy, SHEAVE.z + SHEAVE.r * Math.sin(a)]);
    }
    pts.push([dropX, cy, SHEAVE.z], [dropX, cy, COUPLER_TOP_Z - 0.01], [dropX, cy, COUPLER_TOP_Z - 0.02]);
    A.add(id.rope, cable(pts, Gt.rope.r), 'steelCable', 'static', [0, 0, 0], [id.spool, id.sheave, `coupler_${k}`, `base_${k}`, `inner_${k}`, id.shc0, id.shc1]);
  }

  /** Lift extension h (m): carriage (inner stages + frame + plate) rises by h. */
  setHeight(h: number): void {
    this.h = h;
    this.assembly.groups.carriage.position.z = h;
  }

  get height(): number { return this.h; }

  /** Local z of the contact surface (nominal, without visual deflection). */
  get padTopZ(): number { return PAD_BASE_Z + this.h; }

  /** Payload force on the plate (N) → target load-cell stack compression (visual, ≤ maxDeflection). */
  setLoad(force: number): void {
    this.deflTarget = Math.min(Gt.maxDeflection, Math.max(0, force) / 2.4e5);
  }

  get deflection(): number { return this.defl; }

  /**
   * Advance the plate spring-damper by dt (sim seconds). Critically damped, sub-stepped for
   * stability, with a terminal lock once the residual is imperceptible.
   */
  animate(dt: number): void {
    if (!(dt > 0)) return;
    const k = 900, c = 2 * Math.sqrt(k); // ω_n = 30 rad/s, ζ = 1
    let rem = Math.min(dt, 0.1);
    while (rem > 1e-9) {
      const h = Math.min(rem, 1 / 240);
      const acc = k * (this.deflTarget - this.defl) - c * this.deflVel;
      this.deflVel += acc * h;
      this.defl += this.deflVel * h;
      rem -= h;
    }
    if (Math.abs(this.deflTarget - this.defl) < 1e-6 && Math.abs(this.deflVel) < 1e-5) { this.defl = this.deflTarget; this.deflVel = 0; }
    this.assembly.groups.plate.position.z = -this.defl;
    this.assembly.groups.isolator.scale.z = (Gt.loadCell.t - this.defl) / Gt.loadCell.t;
  }

  setStatusColor(color: THREE.ColorRepresentation, intensity = 2.2): void {
    this.statusMat.emissive.set(color);
    this.statusMat.emissiveIntensity = intensity;
  }

  /** Contact indicator: true = δ > 0, false = no contact, null = sensor/physics not available. */
  setContact(state: boolean | null): void {
    this.sensorMat.emissive.set(state === null ? 0x555555 : state ? 0x3fb950 : 0xf2b233);
  }

  dispose(): void {
    this.assembly.dispose();
    this.statusMat.dispose();
    this.sensorMat.dispose();
  }
}

/** v2 name. */
export { ViperSlideRig as FourPostGantryRig };
