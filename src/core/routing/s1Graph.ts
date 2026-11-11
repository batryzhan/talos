/**
 * S1 navigation graph: bidirectional weighted graph with dynamic edge states and Dijkstra / A*
 * shortest paths (CLAUDE.md §5.3, item 3).
 *
 * An edge is traversable when it is OPEN, or when it is a PASSABLE_STRUCTURE (a bridge of locked
 * chassis) whose load rating covers the payload. CLOSED edges are never traversed; the distance
 * across a cut graph is d = ∞.
 *
 * Planning runs at event rate (topology changes, new missions), not in the simulation loop.
 */
import type {
  S1Algorithm, S1ClosureReason, S1Edge, S1EdgeState, S1Node, S1Route,
} from '../../types/metamorphic';

export interface RouteOptions {
  algorithm?: S1Algorithm;
  /** Mass carried along the route (kg); checked against bridge load ratings. */
  payloadKg?: number;
}

/** Binary min-heap of (priority, node index) pairs on typed arrays. */
class MinHeap {
  private readonly key: Float64Array;
  private readonly val: Int32Array;
  size = 0;

  constructor(capacity: number) {
    this.key = new Float64Array(capacity);
    this.val = new Int32Array(capacity);
  }

  push(key: number, val: number): void {
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.key[parent] <= key) break;
      this.key[i] = this.key[parent]; this.val[i] = this.val[parent];
      i = parent;
    }
    this.key[i] = key; this.val[i] = val;
  }

  /** Remove and return the value with the smallest key. */
  pop(): number {
    const top = this.val[0];
    const n = --this.size;
    if (n > 0) {
      const key = this.key[n], val = this.val[n];
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && this.key[child + 1] < this.key[child]) child++;
        if (this.key[child] >= key) break;
        this.key[i] = this.key[child]; this.val[i] = this.val[child];
        i = child;
      }
      this.key[i] = key; this.val[i] = val;
    }
    return top;
  }
}

export class S1Graph {
  private readonly nodeList: S1Node[] = [];
  private readonly edgeList: S1Edge[] = [];
  private readonly nodeIndex = new Map<number, number>();
  /** Per node index: ids (= indices) of incident edges. */
  private readonly incident: number[][] = [];
  /** Bumped on every topology or state change; lets renderers refresh lazily. */
  version = 0;

  get nodes(): readonly S1Node[] { return this.nodeList; }
  get edges(): readonly S1Edge[] { return this.edgeList; }

  addNode(id: number, x: number, y: number): S1Node {
    if (this.nodeIndex.has(id)) throw new RangeError(`node ${id} already exists`);
    const node: S1Node = { id, x, y };
    this.nodeIndex.set(id, this.nodeList.length);
    this.nodeList.push(node);
    this.incident.push([]);
    this.version++;
    return node;
  }

  node(id: number): S1Node {
    return this.nodeList[this.indexOf(id)];
  }

  /**
   * Add an undirected edge and return its id. `length` defaults to the Euclidean distance and may
   * not be shorter than it (the A* heuristic relies on that).
   */
  addEdge(a: number, b: number, state: S1EdgeState = { status: 'OPEN' }, length?: number): number {
    const ia = this.indexOf(a), ib = this.indexOf(b);
    if (ia === ib) throw new RangeError('self-loops are not allowed');
    const euclid = Math.hypot(this.nodeList[ia].x - this.nodeList[ib].x, this.nodeList[ia].y - this.nodeList[ib].y);
    const len = length ?? euclid;
    if (!(len >= euclid - 1e-9)) throw new RangeError(`edge length ${len} is below the node distance ${euclid}`);
    const id = this.edgeList.length;
    this.edgeList.push({ id, a, b, length: len, state });
    this.incident[ia].push(id);
    this.incident[ib].push(id);
    this.version++;
    return id;
  }

  edge(id: number): S1Edge {
    const e = this.edgeList[id];
    if (!e) throw new RangeError(`unknown edge ${id}`);
    return e;
  }

  /** First edge joining a and b (either direction), or null. */
  findEdge(a: number, b: number): S1Edge | null {
    for (const e of this.edgeList) if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
    return null;
  }

