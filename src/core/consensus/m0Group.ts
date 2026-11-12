/**
 * Allocation-free M0 consensus on a small fully connected work group (equation 3) with symmetric
 * per-link packet loss:
 *
 *   x_i(k+1) = x_i(k) + ε Σ_{j∈N_i(k)} (x_j(k) − x_i(k)),   D(k) = max x − min x ≤ 0.01 (equation 4).
 *
 * Synchronous: increments are computed from x(k) only, so Σx is conserved exactly on every step.
 * Buffers are caller-owned; `dropLink(i, j)` decides per step whether the link is lost.
 */
export const M0_THRESHOLD = 0.01;

export function m0GroupStep(x: Float64Array, delta: Float64Array, n: number, eps: number, dropLink?: (i: number, j: number) => boolean): void {
  for (let i = 0; i < n; i++) delta[i] = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dropLink && dropLink(i, j)) continue;
      const d = eps * (x[j] - x[i]);
      delta[i] += d;
      delta[j] -= d;
    }
  }
  for (let i = 0; i < n; i++) x[i] += delta[i];
}

export function m0Spread(x: Float64Array, n: number): number {
  if (n <= 0) return 0;
  let lo = x[0], hi = x[0];
  for (let i = 1; i < n; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; }
  return hi - lo;
}

/** Stable step for the complete graph on n nodes: 0 < ε < 1 / (n − 1). */
export function m0SafeEps(n: number): number {
  return n > 1 ? 0.8 / (n - 1) : 0;
}
