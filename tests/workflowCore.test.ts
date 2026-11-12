import { describe, expect, it } from 'vitest';
import { STRAFER, SwarmAgent, mecanumWheelRates, speedForDistance, stoppingDistance } from '../src/core/agents/SwarmAgent';
import { ActionCounter, applyModuleCommand, createModule } from '../src/core/agents/taskModule';
import { batteryRisk, jCost, runAuction, DEFAULT_WEIGHTS } from '../src/core/allocation/auction';
import { ResourceMutex } from '../src/core/coordination/ResourceMutex';
import { M0_THRESHOLD, m0GroupStep, m0SafeEps, m0Spread } from '../src/core/consensus/m0Group';
import { RouteNetwork } from '../src/core/routing/RouteNetwork';
import { S1Graph } from '../src/core/routing/s1Graph';
import { Rng } from '../src/swarm/rng';

describe('chassis layer (equations 1, 2, 7)', () => {
  it('uses the Strafer geometry L = a + b = 0.376 m, r = 0.070 m', () => {
    expect(STRAFER.L).toBeCloseTo(0.376, 6);
    expect(STRAFER.r).toBeCloseTo(0.07, 6);
  });

  it('inverse kinematics matches the matrix of equation 1', () => {
    const w = new Float64Array(4), vx = 0.3, vy = -0.2, om = 0.4, L = 0.376, r = 0.07;
    expect(mecanumWheelRates(vx, vy, om, w)).toBe(1);
    expect([...w]).toEqual([(vx - vy - L * om) / r, (vx + vy + L * om) / r, (vx + vy - L * om) / r, (vx - vy + L * om) / r].map(x => expect.closeTo(x, 9)));
  });

  it('saturation scales all wheels by s = max|ω|/ω_lim and keeps the direction (equation 2)', () => {
    const w = new Float64Array(4), raw = new Float64Array(4);
    mecanumWheelRates(3, 1, 0, raw, Infinity);
    const s = mecanumWheelRates(3, 1, 0, w);
    expect(s).toBeGreaterThan(1);
    expect(Math.max(...[...w].map(Math.abs))).toBeCloseTo(STRAFER.omegaLim, 9);
    for (let i = 0; i < 4; i++) expect(w[i]).toBeCloseTo(raw[i] / s, 9);
  });

  it('braking distance d_stop = vτ + v²/(2a_br) and its inverse (equation 7)', () => {
    expect(stoppingDistance(1, 0.06, 1.6)).toBeCloseTo(0.06 + 1 / 3.2, 12);
    for (const d of [0.1, 0.5, 2, 7]) expect(stoppingDistance(speedForDistance(d))).toBeCloseTo(d, 9);
  });

  it('a robot driving a route stops on its goal without overshoot', () => {
    const a = new SwarmAgent({ id: 1, name: 'A', team: 't', module: createModule('m', 'ROLLER_CARRIER'), x: 0, y: 0, vmax: 1.2 });
    a.wpX.push(3, 3); a.wpY.push(0, 2); a.wpEdge.push(-1, -1);
    let overshoot = 0;
    for (let k = 0; k < 2000 && a.hasRoute; k++) { if (k % 2 === 0) a.drive(0.02); a.integrate(0.01); overshoot = Math.max(overshoot, a.y - 2); }
    expect(a.hasRoute).toBe(false);
    expect(Math.hypot(a.x - 3, a.y - 2)).toBeLessThan(0.05);
    expect(overshoot).toBeLessThan(0.03);
  });
});

describe('task module (idempotent commands)', () => {
  it('ignores repeated actionIds and stale epochs', () => {
    const m = createModule('cut-1', 'PLASMA_CUTTER'), c = new ActionCounter();
    const arm = c.issue(0, 'ARM');
    expect(applyModuleCommand(m, arm)).toBe('applied');
    expect(applyModuleCommand(m, arm)).toBe('duplicate');
    expect(applyModuleCommand(m, c.issue(0, 'START'))).toBe('applied');
    expect(m.state).toBe('ACTIVE');
    expect(applyModuleCommand(m, { actionId: 1, epoch: 1, action: 'COMPLETE' })).toBe('applied');
    expect(m.completionConfirmation).toBe(true);
    expect(applyModuleCommand(m, c.issue(0, 'START'))).toBe('stale-epoch');
    expect(m.applied).toBe(3);
  });
});

