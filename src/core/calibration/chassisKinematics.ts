/**
 * goBILDA Strafer chassis kinematics for /calibration (CLAUDE.md §1, chassis layer).
 * Pure, allocation-free functions shared by the simulator, the UI and the tests.
 *
 *   Equation 1 (inverse kinematics, X-roller layout, L = a + b):
 *     [ω_FL, ω_FR, ω_RL, ω_RR]ᵀ = 1/r · [[1, −1, −L], [1, 1, L], [1, 1, −L], [1, −1, L]] · [v_x, v_y, ω]ᵀ
 *   Equation 2 (proportional saturation):
 *     s = max(1, maxᵢ |ωᵢ| / ω_lim),  ωᵢ* = ωᵢ / s
 *   Equation 7 (stopping distance):
 *     d_stop ≈ v·τ + v² / (2·a_br)
 */
import { DRIVE_OMEGA_FREE, MECANUM_140 } from '../../robot/straferSpec';

export const WHEEL_IDS = ['FL', 'FR', 'RL', 'RR'] as const;
export type WheelId = (typeof WHEEL_IDS)[number];

/** Strafer geometry (m) and drive limit (rad/s). */
export const STRAFER_KINEMATICS = {
  /** Half wheelbase along x (axle → centre). */
  a: MECANUM_140.x,
  /** Half track along y. */
  b: MECANUM_140.y,
  L: MECANUM_140.x + MECANUM_140.y,
  r: MECANUM_140.r,
  /** 5203 26.9:1 free speed, 223 rpm. */
  omegaLim: DRIVE_OMEGA_FREE,
} as const;

/** Rows of equation 1: coefficients of v_y and of L·ω for FL, FR, RL, RR. */
export const EQ1_ROWS: readonly (readonly [number, number])[] = [[-1, -1], [1, 1], [1, -1], [-1, 1]];

/** Wheel centre in the body frame (x forward, y left), FL FR RL RR. */
export const WHEEL_POSITIONS: readonly (readonly [number, number])[] = [
  [STRAFER_KINEMATICS.a, STRAFER_KINEMATICS.b],
  [STRAFER_KINEMATICS.a, -STRAFER_KINEMATICS.b],
  [-STRAFER_KINEMATICS.a, STRAFER_KINEMATICS.b],
  [-STRAFER_KINEMATICS.a, -STRAFER_KINEMATICS.b],
];

/**
 * Direction (body frame, unnormalised) in which wheel i pushes the chassis when it turns forward:
 * the contact roller only transmits force across its own axle, so wheel i drives along (1, s_y).
 */
export const traction = (i: number): readonly [number, number] => [1, EQ1_ROWS[i][0]];

/** Equation 1 written into `out` (rad/s). */
export function wheelRates(vx: number, vy: number, omega: number, out: Float64Array | number[], g = STRAFER_KINEMATICS): Float64Array | number[] {
  for (let i = 0; i < 4; i++) out[i] = (vx + EQ1_ROWS[i][0] * vy + EQ1_ROWS[i][1] * g.L * omega) / g.r;
  return out;
}

/** Equation 2: the saturation factor s ≥ 1. */
export function saturationFactor(rates: ArrayLike<number>, omegaLim = STRAFER_KINEMATICS.omegaLim): number {
  let peak = 0;
  for (let i = 0; i < 4; i++) peak = Math.max(peak, Math.abs(rates[i]));
  return Math.max(1, peak / omegaLim);
}

/** Equation 2 applied: ωᵢ* = ωᵢ / s written into `out` (may alias `rates`). Returns s. */
export function saturate(rates: ArrayLike<number>, out: Float64Array | number[], omegaLim = STRAFER_KINEMATICS.omegaLim): number {
  const s = saturationFactor(rates, omegaLim);
  for (let i = 0; i < 4; i++) out[i] = rates[i] / s;
  return s;
}

/** Forward kinematics (pseudo-inverse of equation 1) into `out` = [v_x, v_y, ω]. */
export function bodyTwist(rates: ArrayLike<number>, out: Float64Array | number[], g = STRAFER_KINEMATICS): Float64Array | number[] {
  let vx = 0, vy = 0, w = 0;
  for (let i = 0; i < 4; i++) { vx += rates[i]; vy += EQ1_ROWS[i][0] * rates[i]; w += EQ1_ROWS[i][1] * rates[i]; }
  const k = g.r / 4;
  out[0] = k * vx; out[1] = k * vy; out[2] = (k * w) / g.L;
  return out;
}

/** Equation 7: stopping distance (m) from speed v (m/s), reaction time τ (s), braking deceleration a_br (m/s²). */
export function stoppingDistance(v: number, tau: number, aBrake: number): number {
  const s = Math.abs(v);
  return s * tau + (s * s) / (2 * aBrake);
}

/** rad/s → rpm. */
export const rpm = (omega: number): number => (omega * 60) / (2 * Math.PI);
