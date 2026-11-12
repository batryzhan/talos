import { STRAFER_KINEMATICS, WHEEL_IDS, rpm, stoppingDistance, type WheelId } from './chassisKinematics';
import type { CalibrationProgram, ChassisState, ManeuverId, BrakeResult } from './CalibrationProgram';

export interface WheelTelemetry {
  id: WheelId;
  /** Equation 1 of the applied command (rad/s). */
  raw: number;
  /** Equation 2: ω* = ω / s (rad/s). */
  scaled: number;
  /** Actual wheel rate after the slew limit (rad/s). */
  actual: number;
  rpm: number;
  /** Rim speed ω·r (m/s). */
  rim: number;
  /** |ω*| / ω_lim ∈ [0, 1]. */
  load: number;
}

/** Throttled (4 Hz) copy of the calibration state for React. */
export interface CalibrationSnapshot {
  maneuver: ManeuverId;
  manual: boolean;
  leg: string;
  progress: number;
  cycles: number;
  command: { vx: number; vy: number; omega: number };
  measured: { vx: number; vy: number; omega: number };
  wheels: WheelTelemetry[];
  s: number;
  omegaLim: number;
  speed: number;
  /** Equation 7 at the current speed (m). */
  dStop: number;
  tau: number;
  aBrake: number;
  brake: BrakeResult | null;
  brakeCount: number;
  headingDrift: number;
  crossTrack: number;
  centerDrift: number;
  directionError: number;
  clipDirectionError: number;
  clipCurvatureError: number;
  pose: { x: number; y: number; theta: number };
}

export function calibrationSnapshot(p: CalibrationProgram, chassis: ChassisState): CalibrationSnapshot {
  const t = chassis.twist, lim = STRAFER_KINEMATICS.omegaLim, speed = Math.hypot(t.vx, t.vy);
  return {
    maneuver: p.maneuver,
    manual: p.manual,
    leg: p.leg.kind,
    progress: p.progress,
    cycles: p.cycles,
    command: { ...p.applied },
    measured: { vx: t.vx, vy: t.vy, omega: t.omega },
    wheels: WHEEL_IDS.map((id, i) => ({
      id,
      raw: p.raw[i],
      scaled: p.scaled[i],
      actual: chassis.wheelRates[i],
      rpm: rpm(chassis.wheelRates[i]),
      rim: chassis.wheelRates[i] * STRAFER_KINEMATICS.r,
      load: Math.min(1, Math.abs(p.scaled[i]) / lim),
    })),
    s: p.s,
    omegaLim: lim,
    speed,
    dStop: stoppingDistance(speed, p.tau, p.aBrake),
    tau: p.tau,
    aBrake: p.aBrake,
    brake: p.lastBrake ? { ...p.lastBrake } : null,
    brakeCount: p.brakeCount,
    headingDrift: p.headingDrift,
    crossTrack: p.crossTrack,
    centerDrift: p.centerDrift,
    directionError: p.directionError,
    clipDirectionError: p.clipDirectionError,
    clipCurvatureError: p.clipCurvatureError,
    pose: { x: chassis.pose.x, y: chassis.pose.y, theta: Math.atan2(Math.sin(chassis.pose.theta), Math.cos(chassis.pose.theta)) },
  };
}
