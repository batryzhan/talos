/**
 * /mining — «Подземный патруль»: an underground coal / ore mine (120 × 120 m drift graph) worked by
 * 18 Strafer robots without GPS (CLAUDE.md §4.3).
 *
 *   Scanner-Light-1..6  LIDAR_ILLUMINATOR  go first, digitise the drifts (LiDAR), light the faces,
 *                                         find roof cracks → the edge is closed (S1) and the swarm reroutes
 *   Miner-Drill-1..6    ROTARY_EXCAVATOR   MINING_VEIN — only with a Scanner-Light within 15 m
 *   Hauler-Cart-1..6    ORE_HOPPER_CART    LOADING_ORE → HAULING_TO_SHAFT → DUMPING_ORE, faces
 *                                         allocated by the J_ij auction (queue-aware), charging bay hot-swap
 */
import { SwarmAgent, DriveStatus } from '../core/agents/SwarmAgent';
import { applyModuleCommand, createModule, type ModuleCapability } from '../core/agents/taskModule';
import { batteryRisk, runAuction, type CostTerms } from '../core/allocation/auction';
import { ResourceMutex } from '../core/coordination/ResourceMutex';
import { RouteNetwork } from '../core/routing/RouteNetwork';
import { S1Graph } from '../core/routing/s1Graph';
import { HOT_SWAP_THRESHOLD, WorkflowMission, type RestoreRecord, type WorkflowOptions } from './workflow/WorkflowMission';
import type { MiningKpi, WorkflowBadge, WorkflowSnapshot } from './workflow/types';

export const SHAFT = { id: 4, x: 0, y: 0 } as const;
export const HOPPER_KG = 150;
export const LIGHT_RADIUS = 15;
const MINE_RATE = 1.8;
const LOAD_RATE = 30;
const FACE_STOCK_MAX = 320;

/** Drift nodes (Z-up, m). 0–8 ring lattice, 9–12 extensions, 13–18 faces, 19 charging bay, 20 dump. */
export const MINE_NODES: readonly [number, number][] = [
  [-30, -30], [0, -30], [30, -30], [-30, 0], [0, 0], [30, 0], [-30, 30], [0, 30], [30, 30],
  [-50, 0], [50, 0], [0, 50], [0, -50],
  [-50, 18], [50, -18], [18, 50], [-18, -50], [-30, 50], [30, -50],
  [-9, -7], [7, -5],
];
export const MINE_EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [0, 3], [3, 6], [1, 4], [4, 7], [2, 5], [5, 8],
  [3, 9], [5, 10], [7, 11], [1, 12],
  [9, 13], [10, 14], [11, 15], [12, 16], [6, 17], [2, 18],
  [4, 19], [4, 20],
];
export const FACE_NODES = [13, 14, 15, 16, 17, 18] as const;
/** Main haulage drifts (wider, with rails). */
export const MAIN_EDGES = new Set([2, 3, 8, 9]);

export interface Face { id: number; node: number; name: string; x: number; y: number; dirX: number; dirY: number; stock: number; mined: number; miner: number | null; scanner: number | null; haulers: number[] }
interface Collapse { edge: number; x: number; y: number; t: number; inspected: boolean }

type ScanJob = { kind: 'escort'; face: Face } | { kind: 'inspect'; collapse: Collapse; until: number };
interface HaulJob { face: Face; stage: 'TO_FACE' | 'QUEUE' | 'LOADING_ORE' | 'HAULING_TO_SHAFT' | 'DUMPING_ORE'; timer: number }

export interface MiningOptions extends WorkflowOptions { crackEdges?: number[] }

export class MiningMission extends WorkflowMission {
  readonly kind = 'mining' as const;
  readonly graph = new S1Graph();
  readonly network: RouteNetwork;
  readonly faces: Face[] = [];
  readonly scanned: Uint8Array;
  readonly collapses: Collapse[] = [];
  readonly cracks = new Set<number>();
  readonly scanJobs = new Map<number, ScanJob>();
  readonly haulJobs = new Map<number, HaulJob>();
  readonly minerFace = new Map<number, Face>();
  readonly charging = new Map<number, RestoreRecord>();
  readonly faceMutex = new ResourceMutex(1);
  readonly loadKg = new Map<number, number>();
  /** «Режим LiDAR-визора»: darker scene, stronger laser contrast (read by the view). */
  lidarVisor = false;
  minedKg = 0;
  deliveredKg = 0;
  private readonly gated = new Set<number>();

