/**
 * S1 route network shared by a mission's robots (scientific documentation §2.5):
 *  - Dijkstra / A* over the S1 graph with the robot's own learned edge times as costs;
 *  - dynamic closures (blocked corridor, roof collapse, fire front): every robot whose remaining
 *    route crosses the closed edge replans from where it stands;
 *  - local learning, equation 6:  t̂_{e,m} = (1 − α)·t̂_{e,m−1} + α·t_{e,m},  α = 0.25 — a robot that
 *    finishes an edge updates its estimate and publishes the observation; peers receive it unless
 *    the radio drops the packet.
 *
 * Planning and learning run at event rate; `follow` (control rate) only reads the route arrays.
 */
import { RouteLearning } from '../terrain/routeLearning';
import { DriveStatus, type SwarmAgent } from '../agents/SwarmAgent';
import { S1Graph } from './s1Graph';
import type { Rng } from '../../swarm/rng';
import type { S1ClosureReason, S1Edge } from '../../types/routing';

export const LEARNING_ALPHA = 0.25;

export interface EdgeObservation { t: number; agentId: number; edgeId: number; observed: number; before: number; after: number }

export class RouteNetwork {
  readonly learners = new Map<number, RouteLearning>();
  learning = true;
  lossP = 0;
  replans = 0;
  updates = 0;
  readonly observations: EdgeObservation[] = [];
  /** Environment speed factor of an edge ∈ (0, 1] (slope, smoke…) used by the prior t_e. */
  edgeFactor: (e: S1Edge) => number = () => 1;
  /** Extra spur nodes that robots may not use as entry points (stations, docks). */
  readonly stationNodes = new Set<number>();

  constructor(readonly graph: S1Graph, private readonly rng: Rng, private readonly agents: readonly SwarmAgent[]) {
    for (const a of agents) this.learners.set(a.id, new RouteLearning(LEARNING_ALPHA));
  }

  /** Prior traversal time of an edge for a robot (s). */
  prior(e: S1Edge, vmax: number): number {
    return e.length / Math.max(0.05, vmax * this.edgeFactor(e));
  }

  /** Learned (or prior) edge time t̂_e for robot `agent`. */
  estimate(agent: SwarmAgent, e: S1Edge): number {
    const p = this.prior(e, agent.vmax);
    return this.learning ? this.learners.get(agent.id)!.estimate(e.id, p) : p;
  }