  setEdgeState(id: number, state: S1EdgeState): void {
    this.edge(id).state = state;
    this.version++;
  }

  closeEdge(id: number, reason: S1ClosureReason = 'DYNAMIC_CUT'): void {
    this.setEdgeState(id, { status: 'CLOSED', reason });
  }

  openEdge(id: number): void {
    this.setEdgeState(id, { status: 'OPEN' });
  }

  /** Turn an edge into a bridge of locked chassis. */
  insertStructure(id: number, maxLoadKg: number, agentIds: readonly number[]): void {
    this.setEdgeState(id, { status: 'PASSABLE_STRUCTURE', traversable: true, maxLoadKg, agentIds: [...agentIds] });
  }

  isTraversable(e: S1Edge, payloadKg = 0): boolean {
    switch (e.state.status) {
      case 'OPEN': return true;
      case 'CLOSED': return false;
      case 'PASSABLE_STRUCTURE': return payloadKg <= e.state.maxLoadKg;
    }
  }

  /** Shortest-path distances from `from` to every node (index order of `nodes`); ∞ if cut off. */
  distancesFrom(from: number, payloadKg = 0): Float64Array {
    const n = this.nodeList.length, dist = new Float64Array(n).fill(Infinity);
    this.search(this.indexOf(from), -1, payloadKg, false, dist, null);
    return dist;
  }

  /** d(from, to); Infinity when the graph is disconnected between them. */
  distance(from: number, to: number, payloadKg = 0): number {
    return this.distancesFrom(from, payloadKg)[this.indexOf(to)];
  }

  shortestPath(from: number, to: number, options: RouteOptions = {}): S1Route {
    const n = this.nodeList.length, src = this.indexOf(from), dst = this.indexOf(to);
    const dist = new Float64Array(n).fill(Infinity), viaEdge = new Int32Array(n).fill(-1);
    this.search(src, dst, options.payloadKg ?? 0, options.algorithm === 'astar', dist, viaEdge);
    if (!Number.isFinite(dist[dst])) return { status: 'UNREACHABLE', cost: Infinity };
    const nodes: number[] = [to], edges: number[] = [];
    for (let i = dst; i !== src;) {
      const e = this.edgeList[viaEdge[i]];
      const prev = e.a === this.nodeList[i].id ? e.b : e.a;
      edges.push(e.id);
      nodes.push(prev);
      i = this.indexOf(prev);
    }
    nodes.reverse();
    edges.reverse();
    return { status: 'FOUND', cost: dist[dst], nodes, edges };
  }

  /**
   * Dijkstra (heuristic off) or A* with the Euclidean heuristic. Stops early at `dst` if dst ≥ 0.
   * The heuristic is admissible and consistent because edge length ≥ node distance.
   */
  private search(src: number, dst: number, payloadKg: number, astar: boolean, dist: Float64Array, viaEdge: Int32Array | null): void {
    const n = this.nodeList.length, done = new Uint8Array(n);
    const heap = new MinHeap(Math.max(1, 2 * this.edgeList.length + 1));
    const goal = dst >= 0 ? this.nodeList[dst] : null;
    const h = (i: number): number => (astar && goal ? Math.hypot(this.nodeList[i].x - goal.x, this.nodeList[i].y - goal.y) : 0);
    dist[src] = 0;
    heap.push(h(src), src);
    while (heap.size > 0) {
      const u = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === dst) return;
      const uid = this.nodeList[u].id;
      for (const eid of this.incident[u]) {
        const e = this.edgeList[eid];
        if (!this.isTraversable(e, payloadKg)) continue;
        const v = this.indexOf(e.a === uid ? e.b : e.a);
        const d = dist[u] + e.length;
        if (d < dist[v]) {
          dist[v] = d;
          if (viaEdge) viaEdge[v] = eid;
          heap.push(d + h(v), v);
        }
      }
    }
  }

  private indexOf(id: number): number {
    const i = this.nodeIndex.get(id);
    if (i === undefined) throw new RangeError(`unknown node ${id}`);
    return i;
  }
}
