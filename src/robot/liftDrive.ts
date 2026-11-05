/**
 * Viper Slide drive model (CLAUDE.md §4.4, formula 15). Pure, no three.js.
 *
 *   F ≈ η · G · τ_m / r_s   (per motor, × number of motors)
 *   P = F · v
 *
 * DC motor with a linear torque–speed line: τ = τ_stall (1 − ω/ω_free).
 * HOLD = active position lock + brake: the height is frozen and the drive keeps producing the
 * holding torque. Power is NEVER simply cut — with power cut and no brake a loaded slide back-drives.
 */
import type { LiftDriveParams } from '../contracts/types';

export const G0 = 9.81;
/** Bus voltage (V) used for electrical power estimates. */
export const BUS_VOLTAGE = 12;

/**
 * Default: 2 × goBILDA 5203 Yellow Jacket (19.2:1, 312 rpm, 2.38 N·m output stall) on a 32 mm spool.
 * Stall force ≈ 2·0.8·19.2·0.124/0.016 ≈ 238 N, unloaded linear speed ≈ 0.52 m/s.
 */
export const DEFAULT_LIFT_PARAMS: LiftDriveParams = {
  hMin: 0,
  hMax: 0.24,
  gearRatio: 19.2,
  efficiency: 0.8,
  motorStallTorque: 0.124,
  motorFreeSpeed: 627,
  stallCurrent: 9.2,
  freeCurrent: 0.25,
  motors: 2,
  spoolRadius: 0.016,
  carriageMass: 0.9,
  vMax: 0.12,
  aMax: 0.6,
};

/** Formula 15: total traction force available at a given motor torque (N). */
export function tractionForce(p: LiftDriveParams, motorTorque = p.motorStallTorque): number {
  return (p.motors * p.efficiency * p.gearRatio * motorTorque) / p.spoolRadius;
}

/** Static force the drive must hold: payload share + carriage weight (N). */
export function requiredForce(p: LiftDriveParams, loadForce: number): number {
  return Math.max(0, loadForce) + p.carriageMass * G0;
}

/** Fraction of stall torque needed to hold the load (≥ 1 ⇒ the drive cannot hold it). */
export function torqueFraction(p: LiftDriveParams, loadForce: number): number {
  return requiredForce(p, loadForce) / tractionForce(p);
}

/**
 * Max achievable upward speed under load (m/s), from the torque–speed line, capped by vMax.
 * This is the per-agent bound used for group saturation (slowest / most loaded member).
 */
export function maxUpSpeed(p: LiftDriveParams, loadForce: number): number {
  const f = torqueFraction(p, loadForce);
  if (f >= 1) return 0;
  const omegaMotor = p.motorFreeSpeed * (1 - f);
  return Math.min(p.vMax, (omegaMotor * p.spoolRadius) / p.gearRatio);
}

/**
 * Estimate the payload force on the pad (N) from the drive current — the fallback load sensor when
 * the force sensor is absent. Inverts the current ∝ torque model used in stepLift (static / rising).
 */
export function estimateLoadFromCurrent(p: LiftDriveParams, totalCurrent: number): number {
  const perMotor = totalCurrent / p.motors;
  const frac = Math.max(0, (perMotor - p.freeCurrent) / (p.stallCurrent - p.freeCurrent));
  return Math.max(0, frac * tractionForce(p) - p.carriageMass * G0);
}

export interface LiftState {
  h: number;
  hDot: number;
  /** Brake / position lock engaged. */
  locked: boolean;
  /** Total drive current (A). */
  current: number;
  /** Mechanical power F·v (W) and electrical power V·I (W). */
  mechPower: number;
  elecPower: number;
  /** True when the load exceeds the stall force and the slide is back-driven. */
  overloaded: boolean;
}

export function createLiftState(h = 0): LiftState {
  return { h, hDot: 0, locked: false, current: 0, mechPower: 0, elecPower: 0, overloaded: false };
}

export interface LiftStepInput {
  /** Commanded lift velocity u_i (m/s). */
  u: number;
  /** Downward force from the payload on the pad (N), ≥ 0. */
  loadForce: number;
  /** Engage position lock (HOLD). */
  lock: boolean;
  /** Drive fault: the motor cannot produce motion; the brake still holds. */
  fault?: boolean;
}

/** Integrate the slide by dt. Mutates and returns `s`. */
export function stepLift(s: LiftState, p: LiftDriveParams, inp: LiftStepInput, dt: number): LiftState {
  const frac = torqueFraction(p, inp.loadForce);
  const fReq = requiredForce(p, inp.loadForce);
  const motorCurrent = (tf: number) => p.freeCurrent + (p.stallCurrent - p.freeCurrent) * Math.min(1, Math.max(0, tf));

  if (inp.lock || inp.fault) {
    // Position lock: height frozen. Active electrical hold draws the holding current, capped at
    // stall; anything above stall is carried by the mechanical brake.
    s.locked = true;
    s.hDot = 0;
    s.overloaded = false;
    s.current = p.motors * motorCurrent(frac);
    s.mechPower = 0;
    s.elecPower = BUS_VOLTAGE * s.current;
    return s;
  }
  s.locked = false;

  let vTarget: number;
  if (frac >= 1) {
    // Overload, no brake: the slide is back-driven downward regardless of command.
    s.overloaded = true;
    vTarget = -Math.min(p.vMax, 0.5 * p.vMax * (frac - 1) + 0.02);
  } else {
    s.overloaded = false;
    vTarget = Math.min(Math.max(inp.u, -p.vMax), maxUpSpeed(p, inp.loadForce));
  }

  const dv = vTarget - s.hDot, maxDv = p.aMax * dt;
  s.hDot += Math.abs(dv) <= maxDv ? dv : Math.sign(dv) * maxDv;
  s.h += s.hDot * dt;
  if (s.h <= p.hMin) { s.h = p.hMin; if (s.hDot < 0) s.hDot = 0; }
  if (s.h >= p.hMax) { s.h = p.hMax; if (s.hDot > 0) s.hDot = 0; }

  s.current = p.motors * motorCurrent(s.hDot >= 0 ? frac : frac * 0.3);
  s.mechPower = fReq * s.hDot;
  s.elecPower = BUS_VOLTAGE * s.current;
  return s;
}
