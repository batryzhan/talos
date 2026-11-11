/**
 * Allocation-free M0 consensus on a ring (CLAUDE.md §5.2):
 *   x_i(k+1) = x_i(k) + ε Σ_{j∈N_i(k)} (x_j(k) − x_i(k))
 *
 * Same synchronous semantics as src/swarm/consensus.ts `consensusStep`, but on caller-owned
 * Float64Array buffers so it can run inside the radio tick. Ring edge e joins nodes e and (e+1) mod n.
 */

/** Unique undirected ring edges: n for n > 2, one for n = 2, none below. */
export function ringEdgeCount(n: number): number {
  return n > 2 ? n : n === 2 ? 1 : 0;
}

/** Stability bound 0 < ε < 1/d_max for the loss-free ring. */
export function assertRingEps(n: number, eps: number): void {
  const dMax = n > 2 ? 2 : 1;
  if (!(eps > 0 && eps < 1 / dMax)) throw new RangeError(`ε=${eps} violates 0 < ε < 1/d_max = ${1 / dMax}`);
}

/**
 * One synchronous step, in place. `delta` is scratch of length ≥ n. `linkUp[e] === 0` drops edge e
 * for this step (symmetric loss); omit it for a loss-free step. Σx is conserved exactly per edge.
 */
export function m0RingStep(x: Float64Array, delta: Float64Array, n: number, eps: number, linkUp?: Uint8Array): void {
  const edges = ringEdgeCount(n);
  for (let i = 0; i < n; i++) delta[i] = 0;
  for (let e = 0; e < edges; e++) {
    if (linkUp !== undefined && linkUp[e] === 0) continue;
    const j = e + 1 === n ? 0 : e + 1;
    const d = eps * (x[j] - x[e]); // from x(k) only
    delta[e] += d;
    delta[j] -= d;
  }
  for (let i = 0; i < n; i++) x[i] += delta[i];
}

/** D = max x − min x over the first n entries. */
export function spreadOf(x: Float64Array, n: number): number {
  if (n === 0) return 0;
  let lo = x[0], hi = x[0];
  for (let i = 1; i < n; i++) {
    const v = x[i];
    if (v < lo) lo = v; else if (v > hi) hi = v;
  }
  return hi - lo;
}

export function meanOf(x: Float64Array, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  return n > 0 ? s / n : 0;
}

/**
 * Iterate loss-free steps until D ≤ threshold. Returns the number of steps taken, or −1 if the
 * horizon ran out first (x then holds the state after `maxSteps`).
 */
export function m0RingSettle(
  x: Float64Array, delta: Float64Array, n: number, eps: number, threshold: number, maxSteps: number,
): number {
  assertRingEps(n, eps);
  for (let k = 0; k <= maxSteps; k++) {
    if (spreadOf(x, n) <= threshold) return k;
    if (k < maxSteps) m0RingStep(x, delta, n, eps);
  }
  return -1;
}
