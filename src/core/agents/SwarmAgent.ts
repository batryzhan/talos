/**
 * Chassis layer (scientific documentation §1.4–1.6): one goBILDA Strafer Mecanum base shared by every
 * robot of the heterogeneous swarm, with a swappable task module on top.
 *
 * Pure TypeScript (no three.js), deterministic, allocation-free in the control / physics steps:
 *  - inverse kinematics, equation 1:  ω = (1/r)·M·[vx, vy, ω]ᵀ with L = a + b;
 *  - proportional saturation, equation 2:  s = max(1, max|ω_i| / ω_lim),  ω_i* = ω_i / s;
 *  - braking distance, equation 7:  d_stop ≈ v·τ + v² / (2·a_br) — the commanded speed never exceeds
 *    the speed from which the robot can still stop at the end of its route.
 */
import { DRIVE_OMEGA_FREE, MECANUM_140 } from '../../robot/straferSpec';
import type { TaskModule } from './taskModule';

/** Strafer geometry (m): a = 0.168, b = 0.208, L = a + b = 0.376, r = 0.070; ω_lim = 223 rpm. */
export const STRAFER = {
  r: MECANUM_140.r,
  a: MECANUM_140.x,
  b: MECANUM_140.y,
  L: MECANUM_140.x + MECANUM_140.y,
  omegaLim: DRIVE_OMEGA_FREE,
  /** Frame width × side length × overall width with wheels (m). */
  frameWidth: 0.432,
  sideLength: 0.36,
  overall: 0.453,
} as const;

/** Equation 7 parameters: reaction latency τ (s) and braking deceleration a_br (m/s²). */
export const BRAKING = { tau: 0.06, aBrake: 1.6 } as const;

/** Rows of equation 1 as (s_y, s_ω) for FL, FR, RL, RR: ω_i = (vx + s_y·vy + s_ω·L·ω) / r. */
const ROW_Y = [-1, 1, 1, -1] as const;
const ROW_W = [-1, 1, -1, 1] as const;

/** d_stop(v) = v·τ + v² / (2·a_br) (equation 7). */
export function stoppingDistance(v: number, tau: number = BRAKING.tau, aBrake: number = BRAKING.aBrake): number {
  const s = Math.abs(v);
  return s * tau + (s * s) / (2 * aBrake);
}

/** Largest speed whose stopping distance (equation 7) fits into `d`. */
export function speedForDistance(d: number, tau: number = BRAKING.tau, aBrake: number = BRAKING.aBrake): number {
  if (!(d > 0)) return 0;
  return aBrake * (-tau + Math.sqrt(tau * tau + (2 * d) / aBrake));
}

/**
 * Equation 1 + 2 into a caller-owned buffer: wheel rates FL, FR, RL, RR after proportional scaling.
 * Returns the applied scale s ≥ 1 (the twist is divided by the same s, so the direction is kept).
 */
