/**
 * Strategic tier (CLAUDE.md §3.1): mission decomposition into a DAG, role allocation when the S1
 * graph collapses, quorum oversight against split-brain, and battery hot-swap.
 *
 * Deterministic and event-rate: it is driven by telemetry at the radio rate and allocates only when
 * something actually happens.
 */
import type { BridgePlan } from '../../types/metamorphic';
import type {
  MissionDag, MissionDirective, MissionTask, OrchestratorEvent, QuorumState, RosterEntry, SwarmRole,
} from '../../types/orchestrator';
import { planBridge } from '../metamorphic/bridgeInfrastructure';
import type { S1Graph } from '../routing/s1Graph';

/** Battery level below which an active agent must be swapped out. */
export const BATTERY_CRITICAL = 0.25;
const EVENT_LOG_LIMIT = 64;

// ───────────────────────── mission DAG ─────────────────────────

/**
 * Decompose a directive into tasks. A bridge task is added only when the route is cut (d = ∞) for
 * the payload being carried.
 */
export function decomposeMission(directive: MissionDirective, graph: S1Graph): MissionDag {
  const tasks: MissionTask[] = [];
  let nextId = 1;
  const { from, to } = directive;
  const payloadKg = directive.type === 'MACRO_TRANSPORT' ? directive.payloadKg : 0;

  const route: MissionTask = { id: nextId++, type: 'ROUTE_CHECK', from, to, deps: [], status: 'PENDING' };
  tasks.push(route);
  const before: number[] = [route.id];

  if (!Number.isFinite(graph.distance(from, to, payloadKg))) {
    const bridge: MissionTask = { id: nextId++, type: 'DEPLOY_BRIDGE', from, to, deps: [route.id], status: 'PENDING' };
    tasks.push(bridge);
    before.push(bridge.id);
  }
  if (directive.type === 'MACRO_TRANSPORT') {
    const form: MissionTask = { id: nextId++, type: 'FORM_MACRO', formation: directive.formation, deps: [route.id], status: 'PENDING' };
    tasks.push(form);
    before.push(form.id);
  }
  const move: MissionTask = { id: nextId++, type: 'TRANSPORT', from, to, payloadKg, deps: before, status: 'PENDING' };
  tasks.push(move);
  tasks.push({ id: nextId++, type: 'RELEASE', deps: [move.id], status: 'PENDING' });
  return { directive, tasks };
}

