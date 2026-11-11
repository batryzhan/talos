/**
 * Docking automaton and latch stress (CLAUDE.md §5.3).
 *
 *   DISCONNECTED → APPROACHING → ALIGNING → LATCHED → STRUCTURAL_LOCK
 *
 * One controller per mover. `update` runs at the 50 Hz control rate: it measures the planar error
 * to the docking port, advances the automaton and writes a holonomic body twist into `command`.
 * The latch closes only when Δp ≤ 5 mm and |Δθ| ≤ 1° have held for the dwell time; the final
 * STRUCTURAL_LOCK needs an explicit confirmation (the strategic tier validates the cluster first).
 * A docking attempt that outlives `timeout` falls back to DISCONNECTED.
 *
 * `update` mutates preallocated fields only; nothing is allocated per tick.
 */
import type { Pose2D, Twist2D } from '../../contracts/types';
import type {
  DockingAbortReason, DockingError6, DockingTolerance, LatchState, LatchStatus, LatchStressTensor, StressLevel,
} from '../../types/metamorphic';

/** Latch gate: 5 mm and 1°. */
export const DOCK_TOLERANCE: Readonly<DockingTolerance> = { pos: 0.005, theta: Math.PI / 180 };

export interface DockingParams {
  tolerance: DockingTolerance;
  /** Switch from APPROACHING to ALIGNING inside this distance (m) and heading error (rad). */
  alignRadius: number;
  alignTheta: number;
  /** Proportional gains (1/s). */
  kPos: number;
  kTheta: number;
  /** Speed caps while approaching and while micro-adjusting (m/s, rad/s). */
  vApproach: number;
  wApproach: number;
  vAlign: number;
  wAlign: number;
  /** Time the error must stay inside the tolerance before the latch closes (s). */
  dwell: number;
  /** Time the latch pawl needs to seat before a lock may be confirmed (s). */
  latchTime: number;
  /** Mechanical timeout of one docking attempt, from engage (s). */
  timeout: number;
}

export const DEFAULT_DOCKING_PARAMS: Readonly<DockingParams> = {
  tolerance: DOCK_TOLERANCE,
  alignRadius: 0.06,
  alignTheta: (10 * Math.PI) / 180,
  kPos: 2.5,
  kTheta: 3,
  vApproach: 0.35,
  wApproach: 0.8,
  vAlign: 0.05,
  wAlign: 0.25,
  dwell: 0.2,
  latchTime: 0.3,
  timeout: 30,
};

/** Allowed transitions of the docking chain. */
export const DOCK_TRANSITIONS: Readonly<Record<LatchStatus, readonly LatchStatus[]>> = {
  DISCONNECTED: ['APPROACHING'],
  APPROACHING: ['ALIGNING', 'DISCONNECTED'],
  ALIGNING: ['LATCHED', 'APPROACHING', 'DISCONNECTED'],
  LATCHED: ['STRUCTURAL_LOCK', 'ALIGNING', 'DISCONNECTED'],
  STRUCTURAL_LOCK: ['DISCONNECTED'],
};

