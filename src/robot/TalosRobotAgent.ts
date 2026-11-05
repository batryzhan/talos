/**
 * TalosRobotAgent — one goBILDA Strafer with a Viper Slide lift.
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
  SupportContactInput, SupportContactOutput, Twist2D, WheelId, WheelRates,
} from '../contracts/types';
import { WHEEL_ORDER } from '../contracts/types';
import { forwardKinematics, saturateUniform, slewUniform, twistToWheelRates, MECANUM_SIGNS } from './mecanum';
import { DEFAULT_LIFT_PARAMS, createLiftState, stepLift, type LiftState } from './liftDrive';
import { PAD_BASE_Z, PAD_HALF_SIZE, ViperSlideRig } from './ViperSlideRig';

/** Strafer geometry measured from the CAD (public/robot.glb). */
export const STRAFER_GEOMETRY: MecanumGeometry = {
  r: 0.048058,
  a: 0.168,
  b: 0.208,
  omegaMax: 1.8 / 0.048058, // 1.8 m/s at the rim
  alphaMax: 7.0 / 0.048058, // 7 m/s² rim slew (traction limit)
};

/** Chassis footprint half extents (m). */
export const STRAFER_FOOTPRINT = { halfX: 0.216, halfY: 0.2266 };

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

const ROLLER_RADIUS = 0.009;

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
  readonly geometry: MecanumGeometry;
  readonly liftParams: LiftDriveParams;
  readonly forceSensor: ForceSensorStatus;
  readonly footprint = STRAFER_FOOTPRINT;

  // ── state ──
  readonly pose: Pose2D;
  /** Measured body twist (from wheel odometry). */
  readonly twist: Twist2D = { vx: 0, vy: 0, omega: 0 };
  /** Actual wheel rates (rad/s) after slew limiting, FL FR RL RR. */
  wheelRates: WheelRates = [0, 0, 0, 0];
  private wheelTarget: WheelRates = [0, 0, 0, 0];
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
    this.root.name = `talos_agent_${opts.id}`;
    this.geometry = { ...STRAFER_GEOMETRY, ...opts.geometry };
    this.liftParams = { ...DEFAULT_LIFT_PARAMS, ...opts.lift };
    this.forceSensor = opts.forceSensor ?? 'absent';
    this.batteryJ = (opts.batteryWh ?? 36) * 3600;
    this.pose = { x: 0, y: 0, theta: 0, ...opts.pose };
    this.lift = createLiftState(this.liftParams.hMin);
    this.stiffness = opts.stiffness ?? 2.0e5;
    this.damping = opts.damping ?? 2.0e3;
    this.fAllow = opts.fAllow ?? 180;

    if (opts.model) {
      const model = opts.model.clone(true);
      this.root.add(model);
      this.rigWheels(model);
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
    const { rates, alpha } = twistToWheelRates(t, this.geometry, this.geometry.omegaMax * limitScale);
    this.wheelTarget = rates;
    this.saturationAlpha = alpha;
  }

  /** Wheel rate targets from the swarm. Re-saturated uniformly as a safety net. */
  setWheelRates(w: WheelRates): void {
    const { rates, alpha } = saturateUniform(w, this.geometry.omegaMax);
    this.wheelTarget = rates;
    this.saturationAlpha = alpha;
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
    if (mode === 'LIFT') this.wheelTarget = [0, 0, 0, 0]; // chassis locked during pure lift
    this.slide?.setStatusColor(MODE_COLORS[mode]);
  }

  /** Safe hold: zero chassis, engage lift position lock at the current height. */
  hold(): void {
    this.wheelTarget = [0, 0, 0, 0];
    this.liftCmd = 0;
    this.liftLockCmd = true;
  }

  setBattery(b: number): void {
    this.battery = Math.min(1, Math.max(0, b));
  }

  reset(pose: Partial<Pose2D> = {}): void {
    Object.assign(this.pose, { x: 0, y: 0, theta: 0 }, pose);
    Object.assign(this.twist, { vx: 0, vy: 0, omega: 0 });
    this.wheelRates = [0, 0, 0, 0];
    this.wheelTarget = [0, 0, 0, 0];
    Object.assign(this.lift, createLiftState(this.liftParams.hMin));
    this.liftCmd = 0;
    this.liftLockCmd = false;
    this.contact = null;
    this.mode = 'READY';
    this.slide?.setStatusColor(MODE_COLORS.READY);
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
    const target: WheelRates = wheelsLocked ? [0, 0, 0, 0] : this.wheelTarget;

    this.wheelRates = slewUniform(this.wheelRates, target, g.alphaMax * dt);
    const tw = forwardKinematics(this.wheelRates, g);
    this.twist.vx = tw.vx; this.twist.vy = tw.vy; this.twist.omega = tw.omega;
    const c = Math.cos(this.pose.theta), s = Math.sin(this.pose.theta);
    this.pose.x += (tw.vx * c - tw.vy * s) * dt;
    this.pose.y += (tw.vx * s + tw.vy * c) * dt;
    this.pose.theta += tw.omega * dt;
    constrainPose?.(this.pose, this.footprint);

    // lift
    const load = this.contact ? Math.max(0, this.contact.force) : 0;
    stepLift(this.lift, this.liftParams, { u: this.liftCmd, loadForce: load, lock: holding || this.liftLockCmd, fault: this.liftFault }, dt);

    // battery: chassis motors (4 × free current + load-proportional) + lift
    let iDrive = 0;
    for (const w of this.wheelRates) iDrive += 0.25 + 2.0 * Math.abs(w) / g.omegaMax;
    const pTotal = 12 * iDrive + this.lift.elecPower + 2.0; // + 2 W electronics/radio
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
      padZ: PAD_BASE_Z + this.lift.h,
      padVel: this.lift.hDot,
      padHalfSize: PAD_HALF_SIZE,
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

  /** Force sensor reading (N) or null ("NA") when absent or uncalibrated — never 0 for "no sensor". */
  measuredForce(): number | null {
    if (this.forceSensor !== 'calibrated' || !this.contact) return null;
    return Math.max(0, this.contact.force);
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
    this.root.position.set(this.pose.x, this.pose.y, 0);
    this.root.rotation.set(0, 0, this.pose.theta);
    for (const w of this.wheels) {
      w.node.rotation.set(0, w.angle, 0);
      for (const r of w.rollers) r.node.quaternion.setFromAxisAngle(r.axis, r.angle);
    }
    this.slide?.setHeight(this.lift.h);
  }

  dispose(): void {
    this.slide?.dispose();
    this.root.removeFromParent();
  }
}