  constructor(o: MiningOptions = {}) {
    super(o);
    MINE_NODES.forEach(([x, y], i) => this.graph.addNode(i, x, y));
    for (const [a, b] of MINE_EDGES) this.graph.addEdge(a, b);
    this.scanned = new Uint8Array(this.graph.edges.length);
    // The shaft station and its charging bay / dump are surveyed; everything else is dark.
    for (const e of this.graph.edges) if (e.b >= 19) this.scanned[e.id] = 1;
    FACE_NODES.forEach((node, i) => {
      const n = this.graph.node(node), from = this.graph.edges.find(e => e.b === node)!, p = this.graph.node(from.a);
      const len = Math.hypot(n.x - p.x, n.y - p.y);
      this.faces.push({ id: i + 1, node, name: `Забой F${i + 1}`, x: n.x, y: n.y, dirX: (n.x - p.x) / len, dirY: (n.y - p.y) / len, stock: 140, mined: 0, miner: null, scanner: null, haulers: [] });
    });
    // Hidden roof cracks on ring drifts (closing them never cuts a face off).
    const ring = [0, 1, 4, 5, 6, 7, 10, 11];
    const picks = o.crackEdges ?? [ring[Math.floor(this.rng.random() * 4)], ring[4 + Math.floor(this.rng.random() * 4)]];
    for (const e of picks) this.cracks.add(e);
    const add = (name: string, team: string, cap: ModuleCapability, vmax: number, k: number): SwarmAgent => {
      const id = this.agents.length + 1;
      const a = new SwarmAgent({ id, name, team, module: createModule(`${cap}-${id}`, cap), x: -5 + (k % 3) * 2.2, y: (team === 'Scanner-Light' ? -3.2 : team === 'Miner-Drill' ? 0 : 3.2) + (k >= 3 ? 1.2 : 0) + (k % 3 === 1 ? 0.3 : 0), theta: 0, vmax, battery: 0.7 + this.rng.random() * 0.28 });
      a.drainIdle = 0.0004; a.drainMove = 0.0012; a.drainWork = 0.002;
      this.agents.push(a);
      return a;
    };
    for (let i = 0; i < 6; i++) { const s = add(`Scanner-Light-${i + 1}`, 'Scanner-Light', 'LIDAR_ILLUMINATOR', 1.55, i); s.drainWork = 0.0011; s.battery = 0.8 + this.rng.random() * 0.18; }
    for (let i = 0; i < 6; i++) add(`Miner-Drill-${i + 1}`, 'Miner-Drill', 'ROTARY_EXCAVATOR', 1.45, i);
    for (let i = 0; i < 6; i++) { const a = add(`Hauler-Cart-${i + 1}`, 'Hauler-Cart', 'ORE_HOPPER_CART', 1.5, i); this.loadKg.set(a.id, 0); }
    // Spread the start so nobody overlaps in the shaft chamber.
    this.agents.forEach((a, i) => { const ang = (i / 18) * Math.PI * 2; a.x = Math.cos(ang) * 4.2; a.y = Math.sin(ang) * 4.2; a.theta = ang; });
    this.network = new RouteNetwork(this.graph, this.rng.fork(), this.agents);
    this.teams.push(
      { id: 'Scanner-Light', capability: 'LIDAR_ILLUMINATOR', size: 6 },
      { id: 'Miner-Drill', capability: 'ROTARY_EXCAVATOR', size: 6 },
      { id: 'Hauler-Cart', capability: 'ORE_HOPPER_CART', size: 6 },
    );
    this.log('СПУСК: 18 роботов в околоствольном дворе — без GPS, навигация по LiDAR; сканеры уходят первыми');
  }

  // ───────────────────────── geometry helpers ─────────────────────────

  /** Point where a robot works at a face: drill at the wall, scanner behind, haulers beside / queued. */
  facePoint(f: Face, role: 'drill' | 'light' | 'load' | 'queue'): { x: number; y: number; theta: number } {
    const back = role === 'drill' ? 1.2 : role === 'light' ? 3.4 : role === 'load' ? 2.6 : 6.5;
    const side = role === 'load' ? 0.85 : role === 'light' ? -0.8 : 0;
    return { x: f.x - f.dirX * back - f.dirY * side, y: f.y - f.dirY * back + f.dirX * side, theta: Math.atan2(f.dirY, f.dirX) };
  }