export function canDockTransition(from: LatchStatus, to: LatchStatus): boolean {
  return DOCK_TRANSITIONS[from].includes(to);
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Error of `mover` relative to `port`, in the port frame. z, roll and pitch stay 0. Writes `out`. */
export function dockingError(mover: Pose2D, port: Pose2D, out: DockingError6): DockingError6 {
  const dx = mover.x - port.x, dy = mover.y - port.y;
  const c = Math.cos(port.theta), s = Math.sin(port.theta);
  out.x = c * dx + s * dy;
  out.y = -s * dx + c * dy;
  out.theta = wrap(mover.theta - port.theta);
  return out;
}

export function positionError(e: DockingError6): number {
  return Math.hypot(e.x, e.y);
}

export function withinTolerance(e: DockingError6, tol: DockingTolerance): boolean {
  return positionError(e) <= tol.pos && Math.abs(e.theta) <= tol.theta;
}

export class DockingController {
  readonly params: DockingParams;
  status: LatchStatus = 'DISCONNECTED';
  /** Body twist for the mover (holonomic). Zero unless APPROACHING or ALIGNING. */
  readonly command: Twist2D = { vx: 0, vy: 0, omega: 0 };
  readonly error: DockingError6 = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, theta: 0 };
  /** Why the last attempt ended in DISCONNECTED (null before the first attempt). */
  reason: DockingAbortReason | null = null;
  /** True once the latch has been closed inside the tolerance for `latchTime`. */
  lockReady = false;

  private since = 0;
  private engagedAt = 0;
  private inTolerance = 0;

  constructor(params: Partial<DockingParams> = {}) {
    this.params = { ...DEFAULT_DOCKING_PARAMS, ...params };
  }

  /** Start a docking attempt. Only valid from DISCONNECTED. */
  engage(t: number): boolean {
    if (!this.go('APPROACHING', t)) return false;
    this.engagedAt = t;
    this.reason = null;
    return true;
  }

  /** Final lock. Only valid from LATCHED once the pawl is seated. */
  confirmLock(t: number): boolean {
    if (this.status !== 'LATCHED' || !this.lockReady) return false;
    return this.go('STRUCTURAL_LOCK', t);
  }

  /** Operator / orchestrator release from any state. */
  release(t: number): boolean {
    return this.abort(t, 'released');
  }

  /** Mechanical or sensor fault: straight back to DISCONNECTED. */
  fault(t: number, reason: DockingAbortReason = 'fault'): boolean {
    return this.abort(t, reason);
  }

  /** One 50 Hz control step. Returns the status after the step. */
  update(mover: Pose2D, port: Pose2D, t: number, dt: number): LatchStatus {
    const p = this.params, e = dockingError(mover, port, this.error), cmd = this.command;
    cmd.vx = 0; cmd.vy = 0; cmd.omega = 0;
    if (this.status === 'DISCONNECTED' || this.status === 'STRUCTURAL_LOCK') return this.status;

    if (t - this.engagedAt > p.timeout) {
      this.abort(t, 'timeout');
      return this.status;
    }

    const pos = positionError(e), ang = Math.abs(e.theta);
    if (this.status === 'APPROACHING') {
      if (pos <= p.alignRadius && ang <= p.alignTheta) { this.go('ALIGNING', t); this.inTolerance = 0; }
    } else if (this.status === 'ALIGNING') {
      if (pos > 2 * p.alignRadius || ang > 2 * p.alignTheta) {
        this.go('APPROACHING', t);
      } else if (pos <= p.tolerance.pos && ang <= p.tolerance.theta) {
        this.inTolerance += dt;
        // 1e-9 slack: ten 20 ms steps sum to 0.19999999999999998 in floating point.
        if (this.inTolerance >= p.dwell - 1e-9) { this.go('LATCHED', t); this.lockReady = false; }
      } else {
        this.inTolerance = 0;
      }
    } else if (pos > p.tolerance.pos || ang > p.tolerance.theta) {
      // LATCHED but pushed out of tolerance before the lock: reopen and re-align.
      this.go('ALIGNING', t);
      this.inTolerance = 0;
      this.lockReady = false;
    } else if (t - this.since >= p.latchTime) {
      this.lockReady = true;
    }

    // Re-read through a widened local: the transitions above may have changed the status.
    const now: LatchStatus = this.status;
    if (now === 'APPROACHING' || now === 'ALIGNING') {
      const fine = now === 'ALIGNING';
      const vMax = fine ? p.vAlign : p.vApproach, wMax = fine ? p.wAlign : p.wApproach;
      // World correction = port − mover = −R(θ_port)·e; rotate into the mover body frame.
      const cp = Math.cos(port.theta), sp = Math.sin(port.theta);
      const wx = -(cp * e.x - sp * e.y), wy = -(sp * e.x + cp * e.y);
      const cm = Math.cos(mover.theta), sm = Math.sin(mover.theta);
      let vx = p.kPos * (cm * wx + sm * wy), vy = p.kPos * (-sm * wx + cm * wy);
      const speed = Math.hypot(vx, vy);
      if (speed > vMax) { vx *= vMax / speed; vy *= vMax / speed; }
      let w = -p.kTheta * e.theta;
      if (w > wMax) w = wMax; else if (w < -wMax) w = -wMax;
      cmd.vx = vx; cmd.vy = vy; cmd.omega = w;
    }
    return now;
  }

  /** Discriminated snapshot for telemetry and tests (allocates; not for the control loop). */
  snapshot(): LatchState {
    switch (this.status) {
      case 'DISCONNECTED': return { status: 'DISCONNECTED', since: this.since, reason: this.reason };
      case 'APPROACHING': return { status: 'APPROACHING', since: this.since, engagedAt: this.engagedAt };
      case 'ALIGNING': return { status: 'ALIGNING', since: this.since, engagedAt: this.engagedAt, inToleranceFor: this.inTolerance };
      case 'LATCHED': return { status: 'LATCHED', since: this.since, engagedAt: this.engagedAt, lockReady: this.lockReady };
      case 'STRUCTURAL_LOCK': return { status: 'STRUCTURAL_LOCK', since: this.since };
    }
  }

  private abort(t: number, reason: DockingAbortReason): boolean {
    if (!this.go('DISCONNECTED', t)) return false;
    this.reason = reason;
    this.lockReady = false;
    this.inTolerance = 0;
    this.command.vx = 0; this.command.vy = 0; this.command.omega = 0;
    return true;
  }

  /** Guarded transition: changes nothing and returns false if the chain forbids it. */
  private go(to: LatchStatus, t: number): boolean {
    if (!canDockTransition(this.status, to)) return false;
    this.status = to;
    this.since = t;
    return true;
  }
}

// ───────────────────────── latch stress ─────────────────────────

/** Latch plate: 48 mm × 6 mm steel section, allowable equivalent load 150 N. */
export const LATCH_SPEC = { area: 0.048 * 0.006, allowN: 150 } as const;

/** Planar stress in the latch plate from the joint forces. Writes `out`. */
export function latchStress(axialN: number, shearN: number, out: LatchStressTensor, area: number = LATCH_SPEC.area): LatchStressTensor {
  out.sxx = axialN / area;
  out.syy = 0;
  out.txy = shearN / area;
  return out;
}

/** Von Mises equivalent load √(F_a² + 3·F_s²) over the allowable load, clamped to [0, 1]. */
export function latchLoadRatio(axialN: number, shearN: number, allowN: number = LATCH_SPEC.allowN): number {
  const eq = Math.sqrt(axialN * axialN + 3 * shearN * shearN) / allowN;
  return eq > 1 ? 1 : eq;
}

/** Green below 0.5, yellow below 0.85, red above. */
export function stressLevel(loadRatio: number): StressLevel {
  return loadRatio < 0.5 ? 'NOMINAL' : loadRatio < 0.85 ? 'ELEVATED' : 'CRITICAL';
}
