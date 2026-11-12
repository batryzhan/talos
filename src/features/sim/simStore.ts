import { create } from 'zustand';
import type { Engine, EngineEvent, EnginePhase } from '@/platform/Engine';
import type { FleetRow } from '@/features/telemetry/rows';
import type { WorkflowSnapshot } from '@/missions/workflow/types';
import type { CalibrationSnapshot } from '@/core/calibration/snapshot';

export interface TeamSnapshot { id: string; phase: string | null; robots: number }

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
  /** Workflow missions (factory, wildfire, mine): rows, KPIs and live auction / consensus state. */
  workflow: WorkflowSnapshot | null;
  /** Chassis calibration (mode 0): wheels, equations 1, 2, 7 and test results. */
  calibration: CalibrationSnapshot | null;
}

export const EMPTY_SNAPSHOT: SimSnapshot = {
  phase: 'loading', progress: 0, error: null, time: 0, holding: false, fps: 60, frameMs: 16.7,
  rows: [], teams: [], events: [], logCount: 0, workflow: null, calibration: null,
};

interface SimStore { engine: Engine | null; snap: SimSnapshot }

export const useSimStore = create<SimStore>()(() => ({ engine: null, snap: EMPTY_SNAPSHOT }));

/** Select from the throttled snapshot. */
export function useSim<T>(select: (s: SimSnapshot) => T): T {
  return useSimStore(s => select(s.snap));
}