/** Kahn topological order of the task ids. Throws if the graph is not acyclic. */
export function topologicalOrder(dag: MissionDag): number[] {
  const indegree = new Map<number, number>(), dependents = new Map<number, number[]>();
  for (const t of dag.tasks) { indegree.set(t.id, t.deps.length); dependents.set(t.id, []); }
  for (const t of dag.tasks) {
    for (const d of t.deps) {
      const list = dependents.get(d);
      if (!list) throw new RangeError(`task ${t.id} depends on unknown task ${d}`);
      list.push(t.id);
    }
  }
  const ready = dag.tasks.filter(t => t.deps.length === 0).map(t => t.id), order: number[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of dependents.get(id)!) {
      const left = indegree.get(next)! - 1;
      indegree.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  if (order.length !== dag.tasks.length) throw new RangeError('mission graph has a cycle');
  return order;
}

/** PENDING tasks whose dependencies are all DONE. */
export function readyTasks(dag: MissionDag): MissionTask[] {
  const done = new Set(dag.tasks.filter(t => t.status === 'DONE').map(t => t.id));
  return dag.tasks.filter(t => t.status === 'PENDING' && t.deps.every(d => done.has(d)));
}

/** Mark a task DONE. Returns false if it is unknown or its dependencies are not DONE. */
export function completeTask(dag: MissionDag, id: number): boolean {
  const task = dag.tasks.find(t => t.id === id);
  if (!task || task.status === 'DONE') return false;
  if (!task.deps.every(d => dag.tasks.find(t => t.id === d)?.status === 'DONE')) return false;
  task.status = 'DONE';
  return true;
}

// ───────────────────────── quorum ─────────────────────────

/**
 * Quorum rule against split-brain: only a strict majority of the agreed membership may act. Two
 * disjoint partitions can never both hold a strict majority.
 */
export function quorumOf(epoch: number, members: number, alive: number): QuorumState {
  if (alive >= members) return { status: 'STABLE', epoch, members };
  if (2 * alive > members) return { status: 'DEGRADED', epoch, members, alive };
  return { status: 'LOST', epoch, members, alive };
}

// ───────────────────────── orchestrator ─────────────────────────

export class SwarmOrchestrator {
  readonly roster: RosterEntry[];
  readonly events: OrchestratorEvent[] = [];
  epoch = 1;
  quorum: QuorumState;
  private lastAlive: number;
  private readonly blocked = new Set<number>();

  constructor(
    private readonly graph: S1Graph,
    agents: readonly { id: number; role: SwarmRole }[],
    private readonly batteryCritical: number = BATTERY_CRITICAL,
  ) {
    this.roster = agents.map(a => ({ id: a.id, role: a.role, battery: 1, alive: true }));
    this.lastAlive = this.roster.length;
    this.quorum = quorumOf(this.epoch, this.roster.length, this.lastAlive);
  }

  entry(id: number): RosterEntry {
    const e = this.roster.find(r => r.id === id);
    if (!e) throw new RangeError(`unknown agent ${id}`);
    return e;
  }

  roleOf(id: number): SwarmRole {
    return this.entry(id).role;
  }

  idsWithRole(role: SwarmRole): number[] {
    return this.roster.filter(r => r.role === role && r.alive).map(r => r.id);
  }

  /** Feed the latest telemetry of one agent (edge tier → strategic tier). */
  observe(id: number, battery: number, alive: boolean): void {
    for (let i = 0; i < this.roster.length; i++) {
      const r = this.roster[i];
      if (r.id === id) { r.battery = battery; r.alive = alive; return; }
    }
  }

  /** Whether this partition may issue new commands. */
  get mayAct(): boolean {
    return this.quorum.status !== 'LOST';
  }

  /** Evaluate quorum and battery hot-swaps. Call at the radio rate. */
  tick(t: number): void {
    let alive = 0;
    for (let i = 0; i < this.roster.length; i++) if (this.roster[i].alive) alive++;
    if (alive !== this.lastAlive) {
      this.lastAlive = alive;
      const next = quorumOf(this.epoch, this.roster.length, alive);
      if (next.status === 'LOST') {
        this.quorum = next;
        this.log({ type: 'quorum-lost', t, alive });
      } else {
        // Membership changed but a majority still agrees: start a new epoch.
        this.epoch++;
        this.quorum = quorumOf(this.epoch, this.roster.length, alive);
        this.log({ type: 'quorum-reset', t, epoch: this.epoch, alive });
      }
    }
    if (!this.mayAct) return;

    for (let i = 0; i < this.roster.length; i++) {
      const low = this.roster[i];
      if (!low.alive || low.role === 'RESERVE' || !(low.battery < this.batteryCritical)) continue;
      let best: RosterEntry | null = null;
      for (let j = 0; j < this.roster.length; j++) {
        const r = this.roster[j];
        if (r.alive && r.role === 'RESERVE' && r.battery >= this.batteryCritical && (!best || r.battery > best.battery)) best = r;
      }
      if (best) {
        const role = low.role;
        best.role = role;
        low.role = 'RESERVE';
        this.blocked.delete(low.id);
        this.log({ type: 'hot-swap', t, outId: low.id, inId: best.id, role });
      } else if (!this.blocked.has(low.id)) {
        this.blocked.add(low.id);
        this.log({ type: 'hot-swap-blocked', t, outId: low.id });
      }
    }
  }

  /**
   * Topological collapse: if `from → to` is cut, plan a bridge and turn the chosen agents into
   * structure nodes. Reserves are spent first, then workers beyond `keepWorkers`.
   */
  allocateBridge(from: number, to: number, t: number, keepWorkers = 0): BridgePlan {
    if (!this.mayAct) return { status: 'NO_SPAN' };
    const reserves = this.idsWithRole('RESERVE');
    const spare = this.idsWithRole('WORKER').slice(keepWorkers);
    const plan = planBridge(this.graph, from, to, [...reserves, ...spare]);
    if (plan.status === 'PLANNED') {
      for (const id of plan.agentIds) this.entry(id).role = 'STRUCTURE_NODE';
      this.log({ type: 'bridge-allocated', t, edgeId: plan.edgeId, agentIds: plan.agentIds });
    } else if (plan.status !== 'NOT_NEEDED') {
      this.log({ type: 'bridge-rejected', t, reason: plan.status });
    }
    return plan;
  }

  /** Return structure nodes to the reserve pool after a bridge is withdrawn. */
  releaseStructure(agentIds: readonly number[]): void {
    for (const id of agentIds) {
      const e = this.entry(id);
      if (e.role === 'STRUCTURE_NODE') e.role = 'RESERVE';
    }
  }

  private log(e: OrchestratorEvent): void {
    this.events.push(e);
    if (this.events.length > EVENT_LOG_LIMIT) this.events.shift();
  }
}
