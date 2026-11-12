/** Plain-data snapshot types of the workflow missions (read by React at 4 Hz). */
import type { ModuleCapability, ModuleState } from '../../core/agents/taskModule';

export interface WorkflowTeam { id: string; capability: ModuleCapability; size: number }

/** One robot in the workflow telemetry table. */
export interface WorkflowRow {
  id: number;
  name: string;
  team: string;
  module: ModuleCapability;
  moduleState: ModuleState;
  task: string;
  target: string;
  /** J_ij of the task the robot holds, or null. */
  bid: number | null;
  progress: number;
  battery: number;
  epoch: number;
  hold: boolean;
  active: boolean;
  /** Learned time t̂ of the edge being driven (s), 0 off-graph. */
  edgeEstimate: number;
  /** Mission-specific: cargo (kg), tank (L), illumination / LiDAR status. */
  load?: number;
  loadPct?: number;
  lidar?: string;
}

export interface FactoryKpi {
  cut: number;
  welded: number;
  repaired: number;
  delivered: number;
  inCutting: number;
  inWelding: number;
  inRepair: number;
  inHauling: number;
  faults: number;
  corridorBlocked: boolean;
  replans: number;
  updates: number;
  /** Last repair auction (bids per mechanic) — empty until a breakdown. */
  auction: { machine: string; bids: { name: string; cost: number; t: number; q: number; r: number; u: number; won: boolean }[] } | null;
  weldConsensus: { jig: string; spread: number; converged: boolean }[];
  epoch: number;
  restoreSeconds: number | null;
  lastObservation: { edge: number; before: number; after: number } | null;
}

export interface WildfireKpi {
  activeFires: number;
  burningCells: number;
  contained: number;
  burnt: number;
  extinguished: number;
  firebreakCells: number;
  waterFleet: number;
  waterCapacity: number;
  connectivity: number;
  relaysActive: number;
  wind: number;
  replans: number;
  updates: number;
  refills: number;
  epoch: number;
}

export interface MiningKpi {
  minedKg: number;
  delivered: number;
  explored: number;
  activeFaces: number;
  collapses: number;
  replans: number;
  updates: number;
  lidarVisor: boolean;
  teams: { id: string; working: number; size: number }[];
  epoch: number;
}

/** 3D status badge over a machine / incident (rendered as an HTML label in the viewport). */
export interface WorkflowBadge {
  id: string;
  x: number; y: number; z: number;
  title: string;
  detail: string;
  /** Operation progress ∈ [0, 1], or null for a plain label. */
  progress: number | null;
  tone: 'destructive' | 'warning' | 'info' | 'success';
}

export type WorkflowSnapshot =
  | { kind: 'factory'; rows: WorkflowRow[]; kpi: FactoryKpi; badges: WorkflowBadge[] }
  | { kind: 'wildfire'; rows: WorkflowRow[]; kpi: WildfireKpi; badges: WorkflowBadge[] }
  | { kind: 'mining'; rows: WorkflowRow[]; kpi: MiningKpi; badges: WorkflowBadge[] };
