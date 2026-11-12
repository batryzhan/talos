/**
 * Experiment S1 (scientific documentation §2.5): 150 single-edge-closure scenarios on three maps —
 * warehouse, workshop, inspection — 50 each, with local learning of edge times (equation 6).
 *
 * Per scenario (seed = scenario index, fully deterministic):
 *  1. Hidden truth: every edge gets a speed factor f_e ∈ (0, 1] (congestion, ramps, cluttered
 *     aisles); its true traversal time is t_e = len_e / (v·f_e). The robot only knows the geometric
 *     prior t̂_e = len_e / v.
 *  2. Learning: the robot drives LEARNING_RUNS missions over the map (A* on its current t̂_e) and
 *     updates every traversed edge with t̂_{e,m} = (1 − α)·t̂_{e,m−1} + α·t_{e,m}, α = 0.25, from a
 *     noisy observation t_{e,m} = t_e·(1 ± 10 %).
 *  3. Closure: one edge of the route corridor (incident to a node of the original route) closes. Compared:
 *       - the original route (Dijkstra on length, planned before the closure) — still passable?
 *       - baseline router without adaptation: Dijkstra on edge lengths over the cut graph;
 *       - adaptive router: A* on the learned t̂_e over the cut graph.
 *     Both routes are scored by the TRUE travel time Σ t_e.
 *
 * Pure TypeScript, no DOM; the async runner yields between chunks so the UI never blocks.
 */
import { S1Graph } from './s1Graph';
import { Rng } from '../../swarm/rng';
import type { S1Edge } from '../../types/routing';

export const S1_SCENARIOS = 150;
export const S1_MAPS = ['warehouse', 'workshop', 'inspection'] as const;
export type S1MapId = (typeof S1_MAPS)[number];
export const LEARNING_RUNS = 8;
export const S1_ALPHA = 0.25;
export const ROBOT_SPEED = 1.0;
const NOISE = 0.1;

export interface S1ScenarioResult {
  index: number;
  map: S1MapId;
  start: number;
  goal: number;
  closedEdge: number;
  /** The closed edge lay on the original route. */
  onRoute: boolean;
  /** The original route avoids the closed edge (no replanning needed). */
  originalPassable: boolean;
  /** A route exists in the cut graph (replanning succeeds). */
  reachable: boolean;
  /** True travel time (s) of the baseline / adaptive route; NaN when unreachable. */
  tStatic: number;
  tLearned: number;
  /** (tStatic − tLearned) / tStatic; NaN when unreachable. */
  gain: number;
  /** Mean relative estimate error |t̂ − t| / t on the task's route edges after m = 0 … LEARNING_RUNS runs. */
  estError: number[];
}

export interface S1MapSummary { map: S1MapId; cases: number; originalPassable: number; reachable: number; meanStatic: number; meanLearned: number; meanGain: number }

export interface S1Summary {
  scenarios: S1ScenarioResult[];
  total: number;
  originalPassable: number;
  reachable: number;
  meanStatic: number;
  meanLearned: number;
  meanGain: number;
  faster: number;
  equal: number;
  slower: number;
  /** Mean estimate error after m runs (m = 0 … LEARNING_RUNS). */
  learningCurve: number[];
  maps: S1MapSummary[];
}

// ───────────────────────── maps ─────────────────────────

/** Warehouse: three long aisles between racks, cross-aisles at both ends and in the middle. */
function warehouse(g: S1Graph): void {
  const cols = 9, rows = 3, dx = 4, dy = 6;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g.addNode(r * cols + c, c * dx, r * dy);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) g.addEdge(r * cols + c, r * cols + c + 1);
  for (const c of [0, 4, 8]) for (let r = 0; r < rows - 1; r++) g.addEdge(r * cols + c, (r + 1) * cols + c);
  // A dock spur off the middle aisle.
  g.addNode(100, 16, 15); g.addEdge(cols + 4, 100);
}

/** Workshop: 6 × 6 grid with machine footprints removed and a few diagonal shortcuts. */
function workshop(g: S1Graph): void {
  const n = 6, d = 3;
  const machine = new Set(['1,1', '1,2', '3,3', '4,3', '3,1', '4,4']);
  const id = (i: number, j: number): number => j * n + i;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (!machine.has(`${i},${j}`)) g.addNode(id(i, j), i * d, j * d);
  const has = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < n && j < n && !machine.has(`${i},${j}`);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!has(i, j)) continue;
    if (has(i + 1, j)) g.addEdge(id(i, j), id(i + 1, j));
    if (has(i, j + 1)) g.addEdge(id(i, j), id(i, j + 1));
    if ((i + j) % 3 === 0 && has(i + 1, j + 1) && has(i + 1, j) && has(i, j + 1)) g.addEdge(id(i, j), id(i + 1, j + 1));
  }
}

