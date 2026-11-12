import type { RescueSnapshot } from '@/missions/SearchRescueSim';
import { create } from 'zustand';
import type { Engine, EngineEvent, EnginePhase } from '@/platform/Engine';
import type { FleetRow } from '@/features/telemetry/rows';
import type { LatchStatus, StressLevel } from '@/types/metamorphic';
import type { BridgeStatus } from '@/types/metamorphic';

export interface TeamSnapshot { id: string; phase: string | null; robots: number }

export interface MacroChassisRow { id: number; role: 'worker' | 'reserve'; latch: LatchStatus; power: number }

export interface MacroSnapshot {
  locked: boolean;
  lockedCount: number;
  required: number;
  assembling: boolean;
  totalCurrent: number;
  residual: number;
  residualTrend: readonly number[];
  saturation: number;
  peakStress: number;
  stress: StressLevel;
  routeStatus: string;
  routeCost: number;
  bridgeStatus: BridgeStatus;
  quorum: 'STABLE' | 'DEGRADED' | 'LOST';
  delivery: number;
  epoch: number;
  chassis: MacroChassisRow[];
}

/** Throttled (4 Hz) copy of everything the React panels show. */
export interface SimSnapshot {
  phase: EnginePhase;
  progress: number;
  error: string | null;
  time: number;
  holding: boolean;
  fps: number;
  frameMs: number;
  rows: FleetRow[];
  teams: TeamSnapshot[];
  /** Newest first. */
  events: EngineEvent[];
  logCount: number;
  macro: MacroSnapshot | null;
  rescue?: RescueSnapshot;
}

export const EMPTY_SNAPSHOT: SimSnapshot = {
  phase: 'loading', progress: 0, error: null, time: 0, holding: false, fps: 60, frameMs: 16.7,
  rows: [], teams: [], events: [], logCount: 0, macro: null,
};

interface SimStore { engine: Engine | null; snap: SimSnapshot }

export const useSimStore = create<SimStore>()(() => ({ engine: null, snap: EMPTY_SNAPSHOT }));

/** Select from the throttled snapshot. */
export function useSim<T>(select: (s: SimSnapshot) => T): T {
  return useSimStore(s => select(s.snap));
}
