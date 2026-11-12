/**
 * TalosRobotAgent — one Industrial TALOS: goBILDA Strafer chassis + four-corner gantry lift.
 *
 * Visual model (v3, straferSpec.ts): CAD Strafer frame (432 × 360 mm, goBILDA 1120 U-channel) lifted to
 * 46 mm clearance, procedural goBILDA 140 mm mecanum wheels (16 yellow PU rollers at 45°, steel side
 * plates), TalosChassis dressing (TALOS nameplates, REV Control Hub, battery + red kill switch,
 * wiring) and the four-post gantry (corner-node columns, cable drive, 432 × 360 plate, 4 load cells).
 *
 * Owns: .glb rig (wheels + rollers), Mecanum kinematics (formula 14 with uniform saturation),
 * Viper Slide drive (formula 15) with HOLD position lock, local sensors (height, drive current,
 * contact trigger δ > 0, battery b_i, optional force sensor → null when absent) and the
 * AgentMessage producer. Works headless (no model) for tests and the swarm.
 *
 * Integration contract: the platform calls `step(dt)` at its physics rate and `syncVisuals()`
 * once per rendered frame. The swarm drives it via `setWheelRates` / `setLiftCommand` / `setMode`
 * (or manual control via `setTwistCommand`).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type {
  AgentMessage, AgentState, HealthFlag, LiftDriveParams, MecanumGeometry, OperationMode, Pose2D,
  SupportContactInput, SupportContactOutput, Twist2D, WheelId, WheelRates, TerrainMotion,
} from '../contracts/types';
import { WHEEL_ORDER } from '../contracts/types';
import { forwardKinematicsInto, inverseKinematicsInto, saturateUniformInPlace, slewUniformInto, MECANUM_SIGNS } from './mecanum';
import { DEFAULT_LIFT_PARAMS, createLiftState, stepLift, type LiftState } from './liftDrive';
import { PAD_BASE_Z, PAD_HALF_EXTENTS, PAD_HALF_SIZE, ViperSlideRig } from './ViperSlideRig';
import { TalosChassis, dressStraferModel } from './TalosChassis';
import { buildMecanumWheels } from './MecanumWheel';
import { CHASSIS_LIFT, DRIVE_OMEGA_FREE, MECANUM_140, ROBOT_FOOTPRINT } from './straferSpec';

/**
 * Strafer kinematics with 140 mm wheels: a, b = CAD axle half-spacings, ω_max = 5203 26.9:1 free
 * speed (223 rpm = 23.35 rad/s → 1.63 m/s at the rim).
 */
export const STRAFER_GEOMETRY: MecanumGeometry = {
  r: MECANUM_140.r,
  a: MECANUM_140.x,
  b: MECANUM_140.y,
  omegaMax: DRIVE_OMEGA_FREE,
  alphaMax: 7.0 / MECANUM_140.r, // 7 m/s² rim slew (traction limit, μ ≈ 0.7)
};

/** Robot footprint half extents incl. the wheel overhang (m). */
export const STRAFER_FOOTPRINT = { halfX: ROBOT_FOOTPRINT.halfX, halfY: ROBOT_FOOTPRINT.halfY };

/** Corner load-cell order on the cargo plate. */
export const LOAD_CELL_CORNERS = ['FL', 'FR', 'RL', 'RR'] as const;
export type LoadCellCorner = (typeof LOAD_CELL_CORNERS)[number];
export interface LoadCellReading {
  corner: LoadCellCorner;
  /** Corner force (N), or null when the cell is absent / uncalibrated / not in contact data. */
  force: number | null;
}

export const MODE_COLORS: Record<OperationMode, number> = {
  READY: 0x3fb950,
  APPROACH: 0x39c5cf,
  CONTACT: 0xf2d233,
  LIFT: 0xf28c28,
  TRANSPORT: 0x3b82f6,
  LOWER: 0xa371f7,
  HOLD: 0xf85149,
};

export type ForceSensorStatus = 'calibrated' | 'uncalibrated' | 'absent';