/** Inspection: a perimeter loop with a chord and dead-end spurs to the inspection points. */
function inspection(g: S1Graph): void {
  const ring = 10, R = 12;
  for (let k = 0; k < ring; k++) g.addNode(k, R * Math.cos((2 * Math.PI * k) / ring), R * Math.sin((2 * Math.PI * k) / ring));
  for (let k = 0; k < ring; k++) g.addEdge(k, (k + 1) % ring);
  g.addNode(20, 0, 0); g.addEdge(0, 20); g.addEdge(20, 5);
  // Spurs (bridges): closing one cuts its inspection point off.
  for (const k of [1, 3, 4, 7, 8]) {
    const a = g.node(k), ux = a.x / R, uy = a.y / R;
    g.addNode(30 + k, a.x + ux * 4, a.y + uy * 4); g.addEdge(k, 30 + k);
  }
  g.addNode(50, 4, 6); g.addEdge(20, 50); g.addNode(51, 7, 3); g.addEdge(50, 51); g.addEdge(51, 2);
}

const BUILDERS: Record<S1MapId, (g: S1Graph) => void> = { warehouse, workshop, inspection };

export function buildS1Map(map: S1MapId): S1Graph {
  const g = new S1Graph();
  BUILDERS[map](g);
  return g;
}

// ───────────────────────── one scenario ─────────────────────────

function hops(g: S1Graph, from: number, to: number): number {
  const r = g.shortestPath(from, to, { cost: () => 1 });
  return r.status === 'FOUND' ? r.edges.length : Infinity;
}

function trueTime(g: S1Graph, edges: readonly number[], t: Float64Array): number {
  let s = 0;
  for (const e of edges) s += t[g.edge(e).id];
  return s;
}

function estimateError(est: Float64Array, truth: Float64Array, ids: Int32Array): number {
  let s = 0;
  for (const i of ids) s += Math.abs(est[i] - truth[i]) / truth[i];
  return ids.length ? s / ids.length : 0;
}

export function runS1Scenario(index: number): S1ScenarioResult {
  const map = S1_MAPS[index % S1_MAPS.length];
  const g = buildS1Map(map), rng = new Rng(9000 + index);
  const nodes = g.nodes, E = g.edges.length;

  // 1. Hidden truth: mostly free-flowing edges, ~30 % congested ones.
  const truth = new Float64Array(E), est = new Float64Array(E);
  for (const e of g.edges) {
    const f = rng.random() < 0.3 ? rng.uniform(0.2, 0.45) : rng.uniform(0.7, 1);
    truth[e.id] = e.length / (ROBOT_SPEED * f);
    est[e.id] = e.length / ROBOT_SPEED;
  }
  const learnedCost = (e: S1Edge): number => est[e.id];
  // Learned estimates may undershoot the truth by the observation noise: keep A* admissible.
  const learnedOptions = { algorithm: 'astar' as const, cost: learnedCost, heuristicPerMeter: (1 - NOISE) / ROBOT_SPEED };

  const pick = (): number => nodes[Math.floor(rng.random() * nodes.length)].id;
  let start = pick(), goal = pick();
  for (let k = 0; k < 200 && (start === goal || hops(g, start, goal) < 3); k++) { start = pick(); goal = pick(); }

  // Edges the estimate error is measured on: the true-fastest and the geometric route of the task.
  const tracked = new Set<number>();
  for (const r of [g.shortestPath(start, goal, { cost: e => truth[e.id] }), g.shortestPath(start, goal)]) if (r.status === 'FOUND') r.edges.forEach(id => tracked.add(id));
  const trackedIds = Int32Array.from(tracked);

  // 2. Learning runs (equation 6).
  const estError = [estimateError(est, truth, trackedIds)];
  for (let m = 0; m < LEARNING_RUNS; m++) {
    let a = start, b = goal;
    if (m % 2 === 1) { a = pick(); b = pick(); while (b === a) b = pick(); }
    const r = g.shortestPath(a, b, learnedOptions);
    if (r.status === 'FOUND') for (const id of r.edges) {
      const observed = truth[id] * (1 + rng.uniform(-NOISE, NOISE));
      est[id] = (1 - S1_ALPHA) * est[id] + S1_ALPHA * observed;
    }
    estError.push(estimateError(est, truth, trackedIds));
  }

  // 3. Closure.
  const original = g.shortestPath(start, goal);
  // A local disruption: the closed edge is drawn uniformly among the edges touching the original
  // route's corridor (any edge incident to one of its nodes).
  const corridor: number[] = [];
  if (original.status === 'FOUND') {
    const on = new Set(original.nodes);
    for (const e of g.edges) if (on.has(e.a) || on.has(e.b)) corridor.push(e.id);
  }
  const closedEdge = corridor.length ? corridor[Math.floor(rng.random() * corridor.length)] : Math.floor(rng.random() * E);
  const onRoute = original.status === 'FOUND' && original.edges.includes(closedEdge);
  g.closeEdge(closedEdge, 'BLOCKED');
  const stat = g.shortestPath(start, goal);
  const learned = g.shortestPath(start, goal, learnedOptions);
  const reachable = stat.status === 'FOUND' && learned.status === 'FOUND';
  const tStatic = stat.status === 'FOUND' ? trueTime(g, stat.edges, truth) : NaN;
  const tLearned = learned.status === 'FOUND' ? trueTime(g, learned.edges, truth) : NaN;

  return {
    index, map, start, goal, closedEdge, onRoute,
    originalPassable: original.status === 'FOUND' && !onRoute,
    reachable, tStatic, tLearned,
    gain: reachable ? (tStatic - tLearned) / tStatic : NaN,
    estError,
  };
}

