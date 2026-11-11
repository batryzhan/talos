import { describe, expect, it } from 'vitest';
import { assertRingEps, m0RingSettle, m0RingStep, meanOf, ringEdgeCount, spreadOf } from '../src/core/consensus/m0Ring';
import { consensusStep, runM0 } from '../src/swarm/consensus';
import { buildEdges } from '../src/swarm/graph';
import { Rng } from '../src/swarm/rng';

const EPS = 0.2;
const THRESHOLD = 0.01;

describe('M0 ring consensus (in-place)', () => {
  it('ring has n unique edges, one for n = 2', () => {
    expect(ringEdgeCount(1)).toBe(0);
    expect(ringEdgeCount(2)).toBe(1);
    expect(ringEdgeCount(8)).toBe(8);
    for (const n of [2, 3, 8]) expect(ringEdgeCount(n)).toBe(buildEdges(n, 'ring').length);
  });

  it('matches the reference consensusStep on the ring', () => {
    for (const n of [2, 3, 5, 8, 16]) {
      const rng = new Rng(n);
      let ref = Array.from({ length: n }, () => rng.random());
      const x = Float64Array.from(ref), delta = new Float64Array(n);
      const edges = buildEdges(n, 'ring');
      for (let k = 0; k < 50; k++) {
        ref = consensusStep(ref, edges, EPS);
        m0RingStep(x, delta, n, EPS);
      }
      for (let i = 0; i < n; i++) expect(x[i]).toBeCloseTo(ref[i], 12);
    }
  });

  it('is deterministic and conserves the mean', () => {
    const run = (): Float64Array => {
      const rng = new Rng(11), x = Float64Array.from({ length: 8 }, () => rng.random()), delta = new Float64Array(8);
      for (let k = 0; k < 100; k++) m0RingStep(x, delta, 8, EPS);
      return x;
    };
    const a = run(), b = run();
    expect(Array.from(a)).toEqual(Array.from(b));
    const rng = new Rng(11), x0 = Float64Array.from({ length: 8 }, () => rng.random());
    expect(meanOf(a, 8)).toBeCloseTo(meanOf(x0, 8), 14);
  });

  it('converges to D(k) ≤ 0.01 with ε = 0.20 and agrees with runM0 on K', () => {
    for (const n of [4, 8, 16]) {
      const rng = new Rng(5), x0 = Array.from({ length: n }, () => rng.random());
      const x = Float64Array.from(x0), delta = new Float64Array(n);
      const k = m0RingSettle(x, delta, n, EPS, THRESHOLD, 5000);
      expect(k).toBeGreaterThan(0);
      expect(spreadOf(x, n)).toBeLessThanOrEqual(THRESHOLD);
      const ref = runM0({ n, p: 0, eps: EPS, steps: 5000, seed: 1, x0 });
      expect(k).toBe(ref.kConverged);
    }
  });

  it('D(k) is monotone under symmetric link loss p ∈ {0, 0.1, 0.3}', () => {
    for (const p of [0, 0.1, 0.3]) {
      const n = 8, rng = new Rng(9), x = Float64Array.from({ length: n }, () => rng.random());
      const delta = new Float64Array(n), mask = new Uint8Array(n), mean0 = meanOf(x, n);
      let prev = spreadOf(x, n);
      for (let k = 0; k < 400; k++) {
        for (let e = 0; e < n; e++) mask[e] = rng.bernoulli(p) ? 0 : 1;
        m0RingStep(x, delta, n, EPS, mask);
        const D = spreadOf(x, n);
        expect(D).toBeLessThanOrEqual(prev + 1e-15);
        prev = D;
      }
      expect(prev).toBeLessThanOrEqual(THRESHOLD);
      expect(meanOf(x, n)).toBeCloseTo(mean0, 13);
    }
  });

  it('enforces 0 < ε < 1/d_max and reports an exhausted horizon', () => {
    expect(() => assertRingEps(8, 0.5)).toThrow(RangeError);
    expect(() => assertRingEps(8, 0)).toThrow(RangeError);
    expect(() => assertRingEps(2, 0.6)).not.toThrow();
    const x = Float64Array.from([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(m0RingSettle(x, new Float64Array(8), 8, EPS, 1e-9, 2)).toBe(-1);
  });
});
