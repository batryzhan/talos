import { describe, expect, it } from 'vitest';
import { consensusStep, mean, runM0, spread } from '../src/swarm/consensus';
import { buildEdges, laplacian, maxDegree, sampleActiveEdges } from '../src/swarm/graph';
import { Rng } from '../src/swarm/rng';

describe('graph', () => {
  it('ring with N=2 has exactly one unique edge', () => {
    expect(buildEdges(2, 'ring')).toEqual([[0, 1]]);
    expect(maxDegree(2, buildEdges(2, 'ring'))).toBe(1);
  });

  it('ring N=4/8 has N edges, d_max = 2, Laplacian rows sum to 0', () => {
    for (const n of [4, 8]) {
      const e = buildEdges(n, 'ring');
      expect(e).toHaveLength(n);
      expect(maxDegree(n, e)).toBe(2);
      for (const row of laplacian(n, e)) expect(row.reduce((s, v) => s + v, 0)).toBe(0);
    }
  });

  it('loss sampling is deterministic per seed and edge-level', () => {
    const e = buildEdges(8, 'ring');
    expect(sampleActiveEdges(e, 0.3, new Rng(7))).toEqual(sampleActiveEdges(e, 0.3, new Rng(7)));
    expect(sampleActiveEdges(e, 0, new Rng(1))).toHaveLength(8);
    expect(sampleActiveEdges(e, 1, new Rng(1))).toHaveLength(0);
  });
});

describe('M0 consensus invariants (§4.2)', () => {
  const grid = [2, 4, 8].flatMap(n => [0, 0.1, 0.3].flatMap(p => [0.05, 0.1, 0.2, 0.4].map(eps => ({ n, p, eps }))));

  it.each(grid)('mean preserved and D(k) non-increasing: N=$n p=$p ε=$eps', ({ n, p, eps }) => {
    for (let seed = 0; seed < 20; seed++) {
      const r = runM0({ n, p, eps, steps: 100, seed });
      const m0 = r.samples[0].mean;
      for (let k = 1; k < r.samples.length; k++) {
        expect(Math.abs(r.samples[k].mean - m0)).toBeLessThan(1e-14);
        expect(r.samples[k].D).toBeLessThanOrEqual(r.samples[k - 1].D + 1e-15);
      }
    }
  });

  it('N=2, p=0: D(k) = (1 − 2ε)^k · D(0) exactly', () => {
    for (const eps of [0.05, 0.1, 0.2, 0.4]) {
      const r = runM0({ n: 2, p: 0, eps, steps: 60, seed: 3, x0: [0, 1] });
      for (const s of r.samples) expect(s.D).toBeCloseTo(Math.pow(1 - 2 * eps, s.k), 13);
    }
  });

  it('synchronous update conserves Σx; a naive in-place loop does not', () => {
    const x = [0, 1, 0.3, 0.9];
    const sum = (v: number[]) => v.reduce((s, a) => s + a, 0);
    const sync = consensusStep(x, buildEdges(4, 'ring'), 0.2);
    expect(Math.abs(sum(sync) - sum(x))).toBeLessThan(1e-15);
    const inPlace = [...x];
    for (let i = 0; i < 4; i++) {
      const nb = [(i + 3) % 4, (i + 1) % 4];
      inPlace[i] += 0.2 * nb.reduce((s, j) => s + (inPlace[j] - inPlace[i]), 0);
    }
    expect(Math.abs(sum(inPlace) - sum(x))).toBeGreaterThan(1e-6);
  });

  it('rejects ε outside (0, 1/d_max)', () => {
    expect(() => runM0({ n: 4, p: 0, eps: 0.5, steps: 1, seed: 0 })).toThrow(RangeError);
    expect(() => runM0({ n: 2, p: 0, eps: 1, steps: 1, seed: 0 })).toThrow(RangeError);
  });

  it('same seed ⇒ identical run; convergence is detected', () => {
    const a = runM0({ n: 8, p: 0.3, eps: 0.2, steps: 100, seed: 42 });
    const b = runM0({ n: 8, p: 0.3, eps: 0.2, steps: 100, seed: 42 });
    expect(a.samples).toEqual(b.samples);
    expect(spread(a.x)).toBeLessThan(a.samples[0].D);
    expect(mean(a.x)).toBeCloseTo(a.samples[0].mean, 14);
    expect(runM0({ n: 4, p: 0, eps: 0.2, steps: 100, seed: 1 }).kConverged).not.toBeNull();
  });
});
