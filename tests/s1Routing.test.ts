import { describe, expect, it } from 'vitest';
import { S1Graph } from '../src/core/routing/s1Graph';
import { Rng } from '../src/swarm/rng';

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

describe('travel-time costs', () => {
  it('a learned cost function overrides geometric length; A* stays exact with a lower bound', () => {
    const g = new S1Graph();
    g.addNode(0, 0, 0); g.addNode(1, 4, 0); g.addNode(2, 2, 3);
    const short = g.addEdge(0, 1); g.addEdge(0, 2); g.addEdge(2, 1);
    const slow = (e: { id: number; length: number }): number => (e.id === short ? 60 : e.length / 1.5);
    const d = g.shortestPath(0, 1, { cost: slow });
    const a = g.shortestPath(0, 1, { cost: slow, algorithm: 'astar', heuristicPerMeter: 1 / 1.5 });
    expect(d).toMatchObject({ status: 'FOUND', nodes: [0, 2, 1] });
    expect(a.cost).toBeCloseTo(d.cost, 9);
    expect(g.shortestPath(0, 1)).toMatchObject({ nodes: [0, 1], cost: 4 });
  });
});
