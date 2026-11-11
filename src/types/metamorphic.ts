/**
 * Metamorphic Swarm contracts (CLAUDE.md §5.3): docking latches, latch stress, the S1 routing graph
 * and deployable bridges. Primitive contracts are re-exported from src/contracts, never duplicated.
 */
import type { Pose2D } from '../contracts/types';

export type {
  AgentState, MecanumGeometry, Pose2D, Twist2D, Vec2, WheelId, WheelRates,
} from '../contracts/types';

// ───────────────────────── docking latch ─────────────────────────

export type LatchStatus = 'DISCONNECTED' | 'APPROACHING' | 'ALIGNING' | 'LATCHED' | 'STRUCTURAL_LOCK';

/** Canonical order of the docking chain; also the numeric code used in telemetry packets. */
export const LATCH_STATUS_ORDER: readonly LatchStatus[] = [
  'DISCONNECTED', 'APPROACHING', 'ALIGNING', 'LATCHED', 'STRUCTURAL_LOCK',
];

export type DockingAbortReason = 'timeout' | 'fault' | 'released' | 'validation-failed';

/** Snapshot of one docking automaton, discriminated by `status`. Times are simulation seconds. */
export type LatchState =
  | { status: 'DISCONNECTED'; since: number; reason: DockingAbortReason | null }
  | { status: 'APPROACHING'; since: number; engagedAt: number }
  | { status: 'ALIGNING'; since: number; engagedAt: number; inToleranceFor: number }
  | { status: 'LATCHED'; since: number; engagedAt: number; lockReady: boolean }
  | { status: 'STRUCTURAL_LOCK'; since: number };

/**
 * 6-DOF docking error of the mover relative to its port, expressed in the port frame.
 * The simulation is planar: x, y and theta are computed, while z, roll and pitch are fixed by the
 * floor contact and are identically zero (encoded in the type).
 */
export interface DockingError6 {
  x: number;
  y: number;
  z: 0;
  roll: 0;
  pitch: 0;
  theta: number;
}

/** Latch gate: Δp ≤ pos (m) and |Δθ| ≤ theta (rad). */
export interface DockingTolerance {
  pos: number;
  theta: number;
}

// ───────────────────────── latch stress ─────────────────────────

/** Planar Cauchy stress in the latch plate (Pa); x is the latch axis. */
export interface LatchStressTensor {
  sxx: number;
  syy: number;
  txy: number;
}

export type StressLevel = 'NOMINAL' | 'ELEVATED' | 'CRITICAL';

/** Tension metrics of the joint between chassis `a` and `b`. */
export interface JointTension {
  a: number;
  b: number;
  /** Force along the latch axis (N, + tension). */
  axialN: number;
  shearN: number;
  /** Equivalent load over the allowable load, clamped to [0, 1]. Drives the stress colour. */
  loadRatio: number;
  level: StressLevel;
}

// ───────────────────────── S1 routing graph ─────────────────────────

export type S1EdgeStatus = 'OPEN' | 'CLOSED' | 'PASSABLE_STRUCTURE';

/** Why an edge is closed. Only a CHASM can be spanned by a deployable bridge. */
export type S1ClosureReason = 'CHASM' | 'BLOCKED' | 'DYNAMIC_CUT';

export type S1EdgeState =
  | { status: 'OPEN' }
  | { status: 'CLOSED'; reason: S1ClosureReason }
  | { status: 'PASSABLE_STRUCTURE'; traversable: true; maxLoadKg: number; agentIds: readonly number[] };

export interface S1Node {
  id: number;
  x: number;
  y: number;
}

export interface S1Edge {
  id: number;
  a: number;
  b: number;
  /** Traversal cost (m); never below the Euclidean node distance, so A* stays admissible. */
  length: number;
  state: S1EdgeState;
}

export type S1Algorithm = 'dijkstra' | 'astar';

export type S1Route =
  | { status: 'FOUND'; cost: number; nodes: number[]; edges: number[] }
  | { status: 'UNREACHABLE'; cost: number };

// ───────────────────────── deployable bridge ─────────────────────────

export type BridgePlan =
  | { status: 'NOT_NEEDED' }
  | { status: 'NO_SPAN' }
  | { status: 'INSUFFICIENT_AGENTS'; edgeId: number; required: number; available: number }
  | { status: 'PLANNED'; edgeId: number; gapLength: number; agentIds: number[]; slots: Pose2D[] };

export type BridgeStatus = 'IDLE' | 'DEPLOYING' | 'HOLDING' | 'RELEASED';
