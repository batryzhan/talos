/**
 * Deployable bridges (CLAUDE.md §5.3, item 3).
 *
 * When the S1 graph is cut between two nodes (d = ∞), a squad of chassis drives into the chasm,
 * engages its brakes (v = 0, holding torque) and the closed edge is re-published as a
 * PASSABLE_STRUCTURE with a load rating. Releasing the bridge closes the edge again.
 */
import type { Pose2D } from '../../contracts/types';
import type { BridgePlan, BridgeStatus } from '../../types/metamorphic';
import { DOCK_PITCH } from '../kinematics/compositeSolver';
import type { S1Graph } from '../routing/s1Graph';
import { DOCK_TOLERANCE } from './docking';

/** Load rating of a bridge of locked Strafers (kg). */
export const BRIDGE_MAX_LOAD_KG = 40;

export interface BridgePlanOptions {
  /** Length of chasm one chassis covers (m). Default: the docked pitch along x. */
  spanPerAgent?: number;
}

/**
 * Decide whether a bridge is needed between `from` and `to`, and where.
 *
 * Among the edges closed by a CHASM, pick the one whose bridging gives the shortest route, then
 * place ⌈gap / span⌉ agents evenly along it, heading along the edge. Agents are taken from
 * `availableAgentIds` in the given order.
 */
export function planBridge(
  graph: S1Graph, from: number, to: number, availableAgentIds: readonly number[], options: BridgePlanOptions = {},
): BridgePlan {
  if (Number.isFinite(graph.distance(from, to))) return { status: 'NOT_NEEDED' };

  const span = options.spanPerAgent ?? DOCK_PITCH.x;
  const fromDist = graph.distancesFrom(from), toDist = graph.distancesFrom(to);
  const index = new Map<number, number>();
  graph.nodes.forEach((n, i) => index.set(n.id, i));

  let bestId = -1, bestCost = Infinity, bestForward = true;
  for (const e of graph.edges) {
    if (e.state.status !== 'CLOSED' || e.state.reason !== 'CHASM') continue;
    const ia = index.get(e.a)!, ib = index.get(e.b)!;
    const forward = fromDist[ia] + e.length + toDist[ib], backward = fromDist[ib] + e.length + toDist[ia];
    const cost = Math.min(forward, backward);
    if (cost < bestCost) { bestCost = cost; bestId = e.id; bestForward = forward <= backward; }
  }
  if (bestId < 0) return { status: 'NO_SPAN' };

  const edge = graph.edge(bestId);
  const required = Math.max(1, Math.ceil(edge.length / span - 1e-9));
  if (availableAgentIds.length < required) {
    return { status: 'INSUFFICIENT_AGENTS', edgeId: bestId, required, available: availableAgentIds.length };
  }

  const start = graph.node(bestForward ? edge.a : edge.b), end = graph.node(bestForward ? edge.b : edge.a);
  const theta = Math.atan2(end.y - start.y, end.x - start.x);
  const slots: Pose2D[] = [];
  for (let i = 0; i < required; i++) {
    const f = (i + 0.5) / required;
    slots.push({ x: start.x + (end.x - start.x) * f, y: start.y + (end.y - start.y) * f, theta });
  }
  return { status: 'PLANNED', edgeId: bestId, gapLength: edge.length, agentIds: availableAgentIds.slice(0, required), slots };
}

/** Lifecycle of one bridge: IDLE → DEPLOYING → HOLDING → RELEASED. */
export class BridgeDeployment {
  status: BridgeStatus = 'IDLE';
  /** True while the squad holds position with v = 0 and holding torque. */
  brakesEngaged = false;
  readonly edgeId: number;
  readonly agentIds: readonly number[];
  readonly slots: readonly Pose2D[];
  private readonly settled: Uint8Array;

  constructor(
    private readonly graph: S1Graph,
    plan: Extract<BridgePlan, { status: 'PLANNED' }>,
    readonly maxLoadKg: number = BRIDGE_MAX_LOAD_KG,
  ) {
    this.edgeId = plan.edgeId;
    this.agentIds = plan.agentIds;
    this.slots = plan.slots;
    this.settled = new Uint8Array(plan.slots.length);
  }

  begin(): boolean {
    if (this.status !== 'IDLE') return false;
    this.status = 'DEPLOYING';
    return true;
  }

  /**
   * Report slot `i` for this control step: its pose error to the slot and its speed. A slot counts
   * as settled only inside the docking tolerance and at rest.
   */
  reportSlot(i: number, posError: number, thetaError: number, speed: number): void {
    this.settled[i] = posError <= DOCK_TOLERANCE.pos && Math.abs(thetaError) <= DOCK_TOLERANCE.theta && speed <= 1e-3 ? 1 : 0;
  }

  /**
   * Engage the brakes and publish the edge once every slot is settled. Returns true on the step
   * the bridge becomes passable.
   */
  tryEngage(): boolean {
    if (this.status !== 'DEPLOYING') return false;
    for (let i = 0; i < this.settled.length; i++) if (this.settled[i] === 0) return false;
    this.brakesEngaged = true;
    this.status = 'HOLDING';
    this.graph.insertStructure(this.edgeId, this.maxLoadKg, this.agentIds);
    return true;
  }

  /** Withdraw the bridge: the edge is a chasm again. */
  release(): boolean {
    if (this.status !== 'HOLDING' && this.status !== 'DEPLOYING') return false;
    if (this.status === 'HOLDING') this.graph.closeEdge(this.edgeId, 'CHASM');
    this.brakesEngaged = false;
    this.status = 'RELEASED';
    return true;
  }
}
