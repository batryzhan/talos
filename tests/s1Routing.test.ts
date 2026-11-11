import { describe, expect, it } from 'vitest';
import { S1Graph } from '../src/core/routing/s1Graph';
import { BRIDGE_MAX_LOAD_KG, BridgeDeployment, planBridge } from '../src/core/metamorphic/bridgeInfrastructure';
import { DOCK_PITCH } from '../src/core/kinematics/compositeSolver';
import { Rng } from '../src/swarm/rng';

/**
 *   0 ── 1 ══ 2 ── 3        ══ chasm (2 chassis long), ✕ blocked by debris
 *        │    │
 *        4 ✕✕ 5
 */
function yard(): { g: S1Graph; chasm: number; blocked: number } {
  const g = new S1Graph(), gap = 2 * DOCK_PITCH.x;
  g.addNode(0, -3, 0); g.addNode(1, 0, 0); g.addNode(2, gap, 0); g.addNode(3, gap + 3, 0);
  g.addNode(4, 0, 3); g.addNode(5, gap, 3);
  g.addEdge(0, 1);
  const chasm = g.addEdge(1, 2, { status: 'CLOSED', reason: 'CHASM' });
  g.addEdge(2, 3);
  g.addEdge(1, 4);
  const blocked = g.addEdge(4, 5, { status: 'CLOSED', reason: 'BLOCKED' });
  g.addEdge(5, 2);
  return { g, chasm, blocked };
}

describe('S1 graph search', () => {
  it('Dijkstra and A* agree on cost and path on a random planar graph', () => {
    const g = new S1Graph(), rng = new Rng(21), n = 40;
    for (let i = 0; i < n; i++) g.addNode(i, rng.uniform(0, 20), rng.uniform(0, 20));
    for (let i = 0; i < n; i++) {
      g.addEdge(i, (i + 1) % n);
      const j = Math.floor(rng.uniform(0, n));
      if (j !== i && !g.findEdge(i, j)) g.addEdge(i, j);
    }
    for (let q = 0; q < 30; q++) {
      const a = Math.floor(rng.uniform(0, n)), b = Math.floor(rng.uniform(0, n));
      const d = g.shortestPath(a, b), s = g.shortestPath(a, b, { algorithm: 'astar' });
      expect(d.status).toBe('FOUND');
      expect(s.cost).toBeCloseTo(d.cost, 9);
      expect(g.distance(a, b)).toBeCloseTo(d.cost, 9);
      if (d.status === 'FOUND') {
        // the path is a real walk whose edge lengths add up to the cost
        expect(d.nodes[0]).toBe(a);
        expect(d.nodes[d.nodes.length - 1]).toBe(b);
        expect(d.edges.length).toBe(d.nodes.length - 1);
        expect(d.edges.reduce((sum, id) => sum + g.edge(id).length, 0)).toBeCloseTo(d.cost, 9);
      }
    }
  });

  it('is bidirectional and picks the shorter of two routes', () => {
    const g = new S1Graph();
    g.addNode(0, 0, 0); g.addNode(1, 4, 0); g.addNode(2, 2, 3); g.addNode(3, 2, 0.5);
    g.addEdge(0, 2); g.addEdge(2, 1); g.addEdge(0, 3); g.addEdge(3, 1);
    const there = g.shortestPath(0, 1), back = g.shortestPath(1, 0);
    expect(there).toMatchObject({ status: 'FOUND', nodes: [0, 3, 1] });
    expect(back).toMatchObject({ status: 'FOUND', nodes: [1, 3, 0] });
    expect(back.cost).toBeCloseTo(there.cost, 12);
    expect(g.shortestPath(2, 2)).toEqual({ status: 'FOUND', cost: 0, nodes: [2], edges: [] });
  });

  it('rejects malformed graphs', () => {
    const g = new S1Graph();
    g.addNode(0, 0, 0); g.addNode(1, 3, 4);
    expect(() => g.addNode(0, 1, 1)).toThrow(RangeError);
    expect(() => g.addEdge(0, 0)).toThrow(RangeError);
    expect(() => g.addEdge(0, 7)).toThrow(RangeError);
    expect(() => g.addEdge(0, 1, { status: 'OPEN' }, 4.9)).toThrow(RangeError); // shorter than the 5 m straight line
    expect(g.edge(g.addEdge(0, 1, { status: 'OPEN' }, 6)).length).toBe(6);
  });
});

describe('dynamic edge closures', () => {
  it('reroutes around a closed edge and reports d = ∞ when cut off', () => {
    const g = new S1Graph();
    g.addNode(0, 0, 0); g.addNode(1, 2, 0); g.addNode(2, 4, 0); g.addNode(3, 2, 2);
    const direct = g.addEdge(0, 1); g.addEdge(1, 2);
    const detourA = g.addEdge(0, 3); g.addEdge(3, 2);
    expect(g.shortestPath(0, 2)).toMatchObject({ nodes: [0, 1, 2], cost: 4 });

    const v0 = g.version;
    g.closeEdge(direct);
    expect(g.version).toBeGreaterThan(v0);
    expect(g.edge(direct).state).toEqual({ status: 'CLOSED', reason: 'DYNAMIC_CUT' });
    expect(g.shortestPath(0, 2, { algorithm: 'astar' })).toMatchObject({ nodes: [0, 3, 2] });

    g.closeEdge(detourA);
    expect(g.shortestPath(0, 2)).toEqual({ status: 'UNREACHABLE', cost: Infinity });
    expect(g.shortestPath(0, 2, { algorithm: 'astar' })).toEqual({ status: 'UNREACHABLE', cost: Infinity });
    expect(g.distance(0, 2)).toBe(Infinity);

    g.openEdge(direct);
    expect(g.shortestPath(0, 2)).toMatchObject({ nodes: [0, 1, 2], cost: 4 });
  });
});

