/**
 * Distributed task allocation (scientific documentation §1.13, equation 5):
 *
 *   J_ij = t̂_ij + w_q·q_i + w_e·r_i + w_u·u_ij
 *
 *   t̂_ij — estimated travel time of robot i to goal j (s, learned edge times, equation 6);
 *   q_i  — weight of the robot's current task queue;
 *   r_i  — battery-risk index ∈ [0, 1];
 *   u_ij — route-data uncertainty ∈ [0, 1] (share of unobserved / hazardous edges).
 *
 * The consensus auction is a sequential greedy (single-assignment CBBA): in each round every free
 * robot bids its cheapest compatible task, the network agrees on the global minimum (max-consensus
 * converges to the same winner on a connected graph), the winner takes the task, and the round
 * repeats. Ties break on (task priority, robot id) so every agent computes the same outcome.
 */

export interface AuctionWeights { wq: number; we: number; wu: number }

/** Default weights: one queued task ≈ 6 s of travel, a dead battery ≈ 25 s, unknown route ≈ 8 s. */
export const DEFAULT_WEIGHTS: AuctionWeights = { wq: 6, we: 25, wu: 8 };

export interface CostTerms { t: number; q: number; r: number; u: number }

/** Equation 5. */
export function jCost(c: CostTerms, w: AuctionWeights = DEFAULT_WEIGHTS): number {
  return c.t + w.wq * c.q + w.we * c.r + w.wu * c.u;
}

/** r_i: 0 above 60 % charge, rising linearly to 1 at the 25 % hot-swap threshold. */
export function batteryRisk(b: number): number {
  return Math.min(1, Math.max(0, (0.6 - b) / 0.35));
}

export interface AuctionTask { id: number; capability: string; priority: number }
export interface AuctionBidder { id: number; capability: string }

export interface Bid { agentId: number; taskId: number; cost: number; terms: CostTerms }
export interface AuctionResult {
  /** Winning bids in award order. */
  awards: Bid[];
  /** Every compatible bid computed in the first round (for the UI and tests). */
  bids: Bid[];
  rounds: number;
}

/**
 * Run the auction. `terms(agent, task)` returns the cost terms or null when the robot cannot serve the
 * task (wrong capability, unreachable). Higher priority tasks are awarded first.
 */
export function runAuction(
  tasks: readonly AuctionTask[],
  bidders: readonly AuctionBidder[],
  terms: (agentId: number, taskId: number) => CostTerms | null,
  w: AuctionWeights = DEFAULT_WEIGHTS,
): AuctionResult {
  const bids: Bid[] = [];
  const table = new Map<string, Bid>();
  for (const b of bidders) {
    for (const t of tasks) {
      if (t.capability !== b.capability) continue;
      const c = terms(b.id, t.id);
      if (!c || !Number.isFinite(c.t)) continue;
      const bid = { agentId: b.id, taskId: t.id, cost: jCost(c, w), terms: c };
      bids.push(bid);
      table.set(`${b.id}:${t.id}`, bid);
    }
  }
  const freeAgents = new Set(bidders.map(b => b.id));
  const openTasks = [...tasks].sort((a, b) => b.priority - a.priority || a.id - b.id);
  const awards: Bid[] = [];
  let rounds = 0;
  while (openTasks.length && freeAgents.size) {
    rounds++;
    const top = openTasks[0].priority;
    let best: Bid | null = null;
    for (const t of openTasks) {
      if (t.priority !== top) break;
      for (const id of freeAgents) {
        const b = table.get(`${id}:${t.id}`);
        if (!b) continue;
        if (!best || b.cost < best.cost - 1e-9 || (Math.abs(b.cost - best.cost) <= 1e-9 && (b.agentId < best.agentId || (b.agentId === best.agentId && b.taskId < best.taskId)))) best = b;
      }
    }
    if (!best) {
      // Nobody can serve the top-priority tier; drop it and continue with lower priorities.
      while (openTasks.length && openTasks[0].priority === top) openTasks.shift();
      continue;
    }
    awards.push(best);
    freeAgents.delete(best.agentId);
    openTasks.splice(openTasks.findIndex(t => t.id === best!.taskId), 1);
  }
  return { awards, bids, rounds };
}
