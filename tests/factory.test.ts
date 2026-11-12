import { describe, expect, it } from 'vitest';
import { FactoryMission } from '../src/missions/FactoryMission';
import { jCost } from '../src/core/allocation/auction';

describe('/factory — Swarm Agentic Workflow', () => {
  it('has 20 robots in five module brigades on one chassis', () => {
    const m = new FactoryMission();
    const count = (cap: string): number => m.agents.filter(a => a.module.capability === cap).length;
    expect(m.agents).toHaveLength(20);
    expect([count('PLASMA_CUTTER'), count('ARC_WELDER'), count('REPAIR_DIAGNOSTIC'), count('ROLLER_CARRIER'), count('MULTI_SWAP')]).toEqual([4, 6, 4, 4, 2]);
  });

  it('runs the chain cutting → M0-synchronised welding → shipping', () => {
    const m = new FactoryMission({ seed: 0, autoFaults: false });
    let converged = false;
    for (let s = 0; s < 120; s++) { m.run(1); if (m.jigs.some(j => j.phase === 'WELDING')) { converged = true; expect(Math.max(...m.jigs.filter(j => j.phase === 'WELDING').map(j => j.spread))).toBeLessThanOrEqual(0.01); } }
    expect(converged).toBe(true);
    expect(m.cut).toBeGreaterThan(8);
    expect(m.welded).toBeGreaterThan(0);
    expect(m.delivered).toBeGreaterThan(0);
  });

  it('a breakdown is repaired by the mechanic with the lowest J_ij (equation 5)', () => {
    const m = new FactoryMission({ seed: 3, autoFaults: false, swapAt: 1e9 });
    m.run(5);
    const machine = m.injectFault('jig-B')!;
    const a = m.lastAuction!;
    expect(a.bids).toHaveLength(4);
    for (const b of a.bids) expect(b.cost).toBeCloseTo(jCost(b), 9);
    const winner = a.bids.find(b => b.won)!;
    expect(winner.cost).toBe(Math.min(...a.bids.map(b => b.cost)));
    m.run(60);
    expect(machine.broken).toBe(false);
    expect(m.repaired).toBe(1);
  });

  it('blocking a corridor replans through S1 and no route crosses the closed edge', () => {
    const m = new FactoryMission({ seed: 1, autoFaults: false, swapAt: 1e9 });
    m.run(25);
    const edge = m.toggleCorridor()!;
    expect(m.graph.edge(edge).state.status).toBe('CLOSED');
    for (let s = 0; s < 30; s++) { m.run(1); for (const a of m.agents) expect(a.wpEdge.slice(a.wpIndex)).not.toContain(edge); }
    expect(m.network.updates).toBeGreaterThan(0);
    expect(m.toggleCorridor()).toBeNull();
    expect(m.graph.edge(edge).state.status).toBe('OPEN');
  });

  it('hot-swap at b < 25 %: epoch advances and a reserve takes over the post', () => {
    const m = new FactoryMission({ seed: 0, autoFaults: false });
    m.run(11.9);
    expect(m.epoch).toBe(0);
    m.run(40);
    expect(m.epoch).toBe(1);
    const r = m.restores[0];
    expect(m.agent(r.agentId)!.name).toBe('Welder-2');
    const reserve = m.agent(r.replacementId!)!;
    expect(reserve.name).toMatch(/^Reserve-/);
    expect(reserve.module.capability).toBe('ARC_WELDER');
    expect(r.tRestore! - r.tEvent).toBeGreaterThan(0);
    expect(m.agents.every(a => a.epoch === 1)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const run = (): string => { const m = new FactoryMission({ seed: 9 }); m.run(60); return JSON.stringify(m.agents.map(a => [a.x.toFixed(4), a.y.toFixed(4), a.task])); };
    expect(run()).toBe(run());
  });
});