describe('deployable bridge', () => {
  it('no bridge is planned while a route exists', () => {
    const { g, blocked } = yard();
    g.openEdge(blocked);
    expect(planBridge(g, 0, 3, [5, 6])).toEqual({ status: 'NOT_NEEDED' });
  });

  it('plans the chasm, not the debris, and sizes the squad from the gap', () => {
    const { g, chasm } = yard();
    expect(g.distance(0, 3)).toBe(Infinity);
    const plan = planBridge(g, 0, 3, [5, 6, 7]);
    expect(plan).toMatchObject({ status: 'PLANNED', edgeId: chasm, agentIds: [5, 6] });
    if (plan.status !== 'PLANNED') throw new Error('unreachable');
    expect(plan.gapLength).toBeCloseTo(2 * DOCK_PITCH.x, 12);
    // slots sit at 1/4 and 3/4 of the gap, heading along it
    expect(plan.slots.map(s => s.x)).toEqual([expect.closeTo(DOCK_PITCH.x / 2, 12), expect.closeTo(1.5 * DOCK_PITCH.x, 12)]);
    expect(plan.slots.every(s => s.y === 0 && s.theta === 0)).toBe(true);
  });

  it('reports too few agents and graphs with nothing to span', () => {
    const { g, chasm } = yard();
    expect(planBridge(g, 0, 3, [5])).toEqual({ status: 'INSUFFICIENT_AGENTS', edgeId: chasm, required: 2, available: 1 });
    g.closeEdge(chasm, 'BLOCKED');
    expect(planBridge(g, 0, 3, [5, 6])).toEqual({ status: 'NO_SPAN' });
  });

  it('injects a PASSABLE_STRUCTURE edge only once the squad is settled, and recovers the path', () => {
    const { g, chasm } = yard();
    const plan = planBridge(g, 0, 3, [5, 6]);
    if (plan.status !== 'PLANNED') throw new Error('expected a plan');
    const bridge = new BridgeDeployment(g, plan);
    expect(bridge.tryEngage()).toBe(false); // not begun
    expect(bridge.begin()).toBe(true);
    expect(bridge.begin()).toBe(false);

    bridge.reportSlot(0, 0.002, 0.001, 0);
    bridge.reportSlot(1, 0.02, 0, 0);      // still 20 mm out
    expect(bridge.tryEngage()).toBe(false);
    bridge.reportSlot(1, 0.002, 0, 0.05);  // in place but still moving
    expect(bridge.tryEngage()).toBe(false);
    expect(g.shortestPath(0, 3).status).toBe('UNREACHABLE');

    bridge.reportSlot(1, 0.002, 0, 0);
    expect(bridge.tryEngage()).toBe(true);
    expect(bridge.status).toBe('HOLDING');
    expect(bridge.brakesEngaged).toBe(true);
    expect(g.edge(chasm).state).toEqual({ status: 'PASSABLE_STRUCTURE', traversable: true, maxLoadKg: 40, agentIds: [5, 6] });
    expect(BRIDGE_MAX_LOAD_KG).toBe(40);

    for (const algorithm of ['dijkstra', 'astar'] as const) {
      const route = g.shortestPath(0, 3, { algorithm });
      expect(route).toMatchObject({ status: 'FOUND', nodes: [0, 1, 2, 3], edges: expect.arrayContaining([chasm]) });
      expect(route.cost).toBeCloseTo(6 + 2 * DOCK_PITCH.x, 12);
    }
  });

  it('enforces the bridge load rating', () => {
    const { g } = yard();
    const plan = planBridge(g, 0, 3, [5, 6]);
    if (plan.status !== 'PLANNED') throw new Error('expected a plan');
    const bridge = new BridgeDeployment(g, plan);
    bridge.begin();
    bridge.reportSlot(0, 0, 0, 0); bridge.reportSlot(1, 0, 0, 0);
    bridge.tryEngage();
    expect(g.shortestPath(0, 3, { payloadKg: 40 }).status).toBe('FOUND');
    expect(g.shortestPath(0, 3, { payloadKg: 40.5 }).status).toBe('UNREACHABLE');
    expect(g.shortestPath(0, 3, { payloadKg: 60, algorithm: 'astar' }).status).toBe('UNREACHABLE');
  });

  it('release closes the edge as a chasm again', () => {
    const { g, chasm } = yard();
    const plan = planBridge(g, 0, 3, [5, 6]);
    if (plan.status !== 'PLANNED') throw new Error('expected a plan');
    const bridge = new BridgeDeployment(g, plan);
    bridge.begin();
    bridge.reportSlot(0, 0, 0, 0); bridge.reportSlot(1, 0, 0, 0);
    bridge.tryEngage();
    expect(bridge.release()).toBe(true);
    expect(bridge.status).toBe('RELEASED');
    expect(bridge.brakesEngaged).toBe(false);
    expect(g.edge(chasm).state).toEqual({ status: 'CLOSED', reason: 'CHASM' });
    expect(g.distance(0, 3)).toBe(Infinity);
    expect(bridge.release()).toBe(false);
  });
});
