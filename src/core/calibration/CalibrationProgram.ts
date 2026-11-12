/**
 * /calibration — test manoeuvres of the goBILDA Strafer Mecanum chassis (CLAUDE.md §3, mode 0).
 *
 * The program scripts body twists (pure strafe, diagonal, rotation in place, combined orbit,
 * saturation and brake tests), passes them through the actuation latency τ, evaluates equations 1
 * and 2 for the telemetry, and measures what the simulated chassis actually did:
 *   - heading drift Δθ and cross-track error e⊥ of straight legs (ideal Mecanum: both ≈ 0);
 *   - centre drift Δp of rotation in place;
 *   - direction error of a saturated command (uniform scaling, equation 2, keeps the direction;
 *     per-wheel clipping would not — shown for comparison);
 *   - measured stopping distance vs. equation 7.
 *
 * Every per-tick path writes into preallocated state (zero allocation in the 100 Hz loop).
 */
import { STRAFER_KINEMATICS, bodyTwist, saturate, stoppingDistance, wheelRates } from './chassisKinematics';

export const MANEUVERS = ['forward', 'strafe', 'diagonal', 'rotate', 'combined', 'saturation', 'brake'] as const;
export type ManeuverId = (typeof MANEUVERS)[number];

/** Physics step of the engine (s) and the actuation latency in ticks: τ = 3 × 10 ms. */
export const CAL_DT = 0.01;
export const LATENCY_TICKS = 3;
export const BRAKE_TAU = LATENCY_TICKS * CAL_DT;
/** Braking deceleration a_br = α_max·r: the 7 m/s² rim slew limit of the drive (traction, μ ≈ 0.7). */
export const BRAKE_DECEL = 7.0;

type LegKind = 'move' | 'pause' | 'orbit' | 'brakeRun' | 'brakeStop' | 'home';
interface Leg { kind: LegKind; dur: number; vx: number; vy: number; w: number }

const move = (dur: number, vx: number, vy: number, w = 0): Leg => ({ kind: 'move', dur, vx, vy, w });
const pause = (dur = 0.6): Leg => ({ kind: 'pause', dur, vx: 0, vy: 0, w: 0 });
const HOME: Leg = { kind: 'home', dur: 8, vx: 0, vy: 0, w: 0 };

/** Combined manoeuvre: a 1 m world-frame circle at 0.45 m/s while the body spins at 0.8 rad/s. */
const ORBIT = { radius: 1, speed: 0.45, spin: 0.8 } as const;
const SPIN = 1.4;

export const SCRIPTS: Readonly<Record<ManeuverId, readonly Leg[]>> = {
  forward: [move(2.2, 0.6, 0), pause(), move(2.2, -0.6, 0), pause(), HOME],
  strafe: [move(2.2, 0, 0.6), pause(), move(2.2, 0, -0.6), pause(), HOME],
  diagonal: [move(2, 0.42, 0.42), pause(), move(2, -0.42, -0.42), pause(), move(2, 0.42, -0.42), pause(), move(2, -0.42, 0.42), pause(), HOME],
  rotate: [move((2 * Math.PI) / SPIN, 0, 0, SPIN), pause(), move((2 * Math.PI) / SPIN, 0, 0, -SPIN), pause(), HOME],
  combined: [{ kind: 'orbit', dur: (2 * Math.PI * ORBIT.radius) / ORBIT.speed, vx: 0, vy: 0, w: ORBIT.spin }, pause(), HOME],
  saturation: [move(1.3, 1.25, 0.85, 0.6), pause(0.8), move(1.3, -1.25, -0.85, -0.6), pause(0.8), HOME],
  brake: [{ kind: 'brakeRun', dur: 1.6, vx: 1.2, vy: 0, w: 0 }, { kind: 'brakeStop', dur: 3, vx: 0, vy: 0, w: 0 }, pause(0.6), HOME],
};