  /** Nearest graph node to (x, y) that is not a private station spur (unless allowed). */
  nearestNode(x: number, y: number, allowStations = false): number {
    let best = -1, bd = Infinity;
    for (const n of this.graph.nodes) {
      if (!allowStations && this.stationNodes.has(n.id)) continue;
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  private costFor(agent: SwarmAgent): (e: S1Edge) => number {
    return e => this.estimate(agent, e);
  }

  /** Learned travel times from the robot's entry node to every node (index order of graph.nodes). */
  timesFrom(agent: SwarmAgent): { entry: number; times: Float64Array; spur: number } {
    const entry = this.nearestNode(agent.x, agent.y);
    const n = this.graph.node(entry);
    return { entry, times: this.graph.distancesFrom(entry, { cost: this.costFor(agent) }), spur: Math.hypot(n.x - agent.x, n.y - agent.y) / agent.vmax };
  }

  /** Index of a node id in graph.nodes (for reading `timesFrom` results). */
  indexOfNode(id: number): number {
    const nodes = this.graph.nodes;
    for (let i = 0; i < nodes.length; i++) if (nodes[i].id === id) return i;
    return -1;
  }

  /** t̂_ij: learned travel time of `agent` to the point (x, y) through `goalNode` (default: nearest). */
  travelTime(agent: SwarmAgent, x: number, y: number, goalNode?: number, cache?: { entry: number; times: Float64Array; spur: number }): number {
    const c = cache ?? this.timesFrom(agent);
    const g = goalNode ?? this.nearestNode(x, y, true);
    const gn = this.graph.node(g);
    return c.spur + c.times[this.indexOfNode(g)] + Math.hypot(gn.x - x, gn.y - y) / agent.vmax;
  }

  /** u_ij: share of edges of the planned route the robot has never observed itself. */
  uncertainty(agent: SwarmAgent, x: number, y: number, goalNode?: number): number {
    const r = this.graph.shortestPath(this.nearestNode(agent.x, agent.y), goalNode ?? this.nearestNode(x, y, true), { cost: this.costFor(agent) });
    if (r.status !== 'FOUND') return 1;
    if (!r.edges.length) return 0;
    const l = this.learners.get(agent.id)!;
    let unknown = 0;
    for (const e of r.edges) if (!l.estimates.has(e)) unknown++;
    return unknown / r.edges.length;
  }

  /**
   * Plan a route for `agent` to (x, y), optionally entering through `goalNode` and settling on
   * `finalTheta`. Returns false when the goal is cut off (d = ∞); the robot then stops.
   */
  /**
   * Entry node of a route: among the nodes close to the robot, the one that does not send it back
   * (minimises |robot → node| + |node → goal|), so a replan mid-edge keeps the progress made.
   */
  entryNode(ax: number, ay: number, gx: number, gy: number): number {
    const nearest = this.nearestNode(ax, ay), n0 = this.graph.node(nearest), r = Math.hypot(n0.x - ax, n0.y - ay) * 1.6 + 0.5;
    let best = nearest, score = Infinity;
    for (const n of this.graph.nodes) {
      if (this.stationNodes.has(n.id)) continue;
      const d = Math.hypot(n.x - ax, n.y - ay);
      if (d > r) continue;
      const sc = d + Math.hypot(gx - n.x, gy - n.y);
      if (sc < score) { score = sc; best = n.id; }
    }
    return best;
  }

  plan(agent: SwarmAgent, x: number, y: number, finalTheta = Number.NaN, goalNode?: number): boolean {
    const from = this.entryNode(agent.x, agent.y, x, y), to = goalNode ?? this.nearestNode(x, y, true);
    agent.stop();
    agent.finalTheta = finalTheta;
    agent.goalX = x; agent.goalY = y; agent.routeGoalSet = true;
    const direct = Math.hypot(x - agent.x, y - agent.y);
    const fromNode = this.graph.node(from);
    // Short hops that do not need the graph (already at the station spur).
    if (from === to || direct < Math.hypot(fromNode.x - agent.x, fromNode.y - agent.y) * 0.9) {
      agent.wpX.push(x); agent.wpY.push(y); agent.wpEdge.push(-1);
      agent.edgeStart = 0;
      return true;
    }
    const r = this.graph.shortestPath(from, to, { cost: this.costFor(agent) });
    if (r.status !== 'FOUND') { agent.routeGoalSet = false; return false; }
    for (let k = 0; k < r.nodes.length; k++) {
      const n = this.graph.node(r.nodes[k]);
      agent.wpX.push(n.x); agent.wpY.push(n.y); agent.wpEdge.push(k === 0 ? -1 : r.edges[k - 1]);
    }
    const last = this.graph.node(to);
    if (Math.hypot(last.x - x, last.y - y) > 0.02) { agent.wpX.push(x); agent.wpY.push(y); agent.wpEdge.push(-1); }
    agent.edgeStart = -1;
    return true;
  }

  /** Remaining graph edges of the robot's route. */
  routeCrosses(agent: SwarmAgent, edgeId: number): boolean {
    for (let k = Math.max(1, agent.wpIndex); k < agent.wpEdge.length; k++) if (agent.wpEdge[k] === edgeId) return true;
    // The edge being driven right now ends at wpIndex.
    return agent.wpIndex < agent.wpEdge.length && agent.wpEdge[agent.wpIndex] === edgeId;
  }

  /** Close an edge (S1) and replan every robot whose route crosses it. Returns the replanned ids. */
  closeEdge(edgeId: number, reason: S1ClosureReason, now: number): number[] {
    if (this.graph.edge(edgeId).state.status === 'CLOSED') return [];
    this.graph.closeEdge(edgeId, reason);
    return this.replanCrossing(edgeId, now);
  }

  openEdge(edgeId: number): void {
    if (this.graph.edge(edgeId).state.status !== 'OPEN') this.graph.openEdge(edgeId);
  }

  replanCrossing(edgeId: number, now: number): number[] {
    const out: number[] = [];
    for (const a of this.agents) {
      if (!a.routeGoalSet || !a.hasRoute || !this.routeCrosses(a, edgeId)) continue;
      // Back off to the nearest open node and route around the closure.
      this.plan(a, a.goalX, a.goalY, a.finalTheta);
      a.edgeStart = now;
      this.replans++;
      out.push(a.id);
    }
    return out;
  }

  /**
   * Control step of a routed robot: drive, and on reaching a graph node learn the time of the edge
   * just finished (equation 6) and publish it to peers over the lossy radio.
   */
  follow(agent: SwarmAgent, now: number, dt: number): DriveStatus {
    const before = agent.wpIndex;
    if (agent.edgeStart < 0 && agent.hasRoute) agent.edgeStart = now;
    const status = agent.drive(dt);
    if (agent.wpIndex !== before) {
      for (let k = before; k < agent.wpIndex && k < agent.wpEdge.length; k++) {
        const e = agent.wpEdge[k];
        if (e >= 0 && agent.edgeStart >= 0 && k > 0) this.observe(agent, e, now - agent.edgeStart, now);
        agent.edgeStart = now;
      }
    }
    return status;
  }

  observe(agent: SwarmAgent, edgeId: number, observed: number, now: number): void {
    if (!this.learning || !(observed > 0.05)) return;
    const e = this.graph.edge(edgeId);
    const own = this.learners.get(agent.id)!;
    const before = own.estimate(edgeId, this.prior(e, agent.vmax));
    const r = own.observe(edgeId, observed, this.prior(e, agent.vmax));
    this.updates++;
    this.observations.push({ t: now, agentId: agent.id, edgeId, observed, before, after: r.value });
    if (this.observations.length > 64) this.observations.splice(0, this.observations.length - 64);
    // Publication: peers adopt the observation scaled to their own speed limit, unless the packet is lost.
    for (const peer of this.agents) {
      if (peer === agent || this.rng.bernoulli(this.lossP)) continue;
      this.learners.get(peer.id)!.observe(edgeId, observed * agent.vmax / peer.vmax, this.prior(e, peer.vmax));
    }
  }

  /** Mean learned t̂ of an edge over the fleet (for overlays / telemetry); prior when unobserved. */
  fleetEstimate(edgeId: number, vmax: number): number {
    const e = this.graph.edge(edgeId);
    let sum = 0, n = 0;
    for (const l of this.learners.values()) { const v = l.estimates.get(edgeId); if (v !== undefined) { sum += v; n++; } }
    return n ? sum / n : this.prior(e, vmax);
  }

  /** Learned time of the edge the robot is driving now (s), or 0 off-graph. */
  currentEdgeEstimate(agent: SwarmAgent): number {
    const k = Math.min(agent.wpIndex, agent.wpEdge.length - 1);
    const e = k >= 0 ? agent.wpEdge[k] : -1;
    return e >= 0 ? this.estimate(agent, this.graph.edge(e)) : 0;
  }
}

export { DriveStatus };
