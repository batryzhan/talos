/**
 * Scalar consensus model M0 (CLAUDE.md §4.2):
 *   x_i(k+1) = x_i(k) + ε Σ_{j∈N_i(k)} (x_j(k) − x_i(k)),   x(k+1) = (I − ε L(k)) x(k)
 *
 * SYNCHRONOUS update: all increments are computed from the old vector x(k), then x is replaced as a
 * whole. In-place updates are forbidden (they break Σx_i conservation and D(k) monotonicity).
 */
import type { ConsensusSample, TopologyKind } from '../contracts/types';
import { buildEdges, maxDegree, sampleActiveEdges, type Edge } from './graph';
import { Rng } from './rng';

/** One synchronous M0 step over the active edge set. Returns a NEW array. */
export function consensusStep(x: readonly number[], activeEdges: readonly Edge[], eps: number): number[] {
  const delta = new Array<number>(x.length).fill(0);
  for (const [i, j] of activeEdges) {
    const d = x[j] - x[i];          // from x(k) only
    delta[i] += eps * d;
    delta[j] -= eps * d;            // exact antisymmetry ⇒ Σ Δ = 0
  }
  return x.map((v, i) => v + delta[i]);
}

/** Spread D = max x − min x. */
export function spread(x: readonly number[]): number {
  let lo = Infinity, hi = -Infinity;
  for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi - lo;
}

export function mean(x: readonly number[]): number {
  let s = 0;
  for (const v of x) s += v;
  return s / x.length;
}

export interface M0RunParams {
  n: number;
  p: number;
  eps: number;
  /** Horizon K (steps). */
  steps: number;
  seed: number;
  topology?: TopologyKind;
  /** Initial state; default: x_i(0) ~ U(0, 1) from the same seeded stream. */
  x0?: number[];
  /** Convergence threshold on D(k). */
  threshold?: number;
}

export interface M0RunResult {
  samples: ConsensusSample[];
  /** First k with D(k) ≤ threshold, or null if not reached within the horizon. */
  kConverged: number | null;
  x: number[];
  edges: Edge[];
}

/** Run M0 with a fixed seed. The loss draws come from the same stream after x0. */
export function runM0(params: M0RunParams): M0RunResult {
  const { n, p, eps, steps, seed } = params;
  const topology = params.topology ?? 'ring';
  const threshold = params.threshold ?? 0.01;
  const edges = buildEdges(n, topology);
  const dmax = maxDegree(n, edges);
  if (!(eps > 0 && eps < 1 / dmax)) throw new RangeError(`ε=${eps} violates 0 < ε < 1/d_max = ${1 / dmax}`);

  const rng = new Rng(seed);
  let x = params.x0 ? [...params.x0] : Array.from({ length: n }, () => rng.random());
  const samples: ConsensusSample[] = [{ k: 0, D: spread(x), mean: mean(x) }];
  let kConverged: number | null = samples[0].D <= threshold ? 0 : null;
  for (let k = 1; k <= steps; k++) {
    x = consensusStep(x, sampleActiveEdges(edges, p, rng), eps);
    const D = spread(x);
    samples.push({ k, D, mean: mean(x) });
    if (kConverged === null && D <= threshold) kConverged = k;
  }
  return { samples, kConverged, x, edges };
}
