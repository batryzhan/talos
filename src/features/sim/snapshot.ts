import type { Engine } from '@/platform/Engine';
import { MetamorphicScene } from '@/simulation/environments/MetamorphicScene';
import { stressLevel } from '@/core/metamorphic/docking';
import { buildFleetRows, type FleetSource, type TrendBuffers } from '@/features/telemetry/rows';
import { perf } from '@/features/viewport/perf';
import type { MacroSnapshot, SimSnapshot, TeamSnapshot } from './simStore';

const EVENTS_SHOWN = 60;
const RESIDUAL_TREND = 40;

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

function macroSnapshot(scene: MetamorphicScene, residualTrend: number[]): MacroSnapshot {
  const h = scene.hud;
  if (residualTrend.length >= RESIDUAL_TREND) residualTrend.shift();
  residualTrend.push(h.residual);
  const workers = h.required;
  return {
    locked: h.locked,
    lockedCount: h.lockedCount,
    required: h.required,
    assembling: !h.locked && h.dockStatus.some(d => d !== 'DISCONNECTED'),
    totalCurrent: h.totalCurrent,
    residual: h.residual,
    residualTrend: [...residualTrend],
    saturation: h.saturation,
    peakStress: h.peakStress,
    stress: stressLevel(h.peakStress),
    routeStatus: h.routeStatus,
    routeCost: h.routeCost,
    bridgeStatus: h.bridgeStatus,
    quorum: h.quorumStatus,
    delivery: h.delivery,
    epoch: h.epoch,
    chassis: Array.from({ length: MetamorphicScene.ROBOTS }, (_, i) => ({
      id: i + 1,
      role: i < workers ? 'worker' as const : 'reserve' as const,
      latch: h.dockStatus[i] ?? 'DISCONNECTED',
      power: h.chassisPower[i] ?? 0,
    })),
  };
}

export interface SnapshotBuffers { trends: TrendBuffers; residual: number[] }

/** One 4 Hz poll of the engine → plain data for React. */
export function buildSnapshot(e: Engine, buffers: SnapshotBuffers): SimSnapshot {
  const ready = e.phase === 'ready';
  const teams: TeamSnapshot[] = ready
    ? e.fleet.teamIds.map(id => ({ id, phase: e.fleet.teamPhase(id) ?? null, robots: e.fleet.team(id)?.ids.length ?? 0 }))
    : [];
  const events = e.history.slice(-EVENTS_SHOWN).reverse();
  return {
    phase: e.phase,
    progress: e.loadProgress,
    error: e.error,
    time: e.metamorphic ? e.metamorphic.clock.time : e.time,
    holding: e.holding,
    fps: perf.fps,
    frameMs: perf.frameMs,
    rows: ready ? buildFleetRows(engineFleetSource(e), buffers.trends).map(row=>e.rescue?{
      ...row, slope:e.agents[row.id-1].slopeDegrees,
      routeSeconds:e.rescue.routeEstimate(e.teamOf(row.id)??'Alpha'),
      duty: row.team ? undefined : e.fleet.dutyOf(row.id),
      rho:row.team==='Alpha'?e.rescue.rho:row.rho,
    }:row) : [],
    teams,
    events,
    logCount: e.logs.length,
    rescue: e.rescue?.snapshot,
    macro: e.metamorphic && ready ? macroSnapshot(e.metamorphic, buffers.residual) : null,
  };
}
