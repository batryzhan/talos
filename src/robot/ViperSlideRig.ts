/**
 * Procedural Viper Slide lift + support pad on top of the goBILDA Strafer chassis.
 *
 * Frame: robot local, Z-up, metres, +x forward, +y left (same as the .glb).
 * Single datum: CHASSIS_TOP_Z — top of the side rails / centre channel measured from the CAD
 * (z = 0.072 m across |y| ∈ [0.12, 0.16] and x = 0). Every part below is placed from it.
 *
 *  - deck plate spans both side rails (supported by them), clears the wheels (|x| < 0.12)
 *  - two telescoping columns at y = ±COLUMN_Y, 4 stages each (1 fixed + 3 moving), hollow
 *    beveled aluminium tubes, 1.5 mm radial clearance, cascade rigging: every moving stage
 *    extends h/3 relative to its parent
 *  - carriage beam bridges the innermost stages; support plate + rubber pad on top
 *  - motor/spool housing on the deck, status LED bar at the deck front, contact ring at the pad
 */
import * as THREE from 'three';

export const CHASSIS_TOP_Z = 0.072;

export const SLIDE_GEOM = {
  deck: { sx: 0.2, sy: 0.32, t: 0.006 },
  columnY: 0.09,
  stages: 4,
  stageLength: 0.18,
  /** Outer cross-section of the fixed stage (x × y). */
  baseSection: { w: 0.048, d: 0.04 },
  wall: 0.0025,
  clearance: 0.0015,
  /** Each nested stage protrudes this much above its parent when retracted. */
  stagger: 0.006,
  beam: { sx: 0.06, sy: 2 * 0.09 + 0.03, t: 0.01 },
  plate: { s: 0.14, t: 0.006 },
  pad: { s: 0.13, t: 0.01 },
  bevel: 0.0008,
} as const;

const G = SLIDE_GEOM;
export const DECK_TOP_Z = CHASSIS_TOP_Z + G.deck.t;
const MOVING = G.stages - 1;
/** Top of the innermost stage at h = 0. */
const INNER_TOP0 = DECK_TOP_Z + MOVING * G.stagger + G.stageLength;
/** World height of the rubber pad top surface at h = 0 (robot on the floor). */
export const PAD_BASE_Z = INNER_TOP0 + G.beam.t + G.plate.t + G.pad.t;
export const PAD_HALF_SIZE = G.pad.s / 2;

/** Outer section of stage k (0 = fixed). */
export function stageSection(k: number): { w: number; d: number } {
  const dec = 2 * (G.wall + G.clearance) * k;
  return { w: G.baseSection.w - dec, d: G.baseSection.d - dec };
}

/** Bottom z of stage k at lift extension h (cascade rigging). */
export function stageBottomZ(k: number, h: number): number {
  return DECK_TOP_Z + k * G.stagger + (k * h) / MOVING;
}

// ───────────────────────── mesh helpers ─────────────────────────

function roundedRect(w: number, d: number, r: number): THREE.Shape | THREE.Path {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function holePath(w: number, d: number, r: number): THREE.Path {
  // Holes must wind opposite to the outer contour.
  const p = new THREE.Path();
  const x = -w / 2, y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  p.moveTo(x + r, y);
  p.quadraticCurveTo(x, y, x, y + r); p.lineTo(x, y + d - r);
  p.quadraticCurveTo(x, y + d, x + r, y + d); p.lineTo(x + w - r, y + d);
  p.quadraticCurveTo(x + w, y + d, x + w, y + d - r); p.lineTo(x + w, y + r);
  p.quadraticCurveTo(x + w, y, x + w - r, y); p.lineTo(x + r, y);
  return p;
}

/** Beveled prism spanning z ∈ [0, height] exactly (bevel included). Optional rectangular hole → thick shell tube. */
function beveledPrism(w: number, d: number, height: number, opts: { wall?: number; radius?: number; bevel?: number } = {}): THREE.BufferGeometry {
  const bevel = Math.min(opts.bevel ?? G.bevel, height / 4, w / 6, d / 6);
  const r = opts.radius ?? Math.min(w, d) * 0.12;
  // ExtrudeGeometry grows the outline by bevelSize; shrink the profile so outer dims stay exact.
  const shape = roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(0, r - bevel)) as THREE.Shape;
  if (opts.wall) {
    const iw = w - 2 * opts.wall + 2 * bevel, id = d - 2 * opts.wall + 2 * bevel;
    shape.holes.push(holePath(iw, id, Math.max(0, r - opts.wall)));
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 3,
  });
  geo.translate(0, 0, bevel);
  geo.computeVertexNormals();
  return geo;
}

// ───────────────────────── materials ─────────────────────────

