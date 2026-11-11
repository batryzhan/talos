/**
 * Composite macro-chassis kinematics (CLAUDE.md §5.1, §5.3).
 *
 * N mechanically locked Strafers form one rigid body with 4N Mecanum wheels. Everything is
 * expressed in the macro frame (x forward, y left, ω CCW); twists act about the centroid
 *   C_macro = (1/N) Σ p_i.
 *
 * Wheel k of chassis i sits at r_k = p_i + R(θ_i)·(±a, ±b) and moves with
 *   v_k = V_macro + Ω_macro × (r_k − C_macro).
 * A Mecanum wheel only constrains the velocity component along its rolling direction
 * d_k = R(θ_i)·(1, s_y,k), so ω_k = (d_k · v_k) / r. For N = 1 this is exactly formula 14
 * (wheel order FL, FR, RL, RR).
 *
 * All buffers are allocated in the constructor; solveIK / solveFK / balanceStep never allocate.
 */
import type { MecanumGeometry, Twist2D, Vec2 } from '../../contracts/types';
import { WHEEL_ORDER } from '../../contracts/types';
import { MECANUM_SIGNS } from '../../robot/mecanum';
import { ROBOT_FOOTPRINT } from '../../robot/straferSpec';
import type { ClusterInertia, FormationKind, WheelIndexEntry } from '../../types/macroEntity';
import { FORMATIONS } from '../../types/macroEntity';
import { assertRingEps, m0RingStep, spreadOf } from '../consensus/m0Ring';

export const WHEELS_PER_CHASSIS = 4;

/** Clearance taken by the latch between two docked footprints (m). */
export const LATCH_GAP = 0.012;

/** Centre-to-centre spacing of docked chassis (m). */
export const DOCK_PITCH = {
  x: 2 * ROBOT_FOOTPRINT.halfX + LATCH_GAP,
  y: 2 * ROBOT_FOOTPRINT.halfY + LATCH_GAP,
} as const;

/** Wheel position signs of (a, b) for FL, FR, RL, RR. */
const POS_SX = [1, 1, -1, -1] as const;
const POS_SY = [1, -1, 1, -1] as const;

/** Static description of global wheel index k (not for use inside loops). */
export function wheelIndexEntry(k: number): WheelIndexEntry {
  const local = (k % WHEELS_PER_CHASSIS) as 0 | 1 | 2 | 3;
  return { k, chassis: Math.floor(k / WHEELS_PER_CHASSIS), local, wheel: WHEEL_ORDER[local] };
}

export class CompositeSolver {
  readonly capacity: number;
  /** Number of chassis currently in the cluster. */
  count = 0;
  /** Chassis poses in the macro frame: [x, y, θ] × capacity. */
  readonly chassis: Float64Array;
  /** C_macro in the macro frame. */
  readonly centroid: Vec2 = { x: 0, y: 0 };
  /** Wheel positions r_k (macro frame): [x, y] × 4·capacity. */
  readonly wheelPos: Float64Array;
  /** Wheel rolling directions d_k (macro frame): [x, y] × 4·capacity. */
  readonly wheelDir: Float64Array;
  /** Wheel contact velocities v_k of the last solveIK: [x, y] × 4·capacity. */
  readonly wheelVel: Float64Array;
  /** Wheel angular rates of the last solveIK after saturation (rad/s), index k = 4·chassis + local. */
  readonly rates: Float64Array;
  /** Uniform saturation factor s ≥ 1 applied by the last solveIK. */
  saturation = 1;
  /** Result of the last solveFK. */
  readonly twist: Twist2D = { vx: 0, vy: 0, omega: 0 };

  /** Torque-balancing state x_k: integral current residual per motor (A). */
  readonly current: Float64Array;
  /** Feed-forward current trim per motor, x_k(now) − x_k(0); sums to zero. */
  readonly trim: Float64Array;
  /** Consensus residual D(k) of `current` and the number of steps since loadCurrents. */
  residual = 0;
  balanceSteps = 0;

  private readonly baseline: Float64Array;
  private readonly delta: Float64Array;
  /** Inverse of the 3×3 normal matrix AᵀA of the wheel constraints (row-major). */
  private readonly normalInv = new Float64Array(9);
  private fkRank3 = false;

  constructor(readonly geometry: MecanumGeometry, capacity: number) {
    if (!(Number.isInteger(capacity) && capacity >= 1)) throw new RangeError(`capacity ${capacity} must be a positive integer`);
    this.capacity = capacity;
    const wheels = capacity * WHEELS_PER_CHASSIS;
    this.chassis = new Float64Array(capacity * 3);
    this.wheelPos = new Float64Array(wheels * 2);
    this.wheelDir = new Float64Array(wheels * 2);
    this.wheelVel = new Float64Array(wheels * 2);
    this.rates = new Float64Array(wheels);
    this.current = new Float64Array(wheels);
    this.trim = new Float64Array(wheels);
    this.baseline = new Float64Array(wheels);
    this.delta = new Float64Array(wheels);
    this.setGrid(1, 1);
  }