export function mecanumWheelRates(vx: number, vy: number, omega: number, out: Float64Array, omegaLim: number = STRAFER.omegaLim): number {
  let peak = 0;
  for (let i = 0; i < 4; i++) {
    const w = (vx + ROW_Y[i] * vy + ROW_W[i] * STRAFER.L * omega) / STRAFER.r;
    out[i] = w;
    const m = Math.abs(w);
    if (m > peak) peak = m;
  }
  const s = Math.max(1, peak / omegaLim);
  if (s > 1) for (let i = 0; i < 4; i++) out[i] /= s;
  return s;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export interface SwarmAgentOptions {
  id: number;
  name: string;
  team: string;
  module: TaskModule;
  x: number;
  y: number;
  theta?: number;
  battery?: number;
  /** Speed limit on flat ground (m/s); the rim limit is ω_lim·r ≈ 1.63 m/s. */
  vmax?: number;
}

/** Progress code of one `drive` call. */
export const DriveStatus = { Idle: 0, Moving: 1, Waypoint: 2, Arrived: 3 } as const;
export type DriveStatus = (typeof DriveStatus)[keyof typeof DriveStatus];

export class SwarmAgent {
  readonly id: number;
  readonly name: string;
  team: string;
  readonly module: TaskModule;
  x: number;
  y: number;
  theta: number;
  /** Ground height under the robot and terrain tilt (rad) — set by the mission for rough terrain. */
  z = 0;
  pitch = 0;
  roll = 0;
  /** World velocity (m/s) and yaw rate (rad/s) actually applied after saturation. */
  vx = 0;
  vy = 0;
  omega = 0;
  /** Commanded speed magnitude (m/s), ramped by the acceleration limit. */
  speed = 0;
  readonly wheel = new Float64Array(4);
  readonly wheelAngle = new Float64Array(4);
  /** Saturation scale s of equation 2 at the last control step. */
  saturation = 1;
  vmax: number;
  accel = 1.1;
  /** Terrain / smoke speed factor ∈ (0, 1] applied on top of vmax (k_slope etc.). */
  speedScale = 1;
  battery: number;
  /** Battery drain (fraction per second) parked, driving, and with the module working. */
  drainIdle = 0.0004;
  drainMove = 0.0011;
  drainWork = 0.0016;
  /** Group-composition epoch this robot last adopted. */
  epoch = 0;
  /** Human-readable FSM / task label (CUTTING_METAL, HAULING_PART, …). */
  task = 'IDLE';
  /** Operation progress ∈ [0, 1]. */
  progress = 0;
  /** Module effect on (sparks, arc, water, drill…). */
  working = false;
  /** Generic cargo fill ∈ [0, 1] (blanks, ore, water tank…) and what is carried (0 none, 1 blank, 2 assembly). */
  cargo = 0;
  cargoKind = 0;
  /** Module joint states for the renderer: mast / boom extension and hopper tilt ∈ [0, 1], tool angle (rad). */
  extension = 0;
  dump = 0;
  spin = 0;
  /** World point the module aims at (torch, nozzle, scanner, drill). */
  aimX = 0;
  aimY = 0;
  aimZ = 0;
  /** Latest auction cost J_ij of the task this robot holds, or null. */
  bid: number | null = null;
  /** Free-form task / target label for telemetry. */
  target = '';
  /** Out of service (charging, failed) — skipped by allocation. */
  active = true;
  /** Operator / safety HOLD: wheels stopped, module safed. */
  hold = false;

  // ── route (owned by RouteNetwork; written at event rate) ──
  wpX: number[] = [];
  wpY: number[] = [];
  /** Graph edge that ends at waypoint k, or −1 for spur segments. */
  wpEdge: number[] = [];
  wpIndex = 0;
  /** Heading to settle on at the final waypoint, or NaN to keep facing the travel direction. */
  finalTheta = Number.NaN;
  edgeStart = 0;
  goalX = 0;
  goalY = 0;
  routeGoalSet = false;

  constructor(o: SwarmAgentOptions) {
    this.id = o.id;
    this.name = o.name;
    this.team = o.team;
    this.module = o.module;
    this.x = o.x;
    this.y = o.y;
    this.theta = o.theta ?? 0;
    this.battery = o.battery ?? 0.9;
    this.vmax = o.vmax ?? 1.1;
    this.aimX = o.x;
    this.aimY = o.y;
  }

  /** Remaining route length from the current position (m). */
  remaining(): number {
    let d = 0, px = this.x, py = this.y;
    for (let k = this.wpIndex; k < this.wpX.length; k++) {
      d += Math.hypot(this.wpX[k] - px, this.wpY[k] - py);
      px = this.wpX[k]; py = this.wpY[k];
    }
    return d;
  }

  get hasRoute(): boolean { return this.wpIndex < this.wpX.length; }

  /** Drop the route and brake to a standstill. */
  stop(): void {
    this.wpX.length = 0; this.wpY.length = 0; this.wpEdge.length = 0; this.wpIndex = 0;
    this.routeGoalSet = false;
  }

  /**
   * One control step (50 Hz): follow the waypoint list with braking-distance speed limiting,
   * heading control, inverse kinematics and proportional saturation. Returns what happened.
   */
  drive(dt: number): DriveStatus {
    if (this.hold || !this.hasRoute) {
      this.speed = Math.max(0, this.speed - BRAKING.aBrake * dt);
      if (this.speed === 0 && !this.hasRoute) {
        this.applyTwist(0, 0, this.headingCommand(Number.isNaN(this.finalTheta) ? this.theta : this.finalTheta));
        return DriveStatus.Idle;
      }
    }
    let status: DriveStatus = DriveStatus.Moving;
    const last = this.wpX.length - 1;
    if (this.hasRoute) {
      // Pass through intermediate waypoints with a generous radius; settle precisely on the last one.
      // The radius exceeds the 0.62 m separation distance, so a robot parked on a graph node can
      // never trap a passing robot in an orbit around that node.
      while (this.wpIndex < last && Math.hypot(this.wpX[this.wpIndex] - this.x, this.wpY[this.wpIndex] - this.y) < 0.75 + 0.25 * this.speed) {
        this.wpIndex++;
        status = DriveStatus.Waypoint;
      }
    }
    const tx = this.hasRoute ? this.wpX[this.wpIndex] : this.x;
    const ty = this.hasRoute ? this.wpY[this.wpIndex] : this.y;
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    const remaining = this.hasRoute ? this.remaining() : 0;
    if (this.hasRoute && this.wpIndex === last && d < 0.025 && this.speed < 0.15) {
      this.wpIndex++;
      this.speed = 0;
      this.applyTwist(0, 0, this.headingCommand(Number.isNaN(this.finalTheta) ? this.theta : this.finalTheta));
      return DriveStatus.Arrived;
    }
    // Equation 7: never faster than the speed that still stops within the remaining route.
    const cap = this.hold ? 0 : Math.min(this.vmax * this.speedScale, speedForDistance(remaining));
    this.speed = cap > this.speed ? Math.min(cap, this.speed + this.accel * dt) : Math.max(cap, this.speed - BRAKING.aBrake * 1.5 * dt);
    const ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 0;
    const wantTheta = remaining > 1.2 && d > 0.2 ? Math.atan2(uy, ux) : Number.isNaN(this.finalTheta) ? this.theta : this.finalTheta;
    this.applyTwist(ux * this.speed, uy * this.speed, this.headingCommand(wantTheta));
    return status;
  }

  private headingCommand(want: number): number {
    const e = wrap(want - this.theta);
    return Math.max(-2.2, Math.min(2.2, 3 * e));
  }

  /** World velocity + yaw rate → body twist → equations 1 and 2 → applied (scaled) twist. */
  private applyTwist(wx: number, wy: number, omega: number): void {
    const c = Math.cos(this.theta), s = Math.sin(this.theta);
    const bx = c * wx + s * wy, by = -s * wx + c * wy;
    const k = mecanumWheelRates(bx, by, omega, this.wheel);
    this.saturation = k;
    this.vx = wx / k;
    this.vy = wy / k;
    this.omega = omega / k;
  }

  /** Physics step (100 Hz): integrate the pose, the wheel angles and the battery. */
  integrate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.theta = wrap(this.theta + this.omega * dt);
    for (let i = 0; i < 4; i++) this.wheelAngle[i] += this.wheel[i] * dt;
    const moving = Math.abs(this.vx) + Math.abs(this.vy) > 0.02;
    const drain = this.working ? this.drainWork : moving ? this.drainMove : this.drainIdle;
    this.battery = Math.max(0, this.battery - drain * dt);
  }
}
