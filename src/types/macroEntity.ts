/**
 * Macro-chassis contracts: a group of mechanically locked Strafers treated as one rigid body with
 * 4N Mecanum wheels (CLAUDE.md §5.3).
 */
import type { Twist2D, Vec2, WheelId } from '../contracts/types';
import type { BridgeStatus, LatchStatus, S1Route } from './metamorphic';

export type { Pose2D, Twist2D, Vec2, WheelId } from '../contracts/types';

/** Supported formations, written rows×cols: rows run along body x (forward), cols along body y. */
export type FormationKind = '2x1' | '2x2' | '1x4';

export const FORMATIONS: Readonly<Record<FormationKind, { rows: number; cols: number }>> = {
  '2x1': { rows: 2, cols: 1 },
  '2x2': { rows: 2, cols: 2 },
  '1x4': { rows: 1, cols: 4 },
};

export interface GridFormation {
  rows: number;
  cols: number;
  /** Centre-to-centre spacing along x and y (m). */
  pitchX: number;
  pitchY: number;
}

/** Row k of the wheel table: global wheel index k = 4·chassis + local. */
export interface WheelIndexEntry {
  k: number;
  chassis: number;
  local: 0 | 1 | 2 | 3;
  wheel: WheelId;
}

export interface ClusterInertia {
  mass: number;
  /** Yaw moment of inertia about C_macro (kg·m²). */
  izz: number;
}

/** Twist of the macro body about C_macro, in the macro frame. */
export type MacroTwist = Twist2D;

export type MacroEntityState =
  | { status: 'SOLO' }
  | { status: 'ASSEMBLING'; locked: number; required: number }
  | { status: 'MACRO'; formation: FormationKind; chassisCount: number; centroid: Vec2 };

export type ControlFocusKind = 'solo' | 'macro';

/** Live aggregate for the SCADA card. One object, mutated in place by the simulation. */
export interface MacroTelemetrySnapshot {
  formation: FormationKind;
  /** True once every member latch is in STRUCTURAL_LOCK. */
  locked: boolean;
  lockedCount: number;
  required: number;
  dockStatus: LatchStatus[];
  /** Sum of all motor currents (A). */
  totalCurrent: number;
  /** Electrical power per chassis (W), index = chassis. */
  chassisPower: Float64Array;
  /** Consensus residual D(k) of the torque-balancing state (A). */
  residual: number;
  consensusSteps: number;
  /** Uniform saturation factor s ≥ 1 of the last macro command. */
  saturation: number;
  /** Highest latch load ratio, [0, 1]. */
  peakStress: number;
  routeStatus: S1Route['status'];
  routeCost: number;
  bridgeStatus: BridgeStatus;
  quorumStatus: 'STABLE' | 'DEGRADED' | 'LOST';
  epoch: number;
  lossP: number;
  /** Share of radio packets delivered since start, [0, 1]. */
  delivery: number;
  focus: ControlFocusKind;
}
