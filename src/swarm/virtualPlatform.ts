/**
 * Virtual-platform kinematics (CLAUDE.md §4.5, formula 16):
 *   v_i = v_c + ω_c [−r_iy, r_ix]^T      (r_i rotated into the world frame by the payload heading)
 * then v_i is rotated into robot i's body frame by −θ_i. All robots share ω_c, so the group moves
 * as one rigid body: on a turn the outer robots speed up and the inner ones slow down.
 */
import type { PayloadMotionCommand, Pose2D, Twist2D, Vec2 } from '../contracts/types';
import { worldToBody } from '../robot/mecanum';

/** Offset r_i (payload frame) → world-frame offset. */
export function offsetToWorld(r: Vec2, payloadTheta: number): Vec2 {
  const c = Math.cos(payloadTheta), s = Math.sin(payloadTheta);
  return { x: c * r.x - s * r.y, y: s * r.x + c * r.y };
}

/** World position of support point i for a payload reference pose. */
export function supportPointWorld(payload: Pose2D, r: Vec2): Vec2 {
  const o = offsetToWorld(r, payload.theta);
  return { x: payload.x + o.x, y: payload.y + o.y };
}

/** Formula 16 in the world frame. `rWorld` is r_i already rotated into the world frame. */
export function supportVelocityWorld(cmd: PayloadMotionCommand, rWorld: Vec2): Vec2 {
  return { x: cmd.vc.x - cmd.omegaC * rWorld.y, y: cmd.vc.y + cmd.omegaC * rWorld.x };
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export interface TrackingGains {
  /** Position error gain (1/s) and heading error gain (1/s). */
  kPos: number;
  kTheta: number;
}

/**
 * Body twist for robot i: formula-16 feed-forward plus a proportional correction toward its
 * reference support point (p_ref = p*_c + R(θ*_c) r_i) and reference heading.
 */
export function supportTwist(
  cmd: PayloadMotionCommand,
  payloadRef: Pose2D,
  r: Vec2,
  robot: Pose2D,
  headingOffset: number,
  gains: TrackingGains,
): Twist2D {
  const rw = offsetToWorld(r, payloadRef.theta);
  const ff = supportVelocityWorld(cmd, rw);
  const ex = payloadRef.x + rw.x - robot.x, ey = payloadRef.y + rw.y - robot.y;
  const vw = { x: ff.x + gains.kPos * ex, y: ff.y + gains.kPos * ey };
  const vb = worldToBody(vw.x, vw.y, robot.theta);
  const eTheta = wrapAngle(payloadRef.theta + headingOffset - robot.theta);
  return { vx: vb.x, vy: vb.y, omega: cmd.omegaC + gains.kTheta * eTheta };
}

/** Advance the payload reference pose p*(k) by the motion command. */
export function integratePayloadRef(ref: Pose2D, cmd: PayloadMotionCommand, dt: number): void {
  ref.x += cmd.vc.x * dt;
  ref.y += cmd.vc.y * dt;
  ref.theta += cmd.omegaC * dt;
}
