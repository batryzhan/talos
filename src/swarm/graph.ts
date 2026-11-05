/**
 * Communication graph G = (V, E) (CLAUDE.md §4.2, formulas 3–8).
 * Vertices are indices 0..N−1 (agent id = index + 1). Edges are UNIQUE undirected pairs (i < j):
 * for a ring with N = 2 there is exactly one edge (0,1), never two arcs.
 */
import type { TopologyKind } from '../contracts/types';
import type { Rng } from './rng';

export type Edge = readonly [number, number];

/** Unique undirected edges of a topology. */
export function buildEdges(n: number, topology: TopologyKind): Edge[] {
  const set = new Map<string, Edge>();
  const add = (i: number, j: number) => {
    if (i === j) return;
    const a = Math.min(i, j), b = Math.max(i, j);
    set.set(`${a}-${b}`, [a, b]);
  };
  if (topology === 'complete') {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) add(i, j);
  } else if (topology === 'line') {
    for (let i = 0; i + 1 < n; i++) add(i, i + 1);
  } else {
    for (let i = 0; i < n; i++) add(i, (i + 1) % n); // N = 2 → (0,1) once (deduplicated)
  }
  return [...set.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

/**
 * Symmetric loss model M0: every unique edge is dropped independently with probability p,
 * a_ij(k) = a_ji(k). Draws exactly one random number per edge per step, in edge order.
 */
export function sampleActiveEdges(edges: readonly Edge[], p: number, rng: Rng): Edge[] {
  const out: Edge[] = [];
  for (const e of edges) if (!rng.bernoulli(p)) out.push(e);
  return out;
}

export function adjacency(n: number, edges: readonly Edge[]): number[][] {
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const [i, j] of edges) { A[i][j] = 1; A[j][i] = 1; }
  return A;
}

export function degrees(n: number, edges: readonly Edge[]): number[] {
  const d = new Array<number>(n).fill(0);
  for (const [i, j] of edges) { d[i]++; d[j]++; }
  return d;
}

/** L = D − A. */
export function laplacian(n: number, edges: readonly Edge[]): number[][] {
  const L = adjacency(n, edges).map(r => r.map(v => -v));
  degrees(n, edges).forEach((d, i) => { L[i][i] = d; });
  return L;
}

/** Neighbour lists N_i. */
export function neighbors(n: number, edges: readonly Edge[]): number[][] {
  const N = Array.from({ length: n }, () => [] as number[]);
  for (const [i, j] of edges) { N[i].push(j); N[j].push(i); }
  return N;
}

/** Largest degree of the full (loss-free) topology; ε must satisfy 0 < ε < 1/d_max. */
export function maxDegree(n: number, edges: readonly Edge[]): number {
  return Math.max(0, ...degrees(n, edges));
}
