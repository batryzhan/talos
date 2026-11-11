/**
 * Strategic-tier contracts: mission DAG, role allocation, quorum and hot-swap events.
 */
import type { FormationKind } from './macroEntity';

export type { AgentState } from '../contracts/types';

export type SwarmRole = 'WORKER' | 'STRUCTURE_NODE' | 'RESERVE';

export interface RosterEntry {
  id: number;
  role: SwarmRole;
  /** State of charge, [0, 1]. */
  battery: number;
  alive: boolean;
}

// ───────────────────────── mission DAG ─────────────────────────

export type MissionDirective =
  | { type: 'TRANSIT'; from: number; to: number }
  | { type: 'MACRO_TRANSPORT'; from: number; to: number; formation: FormationKind; payloadKg: number };

export type TaskStatus = 'PENDING' | 'ACTIVE' | 'DONE' | 'FAILED';

interface TaskBase {
  id: number;
  /** Ids of tasks that must be DONE first. */
  deps: number[];
  status: TaskStatus;
}

export type MissionTask =
  | (TaskBase & { type: 'ROUTE_CHECK'; from: number; to: number })
  | (TaskBase & { type: 'DEPLOY_BRIDGE'; from: number; to: number })
  | (TaskBase & { type: 'FORM_MACRO'; formation: FormationKind })
  | (TaskBase & { type: 'TRANSPORT'; from: number; to: number; payloadKg: number })
  | (TaskBase & { type: 'RELEASE' });

export interface MissionDag {
  directive: MissionDirective;
  tasks: MissionTask[];
}

// ───────────────────────── quorum ─────────────────────────

export type QuorumState =
  | { status: 'STABLE'; epoch: number; members: number }
  | { status: 'DEGRADED'; epoch: number; members: number; alive: number }
  /** No strict majority: the partition must hold and may not decide (split-brain guard). */
  | { status: 'LOST'; epoch: number; members: number; alive: number };

// ───────────────────────── events ─────────────────────────

export type OrchestratorEvent =
  | { type: 'quorum-reset'; t: number; epoch: number; alive: number }
  | { type: 'quorum-lost'; t: number; alive: number }
  | { type: 'hot-swap'; t: number; outId: number; inId: number; role: SwarmRole }
  | { type: 'hot-swap-blocked'; t: number; outId: number }
  | { type: 'bridge-allocated'; t: number; edgeId: number; agentIds: number[] }
  | { type: 'bridge-rejected'; t: number; reason: 'NO_SPAN' | 'INSUFFICIENT_AGENTS' };

export type StructureValidation =
  | { status: 'VALID'; latches: number }
  | { status: 'INVALID'; reason: 'heading-mismatch' | 'not-connected' | 'singular-kinematics' | 'empty' };