/** What the program reads from the simulated chassis. */
export interface ChassisState {
  pose: { x: number; y: number; theta: number };
  twist: { vx: number; vy: number; omega: number };
  wheelRates: ArrayLike<number>;
}

export interface BrakeResult { v: number; predicted: number; measured: number; error: number }

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const BRAKE_HISTORY = 8;

export class CalibrationProgram {
  maneuver: ManeuverId = 'forward';
  /** True while the operator drives by keyboard / gamepad (the script is suspended). */
  manual = false;
  /** Program output before the latency line (body frame). */
  readonly command = { vx: 0, vy: 0, omega: 0 };
  /** Command after the latency τ — what reaches the drive (body frame). */
  readonly applied = { vx: 0, vy: 0, omega: 0 };
  /** Equation 1 of the applied command (rad/s) and equation 2 (ωᵢ* = ωᵢ / s). */
  readonly raw = new Float64Array(4);
  readonly scaled = new Float64Array(4);
  /** Saturation factor s of equation 2. */
  s = 1;
  /** Per-wheel clipping of the same command, for comparison (rad/s) and its direction error (rad). */
  readonly clipped = new Float64Array(4);
  clipDirectionError = 0;
  /** Relative error of the path curvature ω / |v| under per-wheel clipping (0 = unchanged). */
  clipCurvatureError = 0;

  /** Running script position. */
  legIndex = 0;
  legTime = 0;
  cycles = 0;
  time = 0;
  readonly origin = { x: 0, y: 0, theta: 0 };

  /** Tracking of the current / last completed straight or rotation leg. */
  headingDrift = 0;
  crossTrack = 0;
  centerDrift = 0;
  directionError = 0;
  private readonly legStart = { x: 0, y: 0, theta: 0, dx: 0, dy: 0 };

  /** Brake test (equation 7). */
  readonly brakes: BrakeResult[] = Array.from({ length: BRAKE_HISTORY }, () => ({ v: 0, predicted: 0, measured: 0, error: 0 }));
  brakeCount = 0;
  brakeActive = false;
  private readonly brakeFrom = { x: 0, y: 0, v: 0 };

  /** Trail of the chassis centre (20 Hz ring, x/y pairs). */
  readonly trail = new Float32Array(2 * 240);
  trailHead = 0;
  trailCount = 0;

  private readonly delay = new Float64Array(3 * LATENCY_TICKS);
  private delayHead = 0;
  private readonly fk = new Float64Array(3);
  private tick = 0;

  constructor(state?: ChassisState) {
    if (state) this.select('forward', state);
  }

  get tau(): number { return BRAKE_TAU; }
  get aBrake(): number { return BRAKE_DECEL; }
  get leg(): Leg { return SCRIPTS[this.maneuver][this.legIndex]; }
  /** Fraction of the current script completed ∈ [0, 1]. */
  get progress(): number {
    const legs = SCRIPTS[this.maneuver];
    let total = 0, done = 0;
    for (let i = 0; i < legs.length; i++) { total += legs[i].dur; if (i < this.legIndex) done += legs[i].dur; }
    return Math.min(1, (done + Math.min(this.legTime, this.leg.dur)) / total);
  }
  get lastBrake(): BrakeResult | null { return this.brakeCount ? this.brakes[(this.brakeCount - 1) % BRAKE_HISTORY] : null; }

  /** Start a manoeuvre from the current pose (which becomes the home pose). */
  select(id: ManeuverId, state: ChassisState): void {
    this.maneuver = id;
    this.legIndex = 0;
    this.legTime = 0;
    this.cycles = 0;
    this.origin.x = state.pose.x; this.origin.y = state.pose.y; this.origin.theta = state.pose.theta;
    this.headingDrift = 0; this.crossTrack = 0; this.centerDrift = 0; this.directionError = 0;
    this.brakeActive = false;
    this.trailCount = 0;
    this.beginLeg(state);
  }