  get wheelCount(): number {
    return this.count * WHEELS_PER_CHASSIS;
  }

  /** True when the wheel constraints determine all three twist components. */
  get wellPosed(): boolean {
    return this.fkRank3;
  }

  // ───────────────────────── formation ─────────────────────────

  /**
   * Regular rows×cols grid, all headings 0. Chassis index = row·cols + col; row 0 is the front
   * row, col 0 the leftmost column.
   */
  setGrid(rows: number, cols: number, pitchX: number = DOCK_PITCH.x, pitchY: number = DOCK_PITCH.y): void {
    const n = rows * cols;
    if (!(Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && cols >= 1)) throw new RangeError(`bad grid ${rows}×${cols}`);
    if (n > this.capacity) throw new RangeError(`grid ${rows}×${cols} exceeds capacity ${this.capacity}`);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const o = (row * cols + col) * 3;
        this.chassis[o] = -row * pitchX;
        this.chassis[o + 1] = -col * pitchY;
        this.chassis[o + 2] = 0;
      }
    }
    this.count = n;
    this.rebuild();
  }

  setFormation(kind: FormationKind): void {
    const f = FORMATIONS[kind];
    this.setGrid(f.rows, f.cols);
  }

  /** Set one chassis pose (macro frame). Call rebuild() after the last one. */
  setChassis(i: number, x: number, y: number, theta: number): void {
    if (!(i >= 0 && i < this.capacity)) throw new RangeError(`chassis index ${i} out of range`);
    const o = i * 3;
    this.chassis[o] = x;
    this.chassis[o + 1] = y;
    this.chassis[o + 2] = theta;
  }

  setCount(n: number): void {
    if (!(Number.isInteger(n) && n >= 1 && n <= this.capacity)) throw new RangeError(`count ${n} out of range`);
    this.count = n;
  }

  /** Recompute C_macro, the wheel table and the FK normal matrix from the chassis poses. */
  rebuild(): void {
    const n = this.count, { a, b } = this.geometry;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += this.chassis[i * 3]; cy += this.chassis[i * 3 + 1]; }
    cx /= n; cy /= n;
    this.centroid.x = cx;
    this.centroid.y = cy;

    let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0;
    for (let i = 0; i < n; i++) {
      const px = this.chassis[i * 3], py = this.chassis[i * 3 + 1], th = this.chassis[i * 3 + 2];
      const c = Math.cos(th), s = Math.sin(th);
      for (let j = 0; j < WHEELS_PER_CHASSIS; j++) {
        const k = (i * WHEELS_PER_CHASSIS + j) * 2;
        const lx = POS_SX[j] * a, ly = POS_SY[j] * b, sy = MECANUM_SIGNS[j][0];
        const rx = px + c * lx - s * ly, ry = py + s * lx + c * ly;
        const dx = c - s * sy, dy = s + c * sy;
        this.wheelPos[k] = rx; this.wheelPos[k + 1] = ry;
        this.wheelDir[k] = dx; this.wheelDir[k + 1] = dy;
        const lever = dy * (rx - cx) - dx * (ry - cy); // ∂(d·v)/∂Ω
        m00 += dx * dx; m01 += dx * dy; m02 += dx * lever;
        m11 += dy * dy; m12 += dy * lever; m22 += lever * lever;
      }
    }
    // Inverse of the symmetric 3×3 by cofactors.
    const c00 = m11 * m22 - m12 * m12, c01 = m02 * m12 - m01 * m22, c02 = m01 * m12 - m02 * m11;
    const det = m00 * c00 + m01 * c01 + m02 * c02;
    this.fkRank3 = Math.abs(det) > 1e-12;
    const inv = this.fkRank3 ? 1 / det : 0, q = this.normalInv;
    q[0] = c00 * inv; q[1] = c01 * inv; q[2] = c02 * inv;
    q[3] = q[1]; q[4] = (m00 * m22 - m02 * m02) * inv; q[5] = (m01 * m02 - m00 * m12) * inv;
    q[6] = q[2]; q[7] = q[5]; q[8] = (m00 * m11 - m01 * m01) * inv;
  }

  // ───────────────────────── kinematics ─────────────────────────

  /**
   * Inverse kinematics for all 4N wheels, then uniform saturation
   *   s = max(1, max_k |ω_k| / ω_lim),  ω_k* = ω_k / s
   * across the WHOLE cluster, so the direction of motion is preserved. Returns s.
   */
  solveIK(vx: number, vy: number, omega: number, omegaLim: number = this.geometry.omegaMax): number {
    const wheels = this.wheelCount, cx = this.centroid.x, cy = this.centroid.y, invR = 1 / this.geometry.r;
    let peak = 0;
    for (let k = 0; k < wheels; k++) {
      const o = k * 2;
      const wx = vx - omega * (this.wheelPos[o + 1] - cy);
      const wy = vy + omega * (this.wheelPos[o] - cx);
      this.wheelVel[o] = wx;
      this.wheelVel[o + 1] = wy;
      const w = (this.wheelDir[o] * wx + this.wheelDir[o + 1] * wy) * invR;
      this.rates[k] = w;
      const m = w < 0 ? -w : w;
      if (m > peak) peak = m;
    }
    const s = omegaLim > 0 && peak > omegaLim ? peak / omegaLim : 1;
    if (s > 1) for (let k = 0; k < wheels; k++) this.rates[k] /= s;
    this.saturation = s;
    return s;
  }

  /** Least-squares forward kinematics: wheel rates → macro twist about C_macro. Writes `out`. */
  solveFK(rates: Float64Array = this.rates, out: Twist2D = this.twist): Twist2D {
    const wheels = this.wheelCount, cx = this.centroid.x, cy = this.centroid.y, r = this.geometry.r;
    let b0 = 0, b1 = 0, b2 = 0;
    for (let k = 0; k < wheels; k++) {
      const o = k * 2, dx = this.wheelDir[o], dy = this.wheelDir[o + 1];
      const v = r * rates[k];
      b0 += dx * v;
      b1 += dy * v;
      b2 += (dy * (this.wheelPos[o] - cx) - dx * (this.wheelPos[o + 1] - cy)) * v;
    }
    const q = this.normalInv;
    out.vx = q[0] * b0 + q[1] * b1 + q[2] * b2;
    out.vy = q[3] * b0 + q[4] * b1 + q[5] * b2;
    out.omega = q[6] * b0 + q[7] * b1 + q[8] * b2;
    return out;
  }

  /** Mass and yaw inertia about C_macro for identical chassis modelled as uniform footprints. */
  inertia(massPerChassis: number, out: ClusterInertia): ClusterInertia {
    const lx = 2 * ROBOT_FOOTPRINT.halfX, ly = 2 * ROBOT_FOOTPRINT.halfY;
    const own = (massPerChassis * (lx * lx + ly * ly)) / 12;
    let izz = 0;
    for (let i = 0; i < this.count; i++) {
      const dx = this.chassis[i * 3] - this.centroid.x, dy = this.chassis[i * 3 + 1] - this.centroid.y;
      izz += own + massPerChassis * (dx * dx + dy * dy);
    }
    out.mass = massPerChassis * this.count;
    out.izz = izz;
    return out;
  }

  // ───────────────────────── M0 torque balancing (anti-fighting) ─────────────────────────

  /**
   * Load the per-motor integral current residuals (measured minus model-expected, A) that the
   * balancing consensus starts from. Roller slip makes rigidly coupled chassis push against each
   * other; that shows up as a zero-mean spread of these residuals.
   */
  loadCurrents(src: Float64Array): void {
    const wheels = this.wheelCount;
    for (let k = 0; k < wheels; k++) {
      this.current[k] = src[k];
      this.baseline[k] = src[k];
      this.trim[k] = 0;
    }
    this.balanceSteps = 0;
    this.residual = spreadOf(this.current, wheels);
  }

  /**
   * One M0 step on the ring of 4N motors, in place. The mean residual (the real shared load) is
   * conserved; only the spread — the internal tension — decays. Updates `trim` and returns D(k).
   */
  balanceStep(eps = 0.2, linkUp?: Uint8Array): number {
    const wheels = this.wheelCount;
    m0RingStep(this.current, this.delta, wheels, eps, linkUp);
    for (let k = 0; k < wheels; k++) this.trim[k] = this.current[k] - this.baseline[k];
    this.balanceSteps++;
    this.residual = spreadOf(this.current, wheels);
    return this.residual;
  }

  /**
   * Loss-free balancing until D(k) ≤ threshold. Returns the number of steps, or −1 if `maxSteps`
   * was not enough.
   */
  balanceTorque(eps = 0.2, threshold = 0.01, maxSteps = 2000): number {
    assertRingEps(this.wheelCount, eps);
    while (this.residual > threshold) {
      if (this.balanceSteps >= maxSteps) return -1;
      this.balanceStep(eps);
    }
    return this.balanceSteps;
  }
}
