import { describe, expect, it } from 'vitest';
import {
  LEARNING_RUNS, S1_ALPHA, S1_MAPS, S1_SCENARIOS, buildS1Map, gainHistogram, runS1Experiment, runS1Scenario, runS1Series,
} from '../src/core/routing/s1Experiment';

describe('experiment S1 — 150 edge-closure scenarios with learned t̂_e', () => {
  const summary = runS1Experiment();

  it('runs 150 scenarios, 50 on each of the three maps', () => {
    expect(S1_SCENARIOS).toBe(150);
    expect(summary.total).toBe(150);
    expect(summary.maps.map(m => [m.map, m.cases])).toEqual(S1_MAPS.map(m => [m, 50]));
    expect(S1_ALPHA).toBe(0.25);
  });

  it('is deterministic: the scenario seed is its index', () => {
    expect(runS1Scenario(17)).toEqual(runS1Scenario(17));
    expect(runS1Experiment(150).meanGain).toBe(summary.meanGain);
  });

  it('replanning recovers far more routes than keeping the original one', () => {
    expect(summary.originalPassable).toBeLessThan(summary.total);
    expect(summary.reachable).toBeGreaterThan(summary.originalPassable);
    expect(summary.reachable / summary.total).toBeGreaterThan(0.9);
    // Only a closed bridge edge makes the goal unreachable: some exist on the inspection map.
    const lost = summary.scenarios.filter(s => !s.reachable);
    expect(lost.every(s => s.onRoute)).toBe(true);
  });

  it('a passable original route means the closed edge was not on it', () => {
    for (const s of summary.scenarios) expect(s.originalPassable).toBe(!s.onRoute);
  });

  it('learning (equation 6) shrinks the estimate error monotonically on average', () => {
    const c = summary.learningCurve;
    expect(c).toHaveLength(LEARNING_RUNS + 1);
    expect(c[LEARNING_RUNS]).toBeLessThan(c[0] * 0.5);
    for (let m = 1; m < c.length; m++) expect(c[m]).toBeLessThanOrEqual(c[m - 1] + 1e-9);
  });

  it('the adaptive router is faster than the geometric baseline on average', () => {
    expect(summary.meanLearned).toBeLessThan(summary.meanStatic);
    expect(summary.meanGain).toBeGreaterThan(0);
    expect(summary.faster).toBeGreaterThan(summary.slower);
    expect(summary.faster + summary.equal + summary.slower).toBe(summary.reachable);
  });

  it('the histogram counts every scenario whose learned route differs, once', () => {
    const bins = gainHistogram(summary.scenarios);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(summary.faster + summary.slower);
  });

  it('maps are connected before any closure', () => {
    for (const m of S1_MAPS) {
      const g = buildS1Map(m), first = g.nodes[0].id;
      const d = g.distancesFrom(first);
      expect(Array.from(d).every(Number.isFinite)).toBe(true);
    }
  });

  it('the async series reports progress in chunks and yields the same result', async () => {
    const seen: number[] = [];
    const s = await runS1Series(done => seen.push(done), undefined, 50);
    expect(seen).toEqual([0, 50, 100, 150]);
    expect(s.meanGain).toBe(summary.meanGain);
  });
});
