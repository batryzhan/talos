import { describe, expect, it } from 'vitest';
import type { FleetEvent, FleetStepOutput, SupportAssignment, Vec2 } from '../src/contracts/types';
import { TalosRobotAgent } from '../src/robot/TalosRobotAgent';
import { SwarmFleet } from '../src/swarm/SwarmFleet';
import { SwarmManager } from '../src/swarm/SwarmManager';
import { stabilityMargin } from '../src/swarm/supportPolygon';

/** n support points on an ellipse (payload frame). */
function ring(n: number, rx: number, ry: number, phase = 0): Vec2[] {
  return Array.from({ length: n }, (_, i) => ({ x: rx * Math.cos(phase + (2 * Math.PI * i) / n), y: ry * Math.sin(phase + (2 * Math.PI * i) / n) }));
}

function robots(ids: number[], at: (i: number) => Vec2): TalosRobotAgent[] {
  return ids.map((id, i) => new TalosRobotAgent({ id, pose: { ...at(i), theta: 0 } }));
}

function supports(ids: number[], pts: Vec2[]): SupportAssignment[] {
  return ids.map((agentId, i) => ({ agentId, r: pts[i] }));
}

function run(fleet: SwarmFleet, seconds: number, until?: (o: FleetStepOutput) => boolean, dt = 0.01) {
  const events: FleetEvent[] = [];
  let out!: FleetStepOutput;
  for (let i = 0; i < seconds / dt; i++) {
    out = fleet.step(dt, { time: fleet.time, contacts: [] });
    events.push(...out.events);
    if (until?.(out)) break;
  }
  return { out, events };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('stability margin', () => {
  it('ρ of a rectangle centre; removing one corner puts r_c on the diagonal (ρ = 0)', () => {
    const rect = [{ x: 0.5, y: 0.3 }, { x: -0.5, y: 0.3 }, { x: -0.5, y: -0.3 }, { x: 0.5, y: -0.3 }];
    expect(stabilityMargin(rect, { x: 0, y: 0 })).toBeCloseTo(0.3, 12);
    expect(stabilityMargin(rect.slice(1), { x: 0, y: 0 })).toBeCloseTo(0, 12);
    expect(stabilityMargin(rect, { x: 0.8, y: 0 })).toBeLessThan(0);
  });
});

describe('SwarmManager with arbitrary ids and membership changes', () => {
  it('ids need not be 1..N; edges use agent ids; add/remove bump the epoch', () => {
    const agents = robots([11, 17, 23], i => ({ x: i, y: 0 }));
    const m = new SwarmManager(agents);
    expect(m.edges).toEqual([[11, 17], [11, 23], [17, 23]]);
    const e = m.currentEpoch;
    expect(m.removeAgent(17)).toBeNull();
    expect(m.currentEpoch).toBe(e + 1);
    m.addAgent(agents[1], { x: 1, y: 2 });
    expect(m.currentEpoch).toBe(e + 2);
    expect(m.supportOf(17)).toEqual({ x: 1, y: 2 });
  });
});

describe('SwarmFleet — 24 robots, three teams', () => {
  it('teams α(8) β(8) γ(4) lift and carry concurrently with independent epochs', () => {
    const all = robots(range(1, 24), i => ({ x: (i % 6) * 0.8 - 2, y: Math.floor(i / 6) * 0.8 - 1.2 }));
    const fleet = new SwarmFleet(all, { seed: 7, chargers: [{ x: -4, y: -4 }] });
    fleet.dispatch({ teamId: 'alpha', role: 'carrier', task: 'slab', agentIds: range(1, 8), supports: supports(range(1, 8), ring(8, 1.6, 1.0)), payloadPose: { x: -6, y: 0, theta: 0 }, targetHeight: 0.1 });
    fleet.dispatch({ teamId: 'beta', role: 'carrier', task: 'truss', agentIds: range(9, 16), supports: supports(range(9, 16), ring(8, 2.2, 0.6)), payloadPose: { x: 1, y: 5, theta: 0.3 }, targetHeight: 0.08 });
    fleet.dispatch({ teamId: 'gamma', role: 'escort', task: 'column', agentIds: range(17, 20), supports: supports(range(17, 20), ring(4, 0.6, 0.5, Math.PI / 4)), payloadPose: { x: 4, y: -3, theta: 0 }, targetHeight: 0.06 });
    fleet.setReserves([21, 22, 23, 24]);
    for (const id of fleet.teamIds) fleet.startTeam(id);
    for (const id of fleet.teamIds) fleet.team(id)!.startTransport({ vc: { x: 0.05, y: 0 }, omegaC: 0 });
    const { out } = run(fleet, 60, o => o.teams.every(t => t.phase === 'CARRYING'));
    expect(out.teams.map(t => t.phase)).toEqual(['CARRYING', 'CARRYING', 'CARRYING']);
    expect(out.teams.find(t => t.teamId === 'alpha')!.meanHeight).toBeCloseTo(0.1, 2);
    expect(out.teams.find(t => t.teamId === 'gamma')!.meanHeight).toBeCloseTo(0.06, 2);
    for (const t of out.teams) { expect(t.holdReasons).toEqual([]); expect(t.heightSpread).toBeLessThan(0.003); }
    expect(out.duties[21]).toBe('RESERVE');
    expect(() => fleet.dispatch({ teamId: 'x', role: 'carrier', task: 't', agentIds: [3], supports: [{ agentId: 3, r: { x: 0, y: 0 } }], payloadPose: { x: 0, y: 0, theta: 0 } })).toThrow(/already in a team/);
  });
});

describe('DOCKING_ALIGN → PRECISION_MATE (two teams, mid-air)', () => {
  it('mates within 1 mm / 0.2° / 1 mm and the common h* is the mean of both (M0 invariant)', () => {
    const base = robots(range(1, 6), i => ({ x: 1.1 * Math.cos((2 * Math.PI * i) / 6), y: 0.7 * Math.sin((2 * Math.PI * i) / 6) }));
    const moverPose = { x: 2.6, y: 0.5, theta: 0.12 };
    const moverPts = ring(4, 0.45, 0.4, Math.PI / 4);
    const mover = robots(range(7, 10), i => ({ x: moverPose.x + moverPts[i].x, y: moverPose.y + moverPts[i].y }));
    const fleet = new SwarmFleet([...base, ...mover], { seed: 3 });
    fleet.dispatch({ teamId: 'chassis', role: 'carrier', task: 'turbine-housing', agentIds: range(1, 6), supports: supports(range(1, 6), ring(6, 1.1, 0.7)), payloadPose: { x: 0, y: 0, theta: 0 }, targetHeight: 0.08 });
    fleet.dispatch({ teamId: 'module', role: 'docker', task: 'battery-block', agentIds: range(7, 10), supports: supports(range(7, 10), moverPts), payloadPose: moverPose, targetHeight: 0.11 });
    for (const id of fleet.teamIds) { fleet.startTeam(id); fleet.team(id)!.startTransport(); }
    run(fleet, 40, o => o.teams.every(t => t.phase === 'CARRYING'));
    const h0 = [fleet.team('chassis')!.targetHeight, fleet.team('module')!.targetHeight];

    fleet.dock({ baseTeam: 'chassis', moverTeam: 'module', matePose: { x: 2.0, y: 0, theta: 0 } });
    const { out, events } = run(fleet, 120, o => o.docking[0]?.phase === 'MATED');
    const d = out.docking[0];
    expect(events.map(e => e.detail)).toContain('PRECISION_MATE');
    expect(d.phase).toBe('MATED');
    expect(d.heightError).toBeLessThan(0.001);
    expect(d.posError).toBeLessThan(0.001);
    expect(d.thetaError).toBeLessThan((0.2 * Math.PI) / 180);
    const h1 = [fleet.team('chassis')!.targetHeight, fleet.team('module')!.targetHeight];
    expect(Math.abs(h1[0] - h1[1])).toBeLessThan(1e-6);
    expect(h1[0] + h1[1]).toBeCloseTo(h0[0] + h0[1], 12);           // Σx preserved by M0
    expect(out.teams.every(t => t.phase === 'MATED')).toBe(true);
    expect(out.teams.every(t => t.holdReasons.length === 0)).toBe(true);
  });
});

describe('CHARGING_DOCK hot-swap', () => {
  function sixTeam() {
    const pts = ring(6, 1.0, 0.75);
    const team = robots(range(1, 6), i => ({ x: pts[i].x, y: pts[i].y }));
    const reserve = robots([7], () => ({ x: 0, y: 2.6 }));
    const fleet = new SwarmFleet([...team, ...reserve], { seed: 5, chargers: [{ x: 3, y: -2 }], chargeRate: 0.1 });
    fleet.dispatch({ teamId: 'alpha', role: 'carrier', task: 'engine', agentIds: range(1, 6), supports: supports(range(1, 6), pts), payloadPose: { x: 0, y: 0, theta: 0 }, targetHeight: 0.1, com: { x: 0, y: 0 } });
    fleet.setReserves([7]);
    fleet.startTeam('alpha');
    fleet.team('alpha')!.startTransport({ vc: { x: 0, y: 0 }, omegaC: 0 });
    run(fleet, 30, o => o.teams[0].phase === 'CARRYING');
    return { fleet, team, reserve: reserve[0] };
  }

  it('low robot is swapped for a reserve: epoch +2, load held still, reserve carries at h*, low robot charges', () => {
    const { fleet, team, reserve } = sixTeam();
    const mgr = fleet.team('alpha')!;
    const epoch0 = mgr.currentEpoch;
    team[1].setBattery(0.2); // agent 2 runs low
    const holders = [1, 3, 4, 5, 6].map(id => fleet.agent(id)!);
    const h0 = holders.map(a => a.lift.h);
    let maxDrift = 0;
    const events: FleetEvent[] = [];
    let out!: FleetStepOutput;
    for (let i = 0; i < 6000; i++) {
      out = fleet.step(0.01, { time: fleet.time, contacts: [] });
      events.push(...out.events);
      if (out.teams[0].phase === 'CHARGING_DOCK') holders.forEach((a, k) => { maxDrift = Math.max(maxDrift, Math.abs(a.lift.h - h0[k])); });
      if (events.some(e => e.kind === 'hot-swap-done')) break;
    }
    expect(events.map(e => e.kind)).toEqual(expect.arrayContaining(['hot-swap-start', 'hot-swap-done']));
    expect(mgr.currentEpoch).toBe(epoch0 + 2);              // leave + join
    expect(mgr.ids).toEqual([1, 3, 4, 5, 6, 7]);
    expect(reserve.mode).toBe('TRANSPORT');
    expect(reserve.lift.h).toBeCloseTo(0.1, 2);
    expect(maxDrift).toBeLessThan(1e-9);                   // carriers locked: no sag during the swap
    expect(out.teams[0].phase).toBe('CARRYING');
    expect(out.teams[0].holdReasons).toEqual([]);
    const sp = fleet.agent(2)!;
    expect(['TO_CHARGER', 'CHARGING']).toContain(out.duties[2]);
    expect(sp.lift.h).toBeLessThanOrEqual(0.001);
    // let it reach the charger and charge back to a reserve
    const r2 = run(fleet, 40, o => o.duties[2] === 'RESERVE');
    expect(r2.out.duties[2]).toBe('RESERVE');
    expect(sp.battery).toBeGreaterThanOrEqual(0.98);
    expect(r2.events.some(e => e.kind === 'charged' && e.agentId === 2)).toBe(true);
    expect(r2.out.chargers[0].occupiedBy).toBeNull();
  });

  it('swap is blocked when the remaining supports would not keep ρ ≥ ρ_min (4-robot rectangle)', () => {
    const pts = [{ x: 0.5, y: 0.35 }, { x: -0.5, y: 0.35 }, { x: -0.5, y: -0.35 }, { x: 0.5, y: -0.35 }];
    const team = robots(range(1, 4), i => pts[i]);
    const fleet = new SwarmFleet([...team, ...robots([5], () => ({ x: 0, y: 2 }))], { chargers: [{ x: 3, y: 0 }] });
    fleet.dispatch({ teamId: 'beta', role: 'carrier', task: 'beam', agentIds: range(1, 4), supports: supports(range(1, 4), pts), payloadPose: { x: 0, y: 0, theta: 0 }, targetHeight: 0.08 });
    fleet.setReserves([5]);
    fleet.startTeam('beta'); fleet.team('beta')!.startTransport();
    run(fleet, 30, o => o.teams[0].phase === 'CARRYING');
    team[0].setBattery(0.2);
    const { events, out } = run(fleet, 2);
    expect(events.some(e => e.kind === 'hot-swap-blocked' && /ρ without agent 1/.test(e.detail))).toBe(true);
    expect(events.some(e => e.kind === 'hot-swap-start')).toBe(false);
    expect(out.teams[0].phase).toBe('CARRYING');
    expect(fleet.team('beta')!.ids).toEqual([1, 2, 3, 4]);
  });
});