  /** Point of the bunker grate where haulers tip their hopper. */
  get dumpPoint(): { x: number; y: number; theta: number } { const n = this.graph.node(20); return { x: n.x, y: n.y, theta: -0.6 }; }
  get chargerPoint(): { x: number; y: number } { const n = this.graph.node(19); return { x: n.x, y: n.y }; }

  /** Distance from a point to an edge segment and the edge parameter. */
  edgeDistance(edge: number, x: number, y: number): number {
    const e = this.graph.edge(edge), a = this.graph.node(e.a), b = this.graph.node(e.b);
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
    return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
  }

  /** Edge whose drift contains the point (nearest centre line). */
  edgeAt(x: number, y: number): number {
    let best = 0, bd = Infinity;
    for (const e of this.graph.edges) { const d = this.edgeDistance(e.id, x, y); if (d < bd) { bd = d; best = e.id; } }
    return best;
  }

  /** A Scanner-Light lights (x, y) when it is within 15 m in the same drift system and switched on. */
  litBy(x: number, y: number): SwarmAgent | null {
    let best: SwarmAgent | null = null, bd = LIGHT_RADIUS;
    for (const a of this.agents) {
      if (a.module.capability !== 'LIDAR_ILLUMINATOR' || !a.active || a.hold) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  explored(): number {
    let all = 0, done = 0;
    for (const e of this.graph.edges) { all += e.length; if (this.scanned[e.id]) done += e.length; }
    return done / all;
  }

  // ───────────────────────── operator actions ─────────────────────────

  /**
   * «Спровоцировать обвал штрека»: collapse the next drift ahead of a loaded hauler (or of the busiest
   * hauler route); the edge closes (S1), every robot whose route used it replans, and the nearest
   * scanner goes to map the fall with its red hazard grid.
   */
  triggerCollapse(edgeId?: number): Collapse | null {
    let edge = edgeId ?? -1;
    if (edge < 0) {
      const carts = this.agents.filter(a => a.module.capability === 'ORE_HOPPER_CART' && a.hasRoute).sort((p, q) => q.cargo - p.cargo);
      for (const a of carts) {
        for (let k = a.wpIndex; k < a.wpEdge.length; k++) { const e = a.wpEdge[k]; if (e >= 0 && this.canClose(e)) { edge = e; break; } }
        if (edge >= 0) break;
      }
    }
    if (edge < 0) { const pool = [2, 3, 8, 9, 0, 1, 4, 5].filter(e => this.canClose(e)); if (!pool.length) return null; edge = pool[Math.floor(this.rng.random() * pool.length)]; }
    return this.collapse(edge, 'ОБВАЛ');
  }

  /** A drift may close only if every face stays reachable from the shaft. */
  canClose(edge: number): boolean {
    const e = this.graph.edge(edge);
    if (e.state.status === 'CLOSED' || e.b >= 13) return false;
    this.graph.closeEdge(edge);
    const d = this.graph.distancesFrom(SHAFT.id);
    this.graph.openEdge(edge);
    return FACE_NODES.every(n => Number.isFinite(d[n]));
  }

  private collapse(edge: number, kind: 'ОБВАЛ' | 'ТРЕЩИНА'): Collapse {
    const e = this.graph.edge(edge), a = this.graph.node(e.a), b = this.graph.node(e.b);
    const c: Collapse = { edge, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: this.time, inspected: false };
    this.collapses.push(c);
    this.cracks.delete(edge);
    const replanned = this.network.closeEdge(edge, 'COLLAPSE', this.time);
    this.log(`${kind}: штрек E${edge} (${e.a}↔${e.b}) закрыт по S1 · караван перестраивает маршрут, перепланировано ${replanned.length}`);
    // Nearest free-ish scanner maps the fall.
    const scanners = this.agents.filter(s => s.module.capability === 'LIDAR_ILLUMINATOR' && s.active && this.scanJobs.get(s.id)?.kind !== 'inspect');
    if (scanners.length) {
      const result = runAuction([{ id: 0, capability: 'LIDAR_ILLUMINATOR', priority: 1 }], scanners.map(s => ({ id: s.id, capability: 'LIDAR_ILLUMINATOR' })), (id): CostTerms => {
        const s = this.agent(id)!, job = this.scanJobs.get(id);
        return { t: this.network.travelTime(s, c.x, c.y), q: job?.kind === 'escort' && job.face.miner !== null ? 2 : 0, r: batteryRisk(s.battery), u: 0 };
      });
      const w = result.awards[0];
      if (w) {
        const s = this.agent(w.agentId)!, prev = this.scanJobs.get(s.id);
        if (prev?.kind === 'escort') prev.face.scanner = null;
        this.scanJobs.set(s.id, { kind: 'inspect', collapse: c, until: Infinity });
        s.bid = w.cost; s.target = `обвал E${edge}`;
        const near = Math.hypot(s.x - a.x, s.y - a.y) < Math.hypot(s.x - b.x, s.y - b.y) ? a : b;
        const dx = c.x - near.x, dy = c.y - near.y, L = Math.hypot(dx, dy);
        this.network.plan(s, near.x + dx / L * Math.max(0, L - 6), near.y + dy / L * Math.max(0, L - 6), Math.atan2(dy, dx), near.id);
      }
    }
    return c;
  }

  // ───────────────────────── control (50 Hz) ─────────────────────────

  protected control(dt: number): void {
    if (this.holding) { for (const a of this.agents) a.drive(dt); return; }
    const t = this.time;
    this.gated.clear();
    for (const a of this.agents) {
      a.speedScale = 1;
      const hj = this.haulJobs.get(a.id);
      if (hj && (hj.stage === 'TO_FACE' || hj.stage === 'QUEUE')) this.faceGate(a, hj);
      if (hj && hj.stage === 'HAULING_TO_SHAFT') this.dumpGate(a);
      const status = this.network.follow(a, t, dt);
      if (this.charging.has(a.id)) { this.charge(a, dt, status); continue; }
      if (a.battery < HOT_SWAP_THRESHOLD && a.active) { this.toCharger(a); continue; }
      switch (a.module.capability) {
        case 'LIDAR_ILLUMINATOR': this.scanner(a, dt, status); break;
        case 'ROTARY_EXCAVATOR': this.miner(a, dt, status); break;
        case 'ORE_HOPPER_CART': this.hauler(a, dt, status); break;
        default: break;
      }
    }
  }

  protected radio(): void {
    if (this.holding) return;
    const tick = this.clock.radioTick;
    // LiDAR survey: a drift is scanned once a scanner drives it; hidden cracks are found in range.
    for (const s of this.agents) {
      if (s.module.capability !== 'LIDAR_ILLUMINATOR' || !s.active) continue;
      for (const e of this.graph.edges) {
        const d = this.edgeDistance(e.id, s.x, s.y);
        if (d < 2.6 && !this.scanned[e.id]) { this.scanned[e.id] = 1; if (e.b >= 13 && e.b <= 18) this.log(`${s.name}: LiDAR-скан ${this.faces.find(f => f.node === e.b)!.name} — жила оцифрована, свод устойчив`); }
        if (this.cracks.has(e.id) && d < 9 && this.canClose(e.id)) { this.log(`${s.name}: LiDAR обнаружил трещину свода в штреке E${e.id} — красный контур опасности`); this.collapse(e.id, 'ТРЕЩИНА'); }
      }
    }
    if (tick % 20 === 0) { this.dispatchScanners(); this.dispatchMiners(); }
    if (tick % 10 === 5) this.dispatchHaulers();
  }

  // ───────────────────────── scanners ─────────────────────────

  private dispatchScanners(): void {
    const free = this.agents.filter(a => a.module.capability === 'LIDAR_ILLUMINATOR' && a.active && !this.charging.has(a.id) && !this.scanJobs.has(a.id));
    if (!free.length) return;
    const faces = this.faces.filter(f => f.scanner === null);
    if (!faces.length) return;
    const caches = new Map(free.map(a => [a.id, this.network.timesFrom(a)]));
    const result = runAuction(faces.map(f => ({ id: f.id, capability: 'LIDAR_ILLUMINATOR', priority: f.miner !== null ? 2 : 1 })), free.map(a => ({ id: a.id, capability: 'LIDAR_ILLUMINATOR' })), (id, fid): CostTerms => {
      const a = this.agent(id)!, f = this.faces[fid - 1], p = this.facePoint(f, 'light');
      return { t: this.network.travelTime(a, p.x, p.y, f.node, caches.get(id)), q: 0, r: batteryRisk(a.battery), u: this.network.uncertainty(a, p.x, p.y, f.node) };
    });
    for (const w of result.awards) {
      const a = this.agent(w.agentId)!, f = this.faces[w.taskId - 1], p = this.facePoint(f, 'light');
      f.scanner = a.id;
      this.scanJobs.set(a.id, { kind: 'escort', face: f });
      a.bid = w.cost; a.target = f.name; a.task = 'SCANNING_DRIFT';
      this.network.plan(a, p.x, p.y, p.theta, f.node);
    }
  }

  private scanner(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const job = this.scanJobs.get(a.id);
    a.working = true; // LiDAR and floodlights always on
    a.spin += dt * 8;
    if (!job) { a.task = a.hasRoute ? 'SCANNING_DRIFT' : 'STANDBY'; a.progress = this.explored(); a.aimX = a.x + Math.cos(a.theta) * 5; a.aimY = a.y + Math.sin(a.theta) * 5; return; }
    if (job.kind === 'inspect') {
      const c = job.collapse;
      a.aimX = c.x; a.aimY = c.y; a.aimZ = 1;
      if (status === DriveStatus.Arrived || (!a.hasRoute && job.until === Infinity)) { job.until = this.time + 8; a.task = 'SCANNING_COLLAPSE'; }
      if (job.until !== Infinity) {
        a.progress = Math.min(1, 1 - (job.until - this.time) / 8);
        if (this.time >= job.until) { c.inspected = true; this.scanJobs.delete(a.id); a.bid = null; a.target = ''; this.log(`${a.name}: обвал E${c.edge} оцифрован, объём завала передан рою — ребро остаётся закрытым`); }
      } else a.task = 'TO_COLLAPSE';
      return;
    }
    const f = job.face, p = this.facePoint(f, 'light');
    a.aimX = f.x; a.aimY = f.y; a.aimZ = 1.2;
    if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - p.x, a.y - p.y) < 0.2)) a.task = 'ILLUMINATING_FACE';
    else if (!a.hasRoute) this.network.plan(a, p.x, p.y, p.theta, f.node);
    else a.task = 'SCANNING_DRIFT';
    a.progress = a.task === 'ILLUMINATING_FACE' ? 1 : 1 - Math.min(1, a.remaining() / 60);
  }

  // ───────────────────────── miners ─────────────────────────

  private dispatchMiners(): void {
    const free = this.agents.filter(a => a.module.capability === 'ROTARY_EXCAVATOR' && a.active && !this.charging.has(a.id) && !this.minerFace.has(a.id));
    const faces = this.faces.filter(f => f.miner === null);
    if (!free.length || !faces.length) return;
    const result = runAuction(faces.map(f => ({ id: f.id, capability: 'ROTARY_EXCAVATOR', priority: f.scanner !== null ? 1 : 0 })), free.map(a => ({ id: a.id, capability: 'ROTARY_EXCAVATOR' })), (id, fid): CostTerms => {
      const a = this.agent(id)!, f = this.faces[fid - 1], p = this.facePoint(f, 'drill');
      return { t: this.network.travelTime(a, p.x, p.y, f.node), q: 0, r: batteryRisk(a.battery), u: this.network.uncertainty(a, p.x, p.y, f.node) };
    });
    for (const w of result.awards) {
      const a = this.agent(w.agentId)!, f = this.faces[w.taskId - 1];
      f.miner = a.id;
      this.minerFace.set(a.id, f);
      a.bid = w.cost; a.target = f.name;
    }
  }

  private miner(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const f = this.minerFace.get(a.id);
    a.working = false;
    a.extension = Math.max(0, a.extension - dt);
    if (!f) { a.task = 'IDLE'; a.progress = 0; return; }
    const p = this.facePoint(f, 'drill');
    const at = Math.hypot(a.x - p.x, a.y - p.y) < 0.15 && !a.hasRoute;
    // Follow the scanner: the drift to the face must be surveyed before the drill moves in.
    const faceEdge = this.graph.edges.find(e => e.b === f.node)!.id;
    if (!at) {
      if (!a.hasRoute) {
        // Drills move out behind their scanner; the face itself waits for the survey and the light.
        if (f.scanner !== null || this.scanned[faceEdge]) this.network.plan(a, p.x, p.y, p.theta, f.node);
        else { a.task = 'WAITING_SCAN'; return; }
      }
      if (status !== DriveStatus.Arrived) { a.task = 'TO_FACE'; a.progress = 0; return; }
    }
    a.aimX = f.x; a.aimY = f.y;
    const light = this.litBy(f.x, f.y);
    if (!light || !this.scanned[faceEdge]) { a.task = 'WAITING_LIGHT'; if (a.module.state === 'ACTIVE') applyModuleCommand(a.module, this.actions.issue(this.epoch, 'SAFE')); return; }
    if (f.stock >= FACE_STOCK_MAX) { a.task = 'FACE_STOCK_FULL'; return; }
    // Idempotent module sequence: RESET (after SAFE) → ARM → START.
    if (a.module.state === 'SAFE' || a.module.state === 'FAULT') applyModuleCommand(a.module, this.actions.issue(this.epoch, 'RESET'));
    if (a.module.state === 'IDLE') applyModuleCommand(a.module, this.actions.issue(this.epoch, 'ARM'));
    if (a.module.state === 'ARMED') applyModuleCommand(a.module, this.actions.issue(this.epoch, 'START'));
    a.task = 'MINING_VEIN';
    a.working = true;
    a.spin += dt * 9;
    a.extension = 0.5 + 0.5 * Math.sin(this.time * 1.3 + a.id);
    const kg = MINE_RATE * dt;
    f.stock += kg; f.mined += kg; this.minedKg += kg;
    a.progress = f.stock / FACE_STOCK_MAX;
  }

  // ───────────────────────── haulers ─────────────────────────

  private dispatchHaulers(): void {
    const free = this.agents.filter(a => a.module.capability === 'ORE_HOPPER_CART' && a.active && !this.charging.has(a.id) && !this.haulJobs.has(a.id) && (this.loadKg.get(a.id) ?? 0) < 1);
    if (!free.length) return;
    // A face needs a cart when its stock (minus what queued carts will take) passes 60 kg.
    const tasks = this.faces.filter(f => f.miner !== null && f.stock - f.haulers.length * HOPPER_KG > -HOPPER_KG * 0.6 && f.haulers.length < 2);
    if (!tasks.length) return;
    const caches = new Map(free.map(a => [a.id, this.network.timesFrom(a)]));
    const result = runAuction(tasks.map(f => ({ id: f.id, capability: 'ORE_HOPPER_CART', priority: f.stock > HOPPER_KG ? 1 : 0 })), free.map(a => ({ id: a.id, capability: 'ORE_HOPPER_CART' })), (id, fid): CostTerms => {
      const a = this.agent(id)!, f = this.faces[fid - 1], p = this.facePoint(f, 'load');
      // Queue weight: carts already serving the face (narrow face drift — avoid jams).
      return { t: this.network.travelTime(a, p.x, p.y, f.node, caches.get(id)), q: f.haulers.length, r: batteryRisk(a.battery), u: this.network.uncertainty(a, p.x, p.y, f.node) };
    });
    for (const w of result.awards) {
      const a = this.agent(w.agentId)!, f = this.faces[w.taskId - 1], p = this.facePoint(f, 'load');
      f.haulers.push(a.id);
      this.haulJobs.set(a.id, { face: f, stage: 'TO_FACE', timer: 0 });
      a.bid = w.cost; a.target = `${f.name} → ствол`;
      this.network.plan(a, p.x, p.y, p.theta, f.node);
    }
  }

  /** One cart at a time on the face loading spot; the next waits in the drift. */
  private faceGate(a: SwarmAgent, j: HaulJob): void {
    const p = this.facePoint(j.face, 'load'), d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d > 8) return;
    if (this.faceMutex.acquire(`F${j.face.id}`, a.id, this.epoch, this.time)) { if (j.stage === 'QUEUE') j.stage = 'TO_FACE'; return; }
    a.speedScale = d < 6.5 ? 0 : 0.3;
    j.stage = 'QUEUE';
    this.gated.add(a.id);
  }

  /** The bunker grate takes one cart at a time; the others queue in the shaft chamber. */
  private dumpGate(a: SwarmAgent): void {
    const d = this.dumpPoint, dist = Math.hypot(a.x - d.x, a.y - d.y);
    if (dist > 6) return;
    if (this.faceMutex.acquire('DUMP', a.id, this.epoch, this.time)) return;
    a.speedScale = dist < 4.2 ? 0 : 0.3;
    this.gated.add(a.id);
  }

  private hauler(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const j = this.haulJobs.get(a.id);
    const kg = this.loadKg.get(a.id)!;
    a.cargo = kg / HOPPER_KG;
    a.working = false;
    if (!j) {
      a.dump = Math.max(0, a.dump - dt);
      a.task = a.hasRoute ? 'RETURNING' : 'IDLE'; a.progress = a.cargo;
      if (!a.hasRoute && Math.hypot(a.x, a.y) > 9) this.network.plan(a, Math.cos(a.id) * 5.5, Math.sin(a.id) * 5.5);
      return;
    }
    const f = j.face;
    a.task = this.gated.has(a.id) ? 'QUEUE' : j.stage;
    switch (j.stage) {
      case 'TO_FACE': case 'QUEUE': {
        const p = this.facePoint(f, 'load');
        a.progress = 0;
        if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - p.x, a.y - p.y) < 0.2)) j.stage = 'LOADING_ORE';
        else if (!a.hasRoute) this.network.plan(a, p.x, p.y, p.theta, f.node);
        return;
      }
      case 'LOADING_ORE': {
        this.faceMutex.acquire(`F${f.id}`, a.id, this.epoch, this.time);
        const take = Math.min(LOAD_RATE * dt, f.stock, HOPPER_KG - kg);
        f.stock -= take;
        this.loadKg.set(a.id, kg + take);
        a.working = take > 0;
        a.progress = (kg + take) / HOPPER_KG;
        const minerWorking = f.miner !== null && this.agent(f.miner)!.task === 'MINING_VEIN';
        if (kg + take >= HOPPER_KG - 0.01 || (f.stock < 0.5 && (!minerWorking || kg + take >= HOPPER_KG * 0.55))) {
          if (kg + take < 1) return;
          j.stage = 'HAULING_TO_SHAFT';
          f.haulers.splice(f.haulers.indexOf(a.id), 1);
          this.faceMutex.release(`F${f.id}`, a.id);
          const d = this.dumpPoint;
          this.network.plan(a, d.x, d.y, d.theta, 20);
        }
        return;
      }
      case 'HAULING_TO_SHAFT': {
        a.progress = a.cargo;
        const d = this.dumpPoint;
        if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - d.x, a.y - d.y) < 0.2)) { j.stage = 'DUMPING_ORE'; j.timer = 3; }
        else if (!a.hasRoute) this.network.plan(a, d.x, d.y, d.theta, 20);
        return;
      }
      case 'DUMPING_ORE': {
        this.faceMutex.acquire('DUMP', a.id, this.epoch, this.time);
        j.timer -= dt;
        a.working = true;
        a.dump = Math.min(1, a.dump + dt * 1.2);
        const out = Math.min(kg, (kg + 1) * dt / Math.max(0.3, j.timer - 0.8));
        if (a.dump > 0.6) { this.loadKg.set(a.id, kg - out); this.deliveredKg += out; }
        a.progress = 1 - j.timer / 3;
        if (j.timer <= 0) {
          this.deliveredKg += this.loadKg.get(a.id)!; this.loadKg.set(a.id, 0);
          this.haulJobs.delete(a.id); a.bid = null; a.target = '';
          this.faceMutex.release('DUMP', a.id);
          const back = this.graph.node(SHAFT.id);
          this.network.plan(a, back.x + Math.cos(a.id * 1.3) * 3.5, back.y + Math.sin(a.id * 1.3) * 3.5);
          if (Math.floor(this.deliveredKg / 500) !== Math.floor((this.deliveredKg - kg) / 500)) this.log(`СТВОЛ: ${a.name} выгрузил уголь в бункер · всего ${(this.deliveredKg / 1000).toFixed(2)} т`);
        }
        return;
      }
    }
  }

  // ───────────────────────── charging bay (hot-swap) ─────────────────────────

  private toCharger(a: SwarmAgent): void {
    const rec = this.beginHotSwap(a, null);
    this.charging.set(a.id, rec);
    a.active = false; a.working = false;
    // Hand the robot's duty back to the pool.
    const f = this.minerFace.get(a.id); if (f) { f.miner = null; this.minerFace.delete(a.id); }
    const job = this.scanJobs.get(a.id); if (job?.kind === 'escort') job.face.scanner = null; this.scanJobs.delete(a.id);
    const hj = this.haulJobs.get(a.id); if (hj) { hj.face.haulers = hj.face.haulers.filter(id => id !== a.id); this.haulJobs.delete(a.id); }
    applyModuleCommand(a.module, this.actions.issue(this.epoch, 'SAFE'));
    const c = this.chargerPoint;
    this.network.plan(a, c.x + (a.id % 3 - 1) * 0.8, c.y - Math.floor(a.id % 6 / 3) * 0.8, Math.PI, 19);
    a.task = 'TO_CHARGER'; a.target = 'зарядная камера';
    this.log(`HOT-SWAP: ${a.name} b = ${(a.battery * 100).toFixed(1)}% < 25% · epoch → ${this.epoch}; задача возвращена в аукцион, робот уходит на подземную зарядку`);
  }

  private charge(a: SwarmAgent, dt: number, status: DriveStatus): void {
    if (a.hasRoute && status !== DriveStatus.Arrived) { a.task = 'TO_CHARGER'; return; }
    a.task = 'CHARGING'; a.working = false;
    a.battery = Math.min(1, a.battery + dt * 0.02);
    a.progress = a.battery;
    if (a.battery >= 0.95) {
      const rec = this.charging.get(a.id)!;
      this.charging.delete(a.id);
      a.active = true;
      applyModuleCommand(a.module, this.actions.issue(this.epoch, 'RESET'));
      this.completeHotSwap(rec);
    }
  }

  protected anchored(a: SwarmAgent): boolean { return super.anchored(a) || a.task === 'MINING_VEIN' || a.task === 'LOADING_ORE'; }

  // ───────────────────────── telemetry ─────────────────────────

  snapshot(): WorkflowSnapshot {
    const count = (team: string, test: (a: SwarmAgent) => boolean): number => this.agents.filter(a => a.team === team && test(a)).length;
    const kpi: MiningKpi = {
      minedKg: this.minedKg, delivered: this.deliveredKg, explored: this.explored(),
      activeFaces: this.agents.filter(a => a.task === 'MINING_VEIN').length,
      collapses: this.graph.edges.filter(e => e.state.status === 'CLOSED').length,
      replans: this.network.replans, updates: this.network.updates, lidarVisor: this.lidarVisor,
      teams: [
        { id: 'Scanner-Light', working: count('Scanner-Light', a => a.task === 'ILLUMINATING_FACE' || a.task === 'SCANNING_DRIFT' || a.task === 'SCANNING_COLLAPSE'), size: 6 },
        { id: 'Miner-Drill', working: count('Miner-Drill', a => a.task === 'MINING_VEIN'), size: 6 },
        { id: 'Hauler-Cart', working: count('Hauler-Cart', a => this.haulJobs.has(a.id)), size: 6 },
      ],
      epoch: this.epoch,
    };
    const rows = this.agents.map(a => {
      const cap = a.module.capability;
      const lidar = cap === 'LIDAR_ILLUMINATOR' ? (a.active ? 'LiDAR 360° · свет 100%' : 'выкл.') : cap === 'ROTARY_EXCAVATOR' ? (this.litBy(a.x, a.y) ? `освещён · ${this.litBy(a.x, a.y)!.name}` : 'нет подсветки') : this.litBy(a.x, a.y) ? 'в зоне сканера' : 'фары';
      return this.baseRow(a, cap === 'ORE_HOPPER_CART' ? { load: this.loadKg.get(a.id)!, loadPct: this.loadKg.get(a.id)! / HOPPER_KG, lidar } : cap === 'ROTARY_EXCAVATOR' && this.minerFace.get(a.id) ? { load: this.minerFace.get(a.id)!.stock, loadPct: this.minerFace.get(a.id)!.stock / FACE_STOCK_MAX, lidar } : { lidar });
    });
    const badges: WorkflowBadge[] = this.collapses.map(c => ({
      id: `collapse-${c.edge}`, x: c.x, y: c.y, z: 3.6, title: `Обвал штрека E${c.edge}`,
      detail: c.inspected ? 'оцифрован · ребро закрыто (S1)' : 'ребро закрыто (S1) · сканер в пути', progress: null, tone: 'destructive' as const,
    }));
    for (const f of this.faces) if (f.miner !== null) badges.push({ id: `face-${f.id}`, x: f.x, y: f.y, z: 3.2, title: f.name, detail: `${f.mined.toFixed(0)} кг добыто · склад ${f.stock.toFixed(0)} кг`, progress: f.stock / FACE_STOCK_MAX, tone: this.agent(f.miner)!.task === 'MINING_VEIN' ? 'success' : 'warning' });
    return { kind: 'mining', kpi, rows, badges };
  }
}