  /**
   * One physics tick before the chassis moves: script (or manual) command → latency τ →
   * equations 1 and 2 for the telemetry. The caller feeds `applied` to the drive.
   */
  step(dt: number, state: ChassisState, manual: boolean, mvx = 0, mvy = 0, mw = 0): void {
    this.time += dt;
    if (manual !== this.manual) { this.manual = manual; if (!manual) this.select(this.maneuver, state); }
    if (manual) { this.command.vx = mvx; this.command.vy = mvy; this.command.omega = mw; }
    else this.script(dt, state);

    // Latency line: the drive sees the command issued τ ago.
    const o = this.delayHead * 3;
    this.applied.vx = this.delay[o]; this.applied.vy = this.delay[o + 1]; this.applied.omega = this.delay[o + 2];
    this.delay[o] = this.command.vx; this.delay[o + 1] = this.command.vy; this.delay[o + 2] = this.command.omega;
    this.delayHead = (this.delayHead + 1) % LATENCY_TICKS;

    wheelRates(this.applied.vx, this.applied.vy, this.applied.omega, this.raw);
    this.s = saturate(this.raw, this.scaled);
    // Per-wheel clipping (not used by the drive) — how far it would bend the direction.
    const lim = STRAFER_KINEMATICS.omegaLim;
    for (let i = 0; i < 4; i++) this.clipped[i] = Math.max(-lim, Math.min(lim, this.raw[i]));
    bodyTwist(this.clipped, this.fk);
    this.clipDirectionError = this.s > 1 && Math.hypot(this.applied.vx, this.applied.vy) > 1e-6
      ? Math.abs(wrap(Math.atan2(this.fk[1], this.fk[0]) - Math.atan2(this.applied.vy, this.applied.vx)))
      : 0;
    const vCmd = Math.hypot(this.applied.vx, this.applied.vy), vClip = Math.hypot(this.fk[0], this.fk[1]);
    this.clipCurvatureError = this.s > 1 && vCmd > 1e-6 && vClip > 1e-6 && Math.abs(this.applied.omega) > 1e-6
      ? Math.abs(this.fk[2] / vClip - this.applied.omega / vCmd) / Math.abs(this.applied.omega / vCmd)
      : 0;
  }

  /** After the chassis moved: tracking errors, brake measurement, trail. */
  observe(state: ChassisState): void {
    const p = state.pose, t = state.twist, leg = this.leg;
    if (!this.manual) {
      if (leg.kind === 'move' && this.legTime > 0.3) {
        if (leg.w === 0) {
          const ex = p.x - this.legStart.x, ey = p.y - this.legStart.y;
          this.headingDrift = Math.max(this.headingDrift, Math.abs(wrap(p.theta - this.legStart.theta)));
          this.crossTrack = Math.max(this.crossTrack, Math.abs(ex * this.legStart.dy - ey * this.legStart.dx));
        } else if (leg.vx === 0 && leg.vy === 0) {
          this.centerDrift = Math.max(this.centerDrift, Math.hypot(p.x - this.legStart.x, p.y - this.legStart.y));
        }
        const cmd = Math.hypot(leg.vx, leg.vy), got = Math.hypot(t.vx, t.vy);
        if (cmd > 0 && got > 0.3) this.directionError = Math.max(this.directionError, Math.abs(wrap(Math.atan2(t.vy, t.vx) - Math.atan2(leg.vy, leg.vx))));
      }
      if (leg.kind === 'brakeStop' && this.brakeActive && this.legTime > BRAKE_TAU + CAL_DT && Math.abs(t.vx) + Math.abs(t.vy) < 1e-3) {
        const r = this.brakes[this.brakeCount % BRAKE_HISTORY];
        r.v = this.brakeFrom.v;
        r.predicted = stoppingDistance(r.v, BRAKE_TAU, BRAKE_DECEL);
        r.measured = Math.hypot(p.x - this.brakeFrom.x, p.y - this.brakeFrom.y);
        r.error = r.predicted > 0 ? (r.measured - r.predicted) / r.predicted : 0;
        this.brakeCount++;
        this.brakeActive = false;
        this.legTime = leg.dur; // stopped: next leg
      }
    }
    if (++this.tick % 5 === 0) {
      this.trail[this.trailHead * 2] = p.x;
      this.trail[this.trailHead * 2 + 1] = p.y;
      this.trailHead = (this.trailHead + 1) % (this.trail.length / 2);
      this.trailCount = Math.min(this.trail.length / 2, this.trailCount + 1);
    }
  }

