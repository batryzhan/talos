/**
 * Mecanum kinematics for the goBILDA Strafer (CLAUDE.md §4.5, formula 14).
 * Pure functions, no three.js — usable from the swarm and from unit tests.
 *
 * Body frame: x forward, y left, ω CCW. Wheel order FL, FR, RL, RR. X-roller layout.
 *
 *   ⎡ω1⎤       ⎡ 1  −1  −(a+b) ⎤ ⎡vx⎤
 *   ⎢ω2⎥ = 1/r ⎢ 1   1   (a+b) ⎥ ⎢vy⎥
 *   ⎢ω3⎥       ⎢ 1   1  −(a+b) ⎥ ⎣ω ⎦
 *   ⎣ω4⎦       ⎣ 1  −1   (a+b) ⎦
 */
import type { MecanumGeometry, Twist2D, WheelRates } from '../contracts/types';

/** Row signs (s_y, s_ω) of formula 14 for FL, FR, RL, RR. */
export const MECANUM_SIGNS: readonly (readonly [number, number])[] = [
  [-1, -1], // FL
  [1, 1],   // FR
  [1, -1],  // RL
  [-1, 1],  // RR
];

/** Inverse kinematics: body twist → wheel angular rates (rad/s). No saturation. */
export function inverseKinematics(t: Twist2D, g: MecanumGeometry): WheelRates {
  const L = g.a + g.b;
  return MECANUM_SIGNS.map(([sy, sw]) => (t.vx + sy * t.vy + sw * L * t.omega) / g.r) as WheelRates;
}

/** Forward kinematics (pseudo-inverse of formula 14): wheel rates → body twist. */
export function forwardKinematics(w: WheelRates, g: MecanumGeometry): Twist2D {
  const L = g.a + g.b;
  const k = g.r / 4;
  let vx = 0, vy = 0, om = 0;
  for (let i = 0; i < 4; i++) {
    const [sy, sw] = MECANUM_SIGNS[i];
    vx += w[i];
    vy += sy * w[i];
    om += sw * w[i];
  }
  return { vx: k * vx, vy: k * vy, omega: (k * om) / L };
}

/**
 * Uniform saturation: if any |ω_m| > ω_max, scale the WHOLE vector by α = ω_max / max|ω_m|.
 * Per-wheel clamping is forbidden — it changes the direction of motion under a shared payload.
 * Returns the scaled rates and the applied α (1 when unsaturated).
 */
export function saturateUniform(w: WheelRates, omegaMax: number): { rates: WheelRates; alpha: number } {
  let peak = 0;
  for (const v of w) peak = Math.max(peak, Math.abs(v));
  if (peak <= omegaMax) return { rates: [...w] as WheelRates, alpha: 1 };
  const alpha = omegaMax / peak;
  return { rates: w.map(v => v * alpha) as WheelRates, alpha };
}

/** IK followed by uniform saturation. */
export function twistToWheelRates(t: Twist2D, g: MecanumGeometry, omegaMax = g.omegaMax): { rates: WheelRates; alpha: number } {
  return saturateUniform(inverseKinematics(t, g), omegaMax);
}

/**
 * Slew-limit wheel rates toward a target with a UNIFORM scaling of the step, so the transient keeps
 * the commanded direction as well: every wheel covers the same fraction of its remaining error.
 */
export function slewUniform(current: WheelRates, target: WheelRates, maxDelta: number): WheelRates {
  let peak = 0;
  for (let i = 0; i < 4; i++) peak = Math.max(peak, Math.abs(target[i] - current[i]));
  if (peak <= Math.max(0, maxDelta)) return [...target] as WheelRates;
  if (!(maxDelta > 0)) return [...current] as WheelRates; // dt ≤ 0 or NaN: no motion

  const f = maxDelta / peak;
  return current.map((c, i) => c + (target[i] - c) * f) as WheelRates;
}

/** World-frame vector → body frame of a robot with heading θ (rotation by −θ). */
export function worldToBody(vx: number, vy: number, theta: number): { x: number; y: number } {
  const c = Math.cos(theta), s = Math.sin(theta);
  return { x: c * vx + s * vy, y: -s * vx + c * vy };
}

/** Body-frame vector → world frame (rotation by +θ). */
export function bodyToWorld(vx: number, vy: number, theta: number): { x: number; y: number } {
  const c = Math.cos(theta), s = Math.sin(theta);
  return { x: c * vx - s * vy, y: s * vx + c * vy };
}