describe('allocation (equation 5)', () => {
  it('J_ij = t̂ + w_q q + w_e r + w_u u and the cheapest compatible robot wins', () => {
    const terms = { 1: { t: 20, q: 0, r: 0, u: 0.5 }, 2: { t: 12, q: 1, r: batteryRisk(0.3), u: 0 }, 3: { t: 30, q: 0, r: 0, u: 0 } } as const;
    const res = runAuction([{ id: 7, capability: 'REPAIR', priority: 1 }], [1, 2, 3].map(id => ({ id, capability: 'REPAIR' })), id => terms[id as 1 | 2 | 3]);
    const costs = res.bids.map(b => b.cost);
    expect(costs[0]).toBeCloseTo(20 + DEFAULT_WEIGHTS.wu * 0.5, 9);
    expect(res.awards[0].agentId).toBe(costs.indexOf(Math.min(...costs)) + 1);
    expect(jCost(terms[2])).toBeCloseTo(12 + DEFAULT_WEIGHTS.wq + DEFAULT_WEIGHTS.we * batteryRisk(0.3), 9);
  });

  it('awards high priority first, one task per robot, and skips incompatible capabilities', () => {
    const res = runAuction(
      [{ id: 1, capability: 'A', priority: 0 }, { id: 2, capability: 'A', priority: 2 }, { id: 3, capability: 'B', priority: 5 }],
      [{ id: 10, capability: 'A' }, { id: 11, capability: 'A' }],
      (a, t) => ({ t: a === 10 ? t : 10 - t, q: 0, r: 0, u: 0 }),
    );
    expect(res.awards.map(a => a.taskId)).toEqual([2, 1]);
    expect(new Set(res.awards.map(a => a.agentId)).size).toBe(2);
  });

  it('battery risk is 0 above 60 % and 1 at the 25 % hot-swap threshold', () => {
    expect(batteryRisk(0.8)).toBe(0);
    expect(batteryRisk(0.25)).toBeCloseTo(1, 9);
  });
});

describe('coordination', () => {
  it('mutex leases expire by TTL and are revoked by a newer epoch', () => {
    const m = new ResourceMutex(2);
    expect(m.acquire('X', 1, 0, 0)).toBe(true);
    expect(m.acquire('X', 2, 0, 1)).toBe(false);
    expect(m.acquire('X', 2, 0, 2.5)).toBe(true);
    m.revokeBefore(1);
    expect(m.holder('X', 2.6)).toBeNull();
  });

  it('M0 group consensus conserves Σx and reaches D(k) ≤ 0.01 under 30 % loss', () => {
    const x = Float64Array.from([0.42, 0.57, 0.5]), d = new Float64Array(3), rng = new Rng(3), sum = 1.49;
    let k = 0;
    while (m0Spread(x, 3) > M0_THRESHOLD && k < 500) { m0GroupStep(x, d, 3, m0SafeEps(3), () => rng.bernoulli(0.3)); k++; }
    expect(m0Spread(x, 3)).toBeLessThanOrEqual(M0_THRESHOLD);
    expect(x.reduce((s, v) => s + v, 0)).toBeCloseTo(sum, 12);
  });
});

describe('S1 route network with local learning (equation 6)', () => {
  function square(): { g: S1Graph; agents: SwarmAgent[]; net: RouteNetwork } {
    const g = new S1Graph();
    g.addNode(0, 0, 0); g.addNode(1, 10, 0); g.addNode(2, 10, 10); g.addNode(3, 0, 10);
    g.addEdge(0, 1); g.addEdge(1, 2); g.addEdge(2, 3); g.addEdge(3, 0);
    const agents = [1, 2].map(id => new SwarmAgent({ id, name: `R${id}`, team: 't', module: createModule('m', 'ROLLER_CARRIER'), x: 0, y: 0, vmax: 1 }));
    return { g, agents, net: new RouteNetwork(g, new Rng(1), agents) };
  }

  it('t̂ ← (1 − α) t̂ + α t with α = 0.25, shared with peers over the radio', () => {
    const { g, agents, net } = square();
    net.observe(agents[0], 0, 18, 0);
    expect(net.learners.get(1)!.estimates.get(0)).toBeCloseTo(0.75 * 10 + 0.25 * 18, 9);
    expect(net.learners.get(2)!.estimates.get(0)).toBeCloseTo(0.75 * 10 + 0.25 * 18, 9);
    expect(net.estimate(agents[0], g.edge(0))).toBeCloseTo(12, 9);
  });

  it('a closed edge replans every robot whose route crosses it; the new route avoids it', () => {
    const { agents, net } = square();
    expect(net.plan(agents[0], 10, 10, Number.NaN, 2)).toBe(true);
    expect(agents[0].wpEdge).toContain(0);
    const replanned = net.closeEdge(0, 'BLOCKED', 0);
    expect(replanned).toEqual([1]);
    expect(agents[0].wpEdge).not.toContain(0);
    expect(net.replans).toBe(1);
  });

  it('learned slow edges divert the route', () => {
    const { g, agents, net } = square();
    for (let i = 0; i < 6; i++) net.observe(agents[0], 0, 60, 0);
    net.plan(agents[0], 10, 0, Number.NaN, 1);
    expect(agents[0].wpEdge).not.toContain(0);
    expect(g.edges.length).toBe(4);
  });
});