  private beginLeg(state: ChassisState): void {
    const leg = this.leg, p = state.pose;
    this.legStart.x = p.x; this.legStart.y = p.y; this.legStart.theta = p.theta;
    const c = Math.cos(p.theta), s = Math.sin(p.theta), n = Math.hypot(leg.vx, leg.vy) || 1;
    this.legStart.dx = (c * leg.vx - s * leg.vy) / n;
    this.legStart.dy = (s * leg.vx + c * leg.vy) / n;
    if (leg.kind === 'move' && this.legIndex === 0) { this.headingDrift = 0; this.crossTrack = 0; this.centerDrift = 0; this.directionError = 0; }
    if (leg.kind === 'brakeStop') {
      this.brakeActive = true;
      this.brakeFrom.x = p.x; this.brakeFrom.y = p.y;
      this.brakeFrom.v = Math.hypot(state.twist.vx, state.twist.vy);
    }
  }

  private script(dt: number, state: ChassisState): void {
    let leg = this.leg;
    if (this.legTime >= leg.dur || (leg.kind === 'home' && this.homed(state))) {
      this.legIndex++;
      if (this.legIndex >= SCRIPTS[this.maneuver].length) { this.legIndex = 0; this.cycles++; }
      this.legTime = 0;
      this.beginLeg(state);
      leg = this.leg;
    }
    this.legTime += dt;
    const c = this.command, p = state.pose;
    switch (leg.kind) {
      case 'move': case 'brakeRun': c.vx = leg.vx; c.vy = leg.vy; c.omega = leg.w; break;
      case 'pause': case 'brakeStop': c.vx = 0; c.vy = 0; c.omega = 0; break;
      case 'orbit': {
        // World velocity tangent to the circle, rotated into the spinning body frame.
        const phi = (this.legTime * ORBIT.speed) / ORBIT.radius;
        const wx = ORBIT.speed * Math.cos(phi), wy = ORBIT.speed * Math.sin(phi);
        const cs = Math.cos(p.theta), sn = Math.sin(p.theta);
        c.vx = cs * wx + sn * wy; c.vy = -sn * wx + cs * wy; c.omega = leg.w;
        break;
      }
      case 'home': {
        const ex = this.origin.x - p.x, ey = this.origin.y - p.y, d = Math.hypot(ex, ey);
        const v = Math.min(0.6, 1.6 * d), wx = d > 1e-9 ? (ex / d) * v : 0, wy = d > 1e-9 ? (ey / d) * v : 0;
        const cs = Math.cos(p.theta), sn = Math.sin(p.theta);
        c.vx = cs * wx + sn * wy; c.vy = -sn * wx + cs * wy;
        c.omega = Math.max(-1.5, Math.min(1.5, 3 * wrap(this.origin.theta - p.theta)));
        break;
      }
    }
  }

  private homed(state: ChassisState): boolean {
    const p = state.pose, t = state.twist;
    return Math.hypot(this.origin.x - p.x, this.origin.y - p.y) < 0.01 && Math.abs(wrap(this.origin.theta - p.theta)) < 0.01
      && Math.abs(t.vx) + Math.abs(t.vy) + Math.abs(t.omega) < 0.05;
  }
}

