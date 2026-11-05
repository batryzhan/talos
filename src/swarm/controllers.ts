/**
 * Lift controllers A / B / C (CLAUDE.md §4.3, formula 17):
 *
 *   u_i = sat[ k_p (h* − h_i) + k_c Σ_{j∈N_i} w_ij (h_j − h_i) ]
 *
 * sat[·] clamps to [−v_down, v_up], where v_up is the slowest / most loaded participant's
 * achievable upward speed (formula 15 torque–speed line), so the group rises together.
 *
 *  A — independent:   k_c = 0, no neighbours, own speed bound only.
 *  B — centralized:   coordinator sees every agent's true state (complete graph, no loss).
 *  C — decentralized: only the local neighbours actually heard over the lossy, delayed radio.
 */
import type { ControllerKind, LiftControlGains, LiftDriveParams } from '../contracts/types';
import { maxUpSpeed } from '../robot/liftDrive';

export interface NeighborHeight {
  h: number;
  /** Reported force (N) or null if the neighbour has no force sensor. */
  force: number | null;
  /** Coupling weight w_ij (default 1). */
  w?: number;
}

export interface LiftControlInput {
  kind: ControllerKind;
  target: number;
  h: number;
  /** Own measured load (N) — from the own force sensor or the motor current estimate. */
  ownLoad: number;
  /** For B: all other agents. For C: heard neighbours. Ignored for A. */
  neighbors: NeighborHeight[];
  gains: LiftControlGains;
  drive: LiftDriveParams;
}

export interface LiftControlOutput {
  u: number;
  /** Raw (unsaturated) law value. */
  raw: number;
  vUp: number;
  vDown: number;
  saturated: boolean;
}

export function liftControl(inp: LiftControlInput): LiftControlOutput {
  const { kind, gains, drive } = inp;
  const kc = kind === 'A' ? 0 : gains.kc;
  let coupling = 0;
  let vUp = maxUpSpeed(drive, inp.ownLoad);
  if (kind !== 'A') {
    for (const nb of inp.neighbors) {
      coupling += (nb.w ?? 1) * (nb.h - inp.h);
      if (nb.force !== null) vUp = Math.min(vUp, maxUpSpeed(drive, nb.force));
    }
  }
  const raw = gains.kp * (inp.target - inp.h) + kc * coupling;
  const vDown = drive.vMax;
  const u = Math.min(Math.max(raw, -vDown), vUp);
  return { u, raw, vUp, vDown, saturated: u !== raw };
}
