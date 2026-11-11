/**
 * Structural validation of a cluster before the latches are locked (CLAUDE.md §3.1, item 3).
 * A cluster may lock only if every member has the same heading, the latch adjacency graph is
 * connected, and the 4N wheel constraints determine the macro twist.
 */
import { CompositeSolver, DOCK_PITCH } from '../kinematics/compositeSolver';
import type { StructureValidation } from '../../types/orchestrator';
import { DOCK_TOLERANCE } from './docking';

/** Slack on the latch pitch when deciding adjacency: both members may be off by the tolerance. */
const PITCH_SLACK = 4 * DOCK_TOLERANCE.pos;

/**
 * Find latch pairs: chassis whose centres are one dock pitch apart along x or y of chassis 0.
 * Writes [a, b] index pairs into `pairs` (length ≥ 2·capacity·2) and returns the pair count.
 */
export function findLatchPairs(solver: CompositeSolver, pairs: Uint8Array): number {
  const n = solver.count, ch = solver.chassis;
  const c = Math.cos(ch[2]), s = Math.sin(ch[2]);
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const wx = ch[j * 3] - ch[i * 3], wy = ch[j * 3 + 1] - ch[i * 3 + 1];
      const dx = Math.abs(c * wx + s * wy), dy = Math.abs(-s * wx + c * wy);
      const alongX = Math.abs(dx - DOCK_PITCH.x) <= PITCH_SLACK && dy <= PITCH_SLACK;
      const alongY = Math.abs(dy - DOCK_PITCH.y) <= PITCH_SLACK && dx <= PITCH_SLACK;
      if ((alongX || alongY) && count * 2 + 1 < pairs.length) {
        pairs[count * 2] = i;
        pairs[count * 2 + 1] = j;
        count++;
      }
    }
  }
  return count;
}

/** Validate a cluster for STRUCTURAL_LOCK. Event-rate code: allocates small scratch arrays. */
export function validateStructure(solver: CompositeSolver, headingTol: number = 2 * DOCK_TOLERANCE.theta): StructureValidation {
  const n = solver.count;
  if (n < 1) return { status: 'INVALID', reason: 'empty' };
  for (let i = 1; i < n; i++) {
    const d = solver.chassis[i * 3 + 2] - solver.chassis[2];
    if (Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) > headingTol) return { status: 'INVALID', reason: 'heading-mismatch' };
  }
  const pairs = new Uint8Array(n * (n - 1) + 2);
  const latches = findLatchPairs(solver, pairs);
  // Connectivity by label propagation over the latch pairs.
  const label = new Uint8Array(n);
  for (let i = 0; i < n; i++) label[i] = i;
  for (let pass = 0; pass < n; pass++) {
    for (let p = 0; p < latches; p++) {
      const a = pairs[p * 2], b = pairs[p * 2 + 1], m = Math.min(label[a], label[b]);
      label[a] = m; label[b] = m;
    }
  }
  for (let i = 0; i < n; i++) if (label[i] !== 0) return { status: 'INVALID', reason: 'not-connected' };
  if (!solver.wellPosed) return { status: 'INVALID', reason: 'singular-kinematics' };
  return { status: 'VALID', latches };
}