export interface TalosRobotAgentOptions {
  id: number;
  terrain?: TerrainMotion;
  /** Strafer model template (from loadStraferModel). It is cloned; omit for headless agents. */
  model?: THREE.Object3D;
  geometry?: Partial<MecanumGeometry>;
  lift?: Partial<LiftDriveParams>;
  forceSensor?: ForceSensorStatus;
  /** Battery capacity (Wh). goBILDA 12 V 3000 mAh NiMH ≈ 36 Wh. */
  batteryWh?: number;
  pose?: Pose2D;
  /** Support stiffness k_i (N/m), damping c_i (N·s/m) and allowed force F_allow (N). */
  stiffness?: number;
  damping?: number;
  fAllow?: number;
}

interface WheelRig {
  id: WheelId;
  node: THREE.Object3D;
  /** Unit axis of the contact roller in the body XY plane (from CAD). */
  ax: number; ay: number;
  x: number; y: number;
  angle: number;
  rollers: { node: THREE.Object3D; axis: THREE.Vector3; phi0: number; angle: number }[];
}

const ROLLER_RADIUS = MECANUM_140.roller.rMax;
const ZERO_RATES: WheelRates = [0, 0, 0, 0];

/** Load the Strafer .glb once; pass `gltf.scene` as `model` to each agent. */
export function loadStraferModel(url = '/robot.glb', onProgress?: (loaded: number, total: number) => void): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, g => {
      g.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      resolve(g.scene);
    }, e => { if (e.total && onProgress) onProgress(e.loaded, e.total); }, reject);
  });
}

export class TalosRobotAgent {
  readonly id: number;
  /** Pose root: footprint centre on the floor. Add to the scene. */
  readonly root = new THREE.Group();
  readonly slide: ViperSlideRig | null = null;
  readonly chassis: TalosChassis | null = null;
  private lastVisualTime = 0;
  readonly terrain?: TerrainMotion;
  get groundZ(): number { return this.terrain?.field.heightAt(this.pose.x, this.pose.y) ?? 0; }
  get slopeDegrees(): number { const g=this.terrain?.field.gradientAt(this.pose.x,this.pose.y);return g?Math.atan(Math.hypot(g.x,g.y))*180/Math.PI:0; }
  readonly geometry: MecanumGeometry;
  readonly liftParams: LiftDriveParams;
  readonly forceSensor: ForceSensorStatus;
  readonly footprint = STRAFER_FOOTPRINT;

  // ── state ──
  readonly pose: Pose2D;
  /** Measured body twist (from wheel odometry). */
  readonly twist: Twist2D = { vx: 0, vy: 0, omega: 0 };
  /** Actual wheel rates (rad/s) after slew limiting, FL FR RL RR. */
  readonly wheelRates: WheelRates = [0, 0, 0, 0];
  private readonly wheelTarget: WheelRates = [0, 0, 0, 0];
  /** Scratch twist of the forward kinematics (reused every step). */
  private readonly odom: Twist2D = { vx: 0, vy: 0, omega: 0 };
  /** Scratch lift input (reused every step). */
  private readonly liftInput = { u: 0, loadForce: 0, lock: false, fault: false };
  /** α applied by the last uniform saturation (1 = unsaturated). */
  saturationAlpha = 1;
  readonly lift: LiftState;
  private liftCmd = 0;
  private liftLockCmd = false;
  liftFault = false;
  mode: OperationMode = 'READY';
  battery = 1;
  quality = 1;
  /** Local clock (s). */
  localTime = 0;
  private seq = 0;
  private batteryJ: number;
  /** Last support contact from physics (null until the physics engine reports one). */
  contact: SupportContactOutput | null = null;
  readonly stiffness: number;
  readonly damping: number;
  readonly fAllow: number;

  private readonly wheels: WheelRig[] = [];

