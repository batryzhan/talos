import type { OperationMode } from '@/contracts/types';
import type { BadgeTone } from '@/components/ui/badge';

/** One robot in the fleet table. Units are display units (N, mm, fraction, m). */
export interface FleetRow {
  id: number;
  /** Team the robot serves right now; null for reserves / unassigned. */
  team: string | null;
  state: OperationMode;
  /** Support reaction force (N); null when the robot carries nothing. */
  force: number | null;
  /** Lift height (mm). */
  height: number;
  /** Battery charge, [0, 1]. */
  battery: number;
  batteryTrend: readonly number[];
  /** Team support height spread (mm). */
  eh: number | null;
  ehTrend: readonly number[];
  /** Stability margin of the team payload (m). */
  rho: number | null;
  epoch: number | null;
}

export interface TeamMetrics { eh: number | null; rho: number | null; epoch: number }

/** Minimal read-only view of the simulation, so rows can be built (and tested) without an Engine. */
export interface FleetSource {
  agents: readonly { id: number; mode: OperationMode; battery: number; lift: { h: number } }[];
  contacts: readonly { agentId: number; force: number }[];
  teamOf(agentId: number): string | undefined;
  teamMetrics(teamId: string): TeamMetrics | undefined;
}

/** Rolling trends (per robot / per team) kept between polls. */
export interface TrendBuffers { battery: Map<number, number[]>; eh: Map<string, number[]> }

export const TREND_LENGTH = 40; // 40 samples × 250 ms = 10 s

export function createTrendBuffers(): TrendBuffers {
  return { battery: new Map(), eh: new Map() };
}

function pushTrend<K>(map: Map<K, number[]>, key: K, value: number, cap: number): number[] {
  const prev = map.get(key) ?? [];
  const next = prev.length >= cap ? [...prev.slice(prev.length - cap + 1), value] : [...prev, value];
  map.set(key, next);
  return next;
}

/** Build the table rows for one poll and advance the trend buffers. */
export function buildFleetRows(src: FleetSource, trends: TrendBuffers, cap = TREND_LENGTH): FleetRow[] {
  const forces = new Map<number, number>();
  for (const c of src.contacts) forces.set(c.agentId, c.force);
  const metrics = new Map<string, TeamMetrics | undefined>();

  return src.agents.map(a => {
    const team = src.teamOf(a.id) ?? null;
    let m: TeamMetrics | undefined;
    if (team !== null) {
      if (!metrics.has(team)) {
        m = src.teamMetrics(team);
        metrics.set(team, m);
        if (m && m.eh !== null) pushTrend(trends.eh, team, m.eh, cap);
      } else m = metrics.get(team);
    }
    return {
      id: a.id,
      team,
      state: a.mode,
      force: forces.get(a.id) ?? null,
      height: a.lift.h * 1000,
      battery: a.battery,
      batteryTrend: pushTrend(trends.battery, a.id, a.battery, cap),
      eh: m?.eh ?? null,
      ehTrend: team !== null ? (trends.eh.get(team) ?? []) : [],
      rho: m?.rho ?? null,
      epoch: m?.epoch ?? null,
    };
  });
}

/** Status colour: READY green, LIFT/TRANSPORT blue, HOLD red, APPROACH amber. */
export function stateTone(mode: OperationMode): BadgeTone {
  switch (mode) {
    case 'READY': return 'success';
    case 'LIFT': case 'TRANSPORT': return 'info';
    case 'HOLD': return 'destructive';
    case 'APPROACH': return 'warning';
    case 'CONTACT': case 'LOWER': return 'primary';
  }
}

/** Stability margin colour: > 0.03 m safe, 0 … 0.03 m marginal, < 0 unstable. */
export function rhoTone(rho: number | null): 'success' | 'warning' | 'destructive' | 'neutral' {
  if (rho === null || !Number.isFinite(rho)) return 'neutral';
  return rho > 0.03 ? 'success' : rho >= 0 ? 'warning' : 'destructive';
}
