import type { Engine } from '@/platform/Engine';
import { buildFleetRows, type FleetSource, type TrendBuffers } from '@/features/telemetry/rows';
import { perf } from '@/features/viewport/perf';
import type { SimSnapshot, TeamSnapshot } from './simStore';
import { calibrationSnapshot } from '@/core/calibration/snapshot';

const EVENTS_SHOWN = 60;

/** Read-only adapter from the Engine to the fleet-row builder. */
export function engineFleetSource(e: Engine): FleetSource {
  return {
    agents: e.agents,
    contacts: e.contacts,
    teamOf: id => e.teamOf(id),
    teamMetrics: teamId => {
      const mgr = e.fleet?.team(teamId);
      if (!mgr) return undefined;
      const m = mgr.getMetrics();
      const rho = e.loads.find(l => l.spec.teamId === teamId)?.physics.state.rho;
      return { eh: m.E_h === null ? null : m.E_h * 1000, rho: rho ?? null, epoch: mgr.currentEpoch };
    },
  };
}

export interface SnapshotBuffers { trends: TrendBuffers }

/** One 4 Hz poll of the engine → plain data for React. */
export function buildSnapshot(e: Engine, buffers: SnapshotBuffers): SimSnapshot {
  const ready = e.phase === 'ready';
  const w = ready ? e.workflow : undefined;
  const teams: TeamSnapshot[] = !ready ? [] : w
    ? w.teams.map(t => ({ id: t.id, phase: null, robots: w.members(t.id).length }))
    : e.fleet.teamIds.map(id => ({ id, phase: e.fleet.teamPhase(id) ?? null, robots: e.fleet.team(id)?.ids.length ?? 0 }));
  const events = e.history.slice(-EVENTS_SHOWN).reverse();
  return {
    phase: e.phase,
    progress: e.loadProgress,
    error: e.error,
    time: e.time,
    holding: e.holding,
    fps: perf.fps,
    frameMs: perf.frameMs,
    rows: ready && !w ? buildFleetRows(engineFleetSource(e), buffers.trends) : [],
    teams,
    events,
    logCount: e.logs.length,
    workflow: w ? w.snapshot() : null,
    calibration: ready && e.calibration && e.agents[0] ? calibrationSnapshot(e.calibration, e.agents[0]) : null,
  };
}