function makeMaterials() {
  return {
    stage: new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 0.85, roughness: 0.36 }),
    stageDark: new THREE.MeshStandardMaterial({ color: 0x2e3136, metalness: 0.8, roughness: 0.42 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x3a3d43, metalness: 0.8, roughness: 0.45 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9a21f, metalness: 0.85, roughness: 0.35 }),
    motor: new THREE.MeshStandardMaterial({ color: 0x1e1f23, metalness: 0.6, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0, roughness: 0.92 }),
    status: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3fb950, emissiveIntensity: 2.2, roughness: 0.4 }),
    contact: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x555555, emissiveIntensity: 1.6, roughness: 0.4 }),
  };
}

// ───────────────────────── rig ─────────────────────────

export class ViperSlideRig {
  readonly root = new THREE.Group();
  /** Moving stages per column: stages[col][k] (k = 0 fixed). */
  private readonly stages: THREE.Mesh[][] = [];
  /** Carriage: beam + plate + pad + contact ring; moves with the innermost stage. */
  readonly carriage = new THREE.Group();
  private readonly mats = makeMaterials();
  private h = 0;

  constructor() {
    this.root.name = 'viper_slide';
    const m = this.mats;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, name: string, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name; mesh.position.set(x, y, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // deck: bottom face on CHASSIS_TOP_Z (rests on both side rails)
    add(this.root, beveledPrism(G.deck.sx, G.deck.sy, G.deck.t, { radius: 0.008 }), m.deck, 'deck', 0, 0, CHASSIS_TOP_Z);

    // telescoping columns
    for (const side of [1, -1]) {
      const col: THREE.Mesh[] = [];
      for (let k = 0; k < G.stages; k++) {
        const { w, d } = stageSection(k);
        const mat = k % 2 === 0 ? m.stage : m.stageDark;
        col.push(add(this.root, beveledPrism(w, d, G.stageLength, { wall: G.wall, radius: 0.003 }), mat, `stage_${side > 0 ? 'L' : 'R'}${k}`, 0, side * G.columnY, stageBottomZ(k, 0)));
      }
      this.stages.push(col);
    }

    // motor + spool housing behind the columns, on the deck
    const hx = -0.065;
    add(this.root, beveledPrism(0.05, 0.1, 0.045, { radius: 0.004 }), m.motor, 'spool_housing', hx, 0, DECK_TOP_Z);
    for (const side of [1, -1]) {
      // gearbox barrel (CylinderGeometry axis = +y), resting on the deck, flush with the housing side
      const gb = new THREE.CylinderGeometry(0.018, 0.018, 0.05, 20);
      add(this.root, gb, m.gold, `lift_gearbox_${side > 0 ? 'L' : 'R'}`, hx, side * (0.05 + 0.025), DECK_TOP_Z + 0.018);
    }

    // status LED bar along the front edge of the deck
    add(this.root, beveledPrism(0.01, 0.2, 0.008, { radius: 0.002, bevel: 0.0005 }), m.status, 'status_led', G.deck.sx / 2 - 0.008, 0, DECK_TOP_Z);

    // carriage (positioned in setHeight): beam → plate → rubber pad, contact ring around the pad
    this.carriage.name = 'carriage';
    let z = 0;
    add(this.carriage, beveledPrism(G.beam.sx, G.beam.sy, G.beam.t, { radius: 0.004 }), m.stage, 'carriage_beam', 0, 0, z); z += G.beam.t;
    add(this.carriage, beveledPrism(G.plate.s, G.plate.s, G.plate.t, { radius: 0.006 }), m.deck, 'support_plate', 0, 0, z); z += G.plate.t;
    add(this.carriage, beveledPrism(G.pad.s - 0.012, G.pad.s - 0.012, G.pad.t, { radius: 0.01 }), m.rubber, 'support_pad', 0, 0, z);
    add(this.carriage, beveledPrism(G.pad.s, G.pad.s, G.pad.t * 0.6, { wall: 0.005, radius: 0.01, bevel: 0.0005 }), m.contact, 'contact_ring', 0, 0, z);
    this.root.add(this.carriage);

    this.setHeight(0);
  }

  /** Lift extension h (m) → stage + carriage positions. */
  setHeight(h: number): void {
    this.h = h;
    for (const col of this.stages) col.forEach((mesh, k) => { mesh.position.z = stageBottomZ(k, h); });
    this.carriage.position.z = INNER_TOP0 + h;
  }

  get height(): number { return this.h; }

  /** Local z of the pad top surface. */
  get padTopZ(): number { return PAD_BASE_Z + this.h; }

  setStatusColor(color: THREE.ColorRepresentation, intensity = 2.2): void {
    this.mats.status.emissive.set(color);
    this.mats.status.emissiveIntensity = intensity;
  }

  /** true = contact (δ > 0), false = no contact, null = sensor not available. */
  setContact(state: boolean | null): void {
    this.mats.contact.emissive.set(state === null ? 0x555555 : state ? 0x3fb950 : 0xf2b233);
  }

  dispose(): void {
    this.root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    Object.values(this.mats).forEach(mat => mat.dispose());
  }
}
