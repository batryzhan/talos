/**
 * S1 navigation graph: bidirectional weighted graph with dynamic edge states and Dijkstra / A*
 * shortest paths (scientific documentation §2.5, experiment S1).
 *
 * OPEN edges are traversable; CLOSED edges (blocked corridor, roof collapse, fire front) are never
 * traversed, and the distance across a cut graph is d = ∞.
 *
 * Edge cost defaults to the geometric length. A caller-supplied `cost` turns the search into a
 * travel-time search (learned estimates t̂_e, equation 6); A* then needs `heuristicPerMeter`, a lower
 * bound of cost per metre (1 / v_max), to stay admissible.
 *
 * Planning runs at event rate (topology changes, new tasks), not in the simulation loop.
 */
import type {
  S1Algorithm, S1ClosureReason, S1Edge, S1EdgeState, S1Node, S1Route,
} from '../../types/routing';

export interface RouteOptions {
  algorithm?: S1Algorithm;
  /** Edge cost (default: length). Must be positive. */
  cost?: (edge: S1Edge) => number;
  /** A* heuristic scale: admissible lower bound of cost per metre (default 1 without `cost`, else 0). */
  heuristicPerMeter?: number;
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
  /** Search workspace, reused by every query while the topology size is unchanged. */
  private ws: { n: number; m: number; done: Uint8Array; heap: MinHeap; dist: Float64Array; via: Int32Array } | null = null;

  private workspace(): { done: Uint8Array; heap: MinHeap; dist: Float64Array; via: Int32Array } {
    const n = this.nodeList.length, m = this.edgeList.length;
    if (!this.ws || this.ws.n !== n || this.ws.m !== m) {
      this.ws = { n, m, done: new Uint8Array(n), heap: new MinHeap(Math.max(1, 2 * m + 1)), dist: new Float64Array(n), via: new Int32Array(n) };
    }
    return this.ws;
  }

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

  isTraversable(e: S1Edge): boolean {
    return e.state.status === 'OPEN';
  }

  /** Shortest-path distances from `from` to every node (index order of `nodes`); ∞ if cut off. */
  distancesFrom(from: number, options: RouteOptions = {}): Float64Array {
    const n = this.nodeList.length, dist = new Float64Array(n).fill(Infinity);
    this.search(this.indexOf(from), -1, options, false, dist, null);
    return dist;
  }

  /** d(from, to); Infinity when the graph is disconnected between them. */
  distance(from: number, to: number, options: RouteOptions = {}): number {
    return this.distancesFrom(from, options)[this.indexOf(to)];
  }

  shortestPath(from: number, to: number, options: RouteOptions = {}): S1Route {
    const src = this.indexOf(from), dst = this.indexOf(to), ws = this.workspace();
    const dist = ws.dist.fill(Infinity), viaEdge = ws.via.fill(-1);
    this.search(src, dst, options, options.algorithm === 'astar', dist, viaEdge);
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
  private search(src: number, dst: number, options: RouteOptions, astar: boolean, dist: Float64Array, viaEdge: Int32Array | null): void {
    const ws = this.workspace(), done = ws.done.fill(0), heap = ws.heap;
    heap.size = 0;
    const goal = dst >= 0 ? this.nodeList[dst] : null;
    const cost = options.cost, scale = astar && goal ? options.heuristicPerMeter ?? (cost ? 0 : 1) : 0;
    const gx = goal?.x ?? 0, gy = goal?.y ?? 0, nodes = this.nodeList;
    dist[src] = 0;
    heap.push(scale * Math.hypot(nodes[src].x - gx, nodes[src].y - gy), src);
    while (heap.size > 0) {
      const u = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === dst) return;
      const uid = this.nodeList[u].id;
      for (const eid of this.incident[u]) {
        const e = this.edgeList[eid];
        if (!this.isTraversable(e)) continue;
        const v = this.indexOf(e.a === uid ? e.b : e.a);
        const d = dist[u] + (cost ? cost(e) : e.length);
        if (d < dist[v]) {
          dist[v] = d;
          if (viaEdge) viaEdge[v] = eid;
          heap.push(d + scale * Math.hypot(nodes[v].x - gx, nodes[v].y - gy), v);
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