// ───────────────────────── summary / runner ─────────────────────────

const mean = (xs: readonly number[]): number => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
};

export function summariseS1(scenarios: S1ScenarioResult[]): S1Summary {
  const ok = scenarios.filter(s => s.reachable);
  const maps = S1_MAPS.map(map => {
    const ss = scenarios.filter(s => s.map === map), r = ss.filter(s => s.reachable);
    return {
      map, cases: ss.length,
      originalPassable: ss.filter(s => s.originalPassable).length,
      reachable: r.length,
      meanStatic: mean(r.map(s => s.tStatic)), meanLearned: mean(r.map(s => s.tLearned)), meanGain: mean(r.map(s => s.gain)),
    };
  });
  return {
    scenarios,
    total: scenarios.length,
    originalPassable: scenarios.filter(s => s.originalPassable).length,
    reachable: ok.length,
    meanStatic: mean(ok.map(s => s.tStatic)),
    meanLearned: mean(ok.map(s => s.tLearned)),
    meanGain: mean(ok.map(s => s.gain)),
    faster: ok.filter(s => s.tLearned < s.tStatic - 1e-9).length,
    equal: ok.filter(s => Math.abs(s.tLearned - s.tStatic) <= 1e-9).length,
    slower: ok.filter(s => s.tLearned > s.tStatic + 1e-9).length,
    learningCurve: Array.from({ length: LEARNING_RUNS + 1 }, (_, m) => mean(scenarios.map(s => s.estError[m]))),
    maps,
  };
}

/** Synchronous run of scenarios [0, n) — tests and headless use. */
export function runS1Experiment(n = S1_SCENARIOS): S1Summary {
  return summariseS1(Array.from({ length: n }, (_, i) => runS1Scenario(i)));
}

const yieldToUi = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/** The 150-scenario series in chunks of `chunk`, yielding to the browser between chunks. */
export async function runS1Series(onProgress: (done: number, total: number) => void, signal?: AbortSignal, chunk = 10): Promise<S1Summary> {
  const out: S1ScenarioResult[] = [];
  onProgress(0, S1_SCENARIOS);
  for (let i = 0; i < S1_SCENARIOS; i++) {
    out.push(runS1Scenario(i));
    if ((i + 1) % chunk === 0 || i === S1_SCENARIOS - 1) {
      onProgress(i + 1, S1_SCENARIOS);
      await yieldToUi();
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
  }
  return summariseS1(out);
}

export interface GainBin { label: string; from: number; to: number; count: number }

/**
 * Histogram of per-scenario gains in 5 % bins, over the scenarios where the learned route differs
 * from the geometric one (identical routes have gain 0 by construction and are counted separately).
 */
export function gainHistogram(scenarios: readonly S1ScenarioResult[], width = 0.05): GainBin[] {
  const g = scenarios.filter(s => s.reachable && Math.abs(s.tLearned - s.tStatic) > 1e-9).map(s => s.gain);
  if (!g.length) return [];
  const lo = Math.floor(Math.min(...g) / width) * width, hi = Math.max(...g);
  const bins: GainBin[] = [];
  for (let from = lo; from <= hi + 1e-9; from += width) bins.push({ label: `${Math.round(from * 100)}`, from, to: from + width, count: 0 });
  for (const x of g) bins[Math.min(bins.length - 1, Math.floor((x - lo) / width + 1e-9))].count++;
  return bins;
}