  constructor(opts: TalosRobotAgentOptions) {
    this.id = opts.id;
    this.terrain = opts.terrain;
    this.root.name = `talos_agent_${opts.id}`;
    this.geometry = { ...STRAFER_GEOMETRY, ...opts.geometry };
    this.liftParams = { ...DEFAULT_LIFT_PARAMS, ...opts.lift };
    this.forceSensor = opts.forceSensor ?? 'absent';
    this.batteryJ = (opts.batteryWh ?? 36) * 3600;
    this.pose = { x: 0, y: 0, theta: 0, ...opts.pose };
    this.lift = createLiftState(this.liftParams.hMin);
    this.stiffness = opts.stiffness ?? 2.0e5;
    this.damping = opts.damping ?? 2.0e3;
    this.fAllow = opts.fAllow ?? 400;

    if (opts.model) {
      const model = opts.model.clone(true);
      dressStraferModel(model);
      // The STEP export carries 96 mm wheels: drop them, mount 140 mm wheels on the same axles and
      // raise the frame by Δr (frame bottom 24 → 46 mm).
      const cadWheels: THREE.Object3D[] = [];
      model.traverse(n => { if (n.name.startsWith('wheel_')) cadWheels.push(n); });
      cadWheels.forEach(n => n.removeFromParent());
      model.position.z += CHASSIS_LIFT;
      this.root.add(model);
      const wheels = new THREE.Group();
      wheels.name = 'mecanum_140';
      wheels.add(...buildMecanumWheels());
      this.root.add(wheels);
      this.rigWheels(wheels);
      this.chassis = new TalosChassis();
      this.root.add(this.chassis.root);
      this.chassis.setStatusColor(MODE_COLORS[this.mode]);
      this.slide = new ViperSlideRig();
      this.root.add(this.slide.root);
      this.slide.setStatusColor(MODE_COLORS[this.mode]);
      this.slide.setContact(null);
    }
    this.syncVisuals();
  }

  private rigWheels(model: THREE.Object3D): void {
    model.traverse(n => {
      if (!n.name.startsWith('wheel_')) return;
      const ex = n.userData as { id: WheelId; radius: number; axisXY: [number, number] };
      // CAD rollers are exactly 45°: snap the measured axis.
      const ax = Math.sign(ex.axisXY[0]) * Math.SQRT1_2, ay = Math.SQRT1_2;
      const w: WheelRig = { id: ex.id, node: n, ax, ay, x: n.position.x, y: n.position.y, angle: 0, rollers: [] };
      for (const r of n.children) {
        if (!r.name.startsWith('roller_')) continue;
        const axis = new THREE.Vector3(...(r.userData.axis as [number, number, number]));
        if (axis.y < 0) axis.negate();
        w.rollers.push({ node: r, axis, phi0: Math.atan2(r.position.z, r.position.x), angle: 0 });
      }
      this.wheels.push(w);
    });
    this.wheels.sort((p, q) => WHEEL_ORDER.indexOf(p.id) - WHEEL_ORDER.indexOf(q.id));
    // Verify the CAD roller layout matches formula 14 (X configuration): k = ay/ax must equal the row's vy sign.
    this.wheels.forEach((w, i) => {
      const k = Math.sign(w.ay / w.ax);
      if (k !== MECANUM_SIGNS[i][0]) console.warn(`[TALOS] wheel ${w.id}: CAD roller slope ${k} ≠ formula 14 sign ${MECANUM_SIGNS[i][0]}`);
    });
  }

  // ───────────────────────── commands ─────────────────────────

  /** Body-frame twist command → formula 14 + uniform saturation. `limitScale` scales ω_max (e.g. Shift slow mode). */
  setTwistCommand(t: Twist2D, limitScale = 1): void {
    inverseKinematicsInto(t, this.geometry, this.wheelTarget);
    this.saturationAlpha = saturateUniformInPlace(this.wheelTarget, this.geometry.omegaMax * limitScale);
  }

  /** Wheel rate targets from the swarm. Re-saturated uniformly as a safety net. */
  setWheelRates(w: WheelRates): void {
    for (let i = 0; i < 4; i++) this.wheelTarget[i] = w[i];
    this.saturationAlpha = saturateUniformInPlace(this.wheelTarget, this.geometry.omegaMax);
  }

  setLiftCommand(u: number, lock = false): void {
    this.liftCmd = u;
    this.liftLockCmd = lock;
  }

  /** Set FSM mode. HOLD ⇒ wheels zeroed + lift position lock (power is never cut). */
  setMode(mode: OperationMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'HOLD') this.hold();
    if (mode === 'LIFT') this.wheelTarget.fill(0); // chassis locked during pure lift
    this.slide?.setStatusColor(MODE_COLORS[mode]);
    this.chassis?.setStatusColor(MODE_COLORS[mode]);
  }

  /** Safe hold: zero chassis, engage lift position lock at the current height. */
  hold(): void {
    this.wheelTarget.fill(0);
    this.liftCmd = 0;
    this.liftLockCmd = true;
  }

  setBattery(b: number): void {
    this.battery = Math.min(1, Math.max(0, b));
  }

  reset(pose: Partial<Pose2D> = {}): void {
    Object.assign(this.pose, { x: 0, y: 0, theta: 0 }, pose);
    Object.assign(this.twist, { vx: 0, vy: 0, omega: 0 });
    this.wheelRates.fill(0);
    this.wheelTarget.fill(0);
    Object.assign(this.lift, createLiftState(this.liftParams.hMin));
    this.liftCmd = 0;
    this.liftLockCmd = false;
    this.contact = null;
    this.mode = 'READY';
    this.slide?.setStatusColor(MODE_COLORS.READY);
    this.chassis?.setStatusColor(MODE_COLORS.READY);
    this.slide?.setContact(null);
  }

  // ───────────────────────── simulation ─────────────────────────

  /**
   * Advance the robot by dt (s). `constrainPose` lets the world resolve collisions in place.
   */
  step(dt: number, constrainPose?: (pose: Pose2D, footprint: { halfX: number; halfY: number }) => void): void {
    this.localTime += dt;
    const g = this.geometry;
    const holding = this.mode === 'HOLD';
    const wheelsLocked = holding || this.mode === 'LIFT';
    const target: WheelRates = wheelsLocked ? ZERO_RATES : this.wheelTarget;

    slewUniformInto(this.wheelRates, target, g.alphaMax * dt, this.wheelRates);
    const tw = forwardKinematicsInto(this.wheelRates, g, this.odom);
    const terrain = this.terrain, field = terrain?.field;
    const grad = field?.gradientAt(this.pose.x, this.pose.y);
    const wx = tw.vx*Math.cos(this.pose.theta)-tw.vy*Math.sin(this.pose.theta);
    const wy = tw.vx*Math.sin(this.pose.theta)+tw.vy*Math.cos(this.pose.theta);
    const uphill = grad ? Math.max(0,grad.x*wx+grad.y*wy) : 0;
    const kSlope = grad ? Math.max(.35,Math.min(1,1-Math.hypot(grad.x,grad.y)*(terrain?.slopeSlowdown??1.5))) : 1;
    const speed = kSlope*(field?.speedAt?.(this.pose.x,this.pose.y)??1);
    tw.vx*=speed;tw.vy*=speed;
    const oldX=this.pose.x,oldY=this.pose.y;
    this.twist.vx = tw.vx; this.twist.vy = tw.vy; this.twist.omega = tw.omega;
    const c = Math.cos(this.pose.theta), s = Math.sin(this.pose.theta);
    this.pose.x += (tw.vx * c - tw.vy * s) * dt;
    this.pose.y += (tw.vx * s + tw.vy * c) * dt;
    this.pose.theta += tw.omega * dt;
    if (field?.passable && !field.passable(this.pose.x,this.pose.y)) {this.pose.x=oldX;this.pose.y=oldY;}
    constrainPose?.(this.pose, this.footprint);

    // lift
    const load = this.contact ? Math.max(0, this.contact.force) : 0;
    const li = this.liftInput;
    li.u = this.liftCmd; li.loadForce = load; li.lock = holding || this.liftLockCmd; li.fault = this.liftFault;
    stepLift(this.lift, this.liftParams, li, dt);

    // battery: chassis motors (4 × free current + load-proportional) + lift
    let iDrive = 0;
    for (const w of this.wheelRates) iDrive += 0.25 + 2.0 * Math.abs(w) / g.omegaMax;
    const pTotal = 12 * iDrive + this.lift.elecPower + 2.0 + uphill*(terrain?.uphillWatts??0) + (field?.extraWattsAt?.(this.pose.x,this.pose.y)??0); // + 2 W electronics/radio
    this.battery = Math.max(0, this.battery - (pTotal * dt) / this.batteryJ);

    // wheel / roller animation state
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      const u = this.wheelRates[i] * g.r; // rim speed
      w.angle += this.wheelRates[i] * dt;
      const vcx = tw.vx - tw.omega * w.y, vcy = tw.vy + tw.omega * w.x; // chassis velocity at the wheel
      const slip = -(u - vcx) * w.ay - vcy * w.ax;                        // free-roller surface speed
      const spin = slip / ROLLER_RADIUS;
      for (const r of w.rollers) {
        let off = r.phi0 - w.angle + Math.PI / 2;
        off = Math.atan2(Math.sin(off), Math.cos(off));
        if (Math.abs(off) < 0.33) r.angle += spin * dt; // only the roller touching the floor turns
      }
    }
  }

  /** Apply the physics engine's contact result for this robot. */
  applySupportContact(out: SupportContactOutput | null): void {
    this.contact = out;
    this.slide?.setContact(out ? out.delta > 0 : null);
  }

  /** Data the physics engine needs about this robot's support pad. */
  getSupportContactInput(): SupportContactInput {
    return {
      agentId: this.id,
      pad: { x: this.pose.x, y: this.pose.y },
      padZ: this.groundZ + PAD_BASE_Z + this.lift.h,
      padVel: this.lift.hDot,
      padHalfSize: PAD_HALF_SIZE,
      padHalfExtents: { ...PAD_HALF_EXTENTS },
      stiffness: this.stiffness,
      damping: this.damping,
      fAllow: this.fAllow,
    };
  }

  // ───────────────────────── sensors / telemetry ─────────────────────────

  /** Contact trigger: δ_i > 0. null if the physics has not reported a contact. */
  get inContact(): boolean | null {
    return this.contact ? this.contact.delta > 0 : null;
  }

  /**
   * Four corner load cells. null ("NA") when absent, uncalibrated or before the physics reports a
   * contact — never 0 for "no reading". The contact model applies F_i at the plate centre, so by
   * symmetry each of the four cells carries F_i / 4.
   */
  loadCells(): LoadCellReading[] {
    const ok = this.forceSensor === 'calibrated' && this.contact !== null;
    const f = ok ? Math.max(0, this.contact!.force) / 4 : null;
    return LOAD_CELL_CORNERS.map(corner => ({ corner, force: f }));
  }

  /** Force sensor reading F_i = Σ load cells (N), or null ("NA") — never 0 for "no sensor". */
  measuredForce(): number | null {
    const cells = this.loadCells();
    if (cells.some(c => c.force === null)) return null;
    return cells.reduce((s, c) => s + (c.force as number), 0);
  }

  get health(): HealthFlag {
    if (this.liftFault) return 'FAULT';
    if (this.lift.overloaded || this.battery < 0.2 || this.quality < 0.5) return 'WARN';
    return 'OK';
  }

  /** Wheel speeds in rpm, FL FR RL RR. */
  wheelRpm(): number[] {
    return this.wheelRates.map(w => (w * 60) / (2 * Math.PI));
  }

  getState(): AgentState {
    return {
      id: this.id,
      p: { x: this.pose.x, y: this.pose.y },
      theta: this.pose.theta,
      h: this.lift.h,
      hDot: this.lift.hDot,
      b: this.battery,
      m: this.mode,
      q: this.quality,
      t: this.localTime,
    };
  }

  buildMessage(task: string, epoch: number): AgentMessage {
    return {
      id: this.id,
      task,
      epoch,
      seq: ++this.seq,
      time: this.localTime,
      mode: this.mode,
      health: this.health,
      height: this.lift.h,
      heightVel: this.lift.hDot,
      pose: { x: this.pose.x, y: this.pose.y, theta: this.pose.theta },
      quality: this.quality,
      force: this.measuredForce(),
      battery: this.battery,
    };
  }

  // ───────────────────────── visuals ─────────────────────────

  syncVisuals(): void {
    this.root.position.set(this.pose.x, this.pose.y, this.groundZ);
    const grad=this.terrain?.field.gradientAt(this.pose.x,this.pose.y);
    const c=Math.cos(this.pose.theta),s=Math.sin(this.pose.theta);
    this.root.rotation.set(grad?Math.atan(-grad.x*s+grad.y*c):0,grad?-Math.atan(grad.x*c+grad.y*s):0,this.pose.theta);
    for (const w of this.wheels) {
      w.node.rotation.set(0, w.angle, 0);
      for (const r of w.rollers) r.node.quaternion.setFromAxisAngle(r.axis, r.angle);
    }
    if (this.slide) {
      this.slide.setHeight(this.lift.h);
      this.slide.setLoad(this.contact && this.contact.delta > 0 ? this.contact.force : 0);
      this.slide.animate(this.localTime - this.lastVisualTime); // sim-time spring (deterministic)
    }
    this.lastVisualTime = this.localTime;
  }

  dispose(): void {
    this.slide?.dispose();
    this.chassis?.dispose();
    this.root.removeFromParent();
  }
}
