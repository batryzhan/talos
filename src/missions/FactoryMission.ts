/**
 * /factory — «Производственный цех»: heterogeneous Swarm Agentic Workflow on 20 Strafer robots
 * (CLAUDE.md §4.1).
 *
 *   Cutter-1..4     PLASMA_CUTTER      CUTTING_METAL — sheet blanks on the cutting tables (δ_p ≤ 8 mm)
 *   Welder-1..6     ARC_WELDER         WELDING_JOINT — triples around two jigs, seam phase agreed by M0
 *   Mechanic-1..4   REPAIR_DIAGNOSTIC  REPAIRING_UNIT — breakdowns allocated by the J_ij auction
 *   Logistics-1..4  ROLLER_CARRIER     HAULING_PART — blanks → jigs, assemblies → warehouse, crossing mutexes
 *   Reserve-1..2    MULTI_SWAP         Hot-Swap at b < 25 %: epoch++, safe exit, replacement
 *
 * Workflow: Раскрой металла → Сборка и сварка → Диагностика и ремонт → Вывоз на склад.
 */
import { SwarmAgent, DriveStatus } from '../core/agents/SwarmAgent';
import { applyModuleCommand, createModule, type ModuleCapability } from '../core/agents/taskModule';
import { batteryRisk, runAuction, type CostTerms } from '../core/allocation/auction';
import { ResourceMutex } from '../core/coordination/ResourceMutex';
import { M0_THRESHOLD, m0GroupStep, m0SafeEps, m0Spread } from '../core/consensus/m0Group';
import { RouteNetwork } from '../core/routing/RouteNetwork';
import { S1Graph } from '../core/routing/s1Graph';
import { HOT_SWAP_THRESHOLD, WorkflowMission, type RestoreRecord, type WorkflowOptions } from './workflow/WorkflowMission';
import type { FactoryKpi, WorkflowBadge, WorkflowSnapshot } from './workflow/types';

// ───────────────────────── layout (Z-up, metres) ─────────────────────────

export const FACTORY_LANES = { x: [-8, -4, 4, 8], y: [-9, -4.5, 0, 4.5, 9] } as const;
const CROSS = [{ id: 20, x: 0, y: -9 }, { id: 21, x: 0, y: 0 }, { id: 22, x: 0, y: 9 }] as const;
const laneId = (c: number, r: number): number => c * 5 + r;

export type MachineKind = 'cutting' | 'jig' | 'conveyor';
export interface Machine {
  id: string;
  kind: MachineKind;
  label: string;
  /** Machine centre and the service point a mechanic stands on. */
  x: number; y: number;
  sx: number; sy: number; sTheta: number;
  serviceNode: number;
  broken: boolean;
  /** Mechanic on it and the repair stage. */
  repairer: number | null;
  stage: 'OK' | 'BROKEN' | 'DIAGNOSING' | 'REPAIRING';
  stageProgress: number;
  brokeAt: number;
  repairs: number;
}

interface Post { id: string; x: number; y: number; theta: number; node: number; holder: number; capability: ModuleCapability; machine: string }

interface Jig {
  id: string; machine: Machine; x: number; y: number;
  dropX: number; dropY: number; dropNode: number;
  posts: Post[];
  input: number; inbound: number; output: number; outReserved: number;
  phase: 'IDLE' | 'SYNC' | 'WELDING';
  progress: number;
  /** M0 state (seam start phase) of the participating welders. */
  x0: Float64Array; delta: Float64Array; members: number[];
  spread: number;
  seamGlow: number;
}

interface CutTable { machine: Machine; post: Post; buffer: number; reserved: number; outX: number; outY: number; outNode: number; progress: number; conveyor: string }

type HaulTask = { kind: 'blanks'; from: CutTable; to: Jig; count: number } | { kind: 'assembly'; from: Jig; to: Bay };
interface Bay { x: number; y: number; node: number; stock: number }

interface Haul { task: HaulTask; stage: 'TO_PICKUP' | 'LOADING' | 'TO_DROP' | 'UNLOADING'; timer: number }
interface Repair { machine: Machine; stage: 'TO_FAULT' | 'DIAGNOSING' | 'REPAIRING'; timer: number }
interface Swap { record: RestoreRecord; post: Post; low: SwarmAgent; reserve: SwarmAgent; stage: 'EXIT' | 'ARRIVING' | 'DONE' }

const CUT_SECONDS = 7;
const WELD_SECONDS = 9;
const DIAG_SECONDS = 2.5;
const REPAIR_SECONDS = 5.5;
const XFER_SECONDS = 1.2;
/** Idle carriers park where they stand and only return to their bay after this long without work. */
const PARK_AFTER = 6;

export interface FactoryOptions extends WorkflowOptions {
  /** Schedule automatic breakdowns (default true). */
  autoFaults?: boolean;
  /** Time of the scripted battery drop (s), default 12. */
  swapAt?: number;
}

export class FactoryMission extends WorkflowMission {
  readonly kind = 'factory' as const;
  readonly network: RouteNetwork;
  readonly graph = new S1Graph();
  readonly machines: Machine[] = [];
  readonly tables: CutTable[] = [];
  readonly jigs: Jig[] = [];
  readonly bays: Bay[] = [];
  readonly chargers: { x: number; y: number; node: number; occupant: number | null }[] = [];
  readonly mutex = new ResourceMutex(5);
  readonly homes = new Map<number, { x: number; y: number; theta: number }>();
  readonly hauls = new Map<number, Haul>();
  readonly repairs = new Map<number, Repair>();
  readonly repairQueue = new Map<number, Machine[]>();
  readonly swaps: Swap[] = [];
  readonly charging = new Set<number>();
  /** Corridor the operator may block (S1 demo) and whether it is blocked. */
  blockedEdge: number | null = null;
  lastAuction: FactoryKpi['auction'] = null;
  cut = 0; welded = 0; repaired = 0; delivered = 0; faults = 0;
  private readonly autoFaults: boolean;
  private readonly swapAt: number;
  private swapTriggered = false;
  private nextFault = 22;
  private posts: Post[] = [];

  constructor(o: FactoryOptions = {}) {
    super(o);
    this.autoFaults = o.autoFaults ?? true;
    this.swapAt = o.swapAt ?? 12;
    this.buildGraph();
    this.buildFleet();
    this.teams.push(
      { id: 'Cutter', capability: 'PLASMA_CUTTER', size: 4 }, { id: 'Welder', capability: 'ARC_WELDER', size: 6 },
      { id: 'Mechanic', capability: 'REPAIR_DIAGNOSTIC', size: 4 }, { id: 'Logistics', capability: 'ROLLER_CARRIER', size: 4 },
      { id: 'Reserve', capability: 'MULTI_SWAP', size: 2 },
    );
    this.network = new RouteNetwork(this.graph, this.rng.fork(), this.agents);
    for (const id of this.stationIds) this.network.stationNodes.add(id);
    this.log('ФОРМИРОВАНИЕ: 20 роботов Strafer — резка ×4, сварка ×6, ремонт ×4, логистика ×4, резерв ×2');
    for (const a of this.agents) {
      const p = this.postOf(a.id);
      if (p) this.network.plan(a, p.x, p.y, p.theta, p.node);
    }
  }

  // ───────────────────────── construction ─────────────────────────

  private readonly stationIds: number[] = [];
  private nextNode = 100;

  private station(x: number, y: number, attach: number): number {
    const id = this.nextNode++;
    this.graph.addNode(id, x, y);
    this.graph.addEdge(attach, id);
    this.stationIds.push(id);
    return id;
  }

  private buildGraph(): void {
    const g = this.graph, X = FACTORY_LANES.x, Y = FACTORY_LANES.y;
    X.forEach((x, c) => Y.forEach((y, r) => g.addNode(laneId(c, r), x, y)));
    for (const n of CROSS) g.addNode(n.id, n.x, n.y);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) g.addEdge(laneId(c, r), laneId(c, r + 1));
    // Rows −9, 0, 9 cross the centre through the narrow crossings; rows ±4.5 are cut by the jigs.
    ([[0, 20], [2, 21], [4, 22]] as const).forEach(([r, cross]) => {
      g.addEdge(laneId(0, r), laneId(1, r)); g.addEdge(laneId(1, r), cross); g.addEdge(cross, laneId(2, r)); g.addEdge(laneId(2, r), laneId(3, r));
    });
    for (const r of [1, 3]) { g.addEdge(laneId(0, r), laneId(1, r)); g.addEdge(laneId(2, r), laneId(3, r)); }

    const machine = (id: string, kind: MachineKind, label: string, x: number, y: number, sx: number, sy: number, sTheta: number, serviceNode: number): Machine => {
      const m: Machine = { id, kind, label, x, y, sx, sy, sTheta, serviceNode, broken: false, repairer: null, stage: 'OK', stageProgress: 0, brokeAt: 0, repairs: 0 };
      this.machines.push(m);
      return m;
    };
    // Cutting tables on the west wall, rows −4.5 … 9; conveyor K1 feeds the south pair, K2 the north pair.
    [-4.5, 0, 4.5, 9].forEach((y, i) => {
      const attach = laneId(0, i + 1);
      const node = this.station(-11.65, y, attach);
      const outNode = this.station(-10.6, y - 1.45, attach);
      // Mechanics service the table from the other side of the cutter, never on the carriers' outfeed.
      const serviceNode = this.station(-11.45, y + 1.15, attach);
      const m = machine(`cut-${i + 1}`, 'cutting', `Раскрой-${i + 1}`, -12.9, y, -11.45, y + 1.15, Math.PI, serviceNode);
      const post: Post = { id: `Cutter-${i + 1}`, x: -11.65, y, theta: Math.PI, node, holder: i + 1, capability: 'PLASMA_CUTTER', machine: m.id };
      this.posts.push(post);
      this.tables.push({ machine: m, post, buffer: 0, reserved: 0, outX: -10.6, outY: y - 1.45, outNode, progress: 0, conveyor: i < 2 ? 'conv-1' : 'conv-2' });
    });
    // Welding jigs A (north) and B (south), three welder posts each.
    ([['A', 4.5, 1], ['B', -4.5, -1]] as const).forEach(([name, y, s], j) => {
      const r = s > 0 ? 3 : 1, edgeRow = s > 0 ? 22 : 20;
      const dropNode = this.station(1.55, y + s * 1.65, edgeRow);
      const m = machine(`jig-${name}`, 'jig', `Стапель ${name}`, 0, y, 1.55, y + s * 1.65, s > 0 ? -Math.PI / 2 : Math.PI / 2, dropNode);
      const posts: Post[] = [
        { id: `Welder-${j * 3 + 1}`, x: -1.22, y, theta: 0, node: this.station(-1.22, y, laneId(1, r)), holder: 5 + j * 3, capability: 'ARC_WELDER', machine: m.id },
        { id: `Welder-${j * 3 + 2}`, x: 1.22, y, theta: Math.PI, node: this.station(1.22, y, laneId(2, r)), holder: 6 + j * 3, capability: 'ARC_WELDER', machine: m.id },
        { id: `Welder-${j * 3 + 3}`, x: 0, y: y + s * 1.02, theta: -s * Math.PI / 2, node: this.station(0, y + s * 1.02, edgeRow), holder: 7 + j * 3, capability: 'ARC_WELDER', machine: m.id },
      ];
      this.posts.push(...posts);
      this.jigs.push({ id: name, machine: m, x: 0, y, dropX: 1.55, dropY: y + s * 1.65, dropNode, posts, input: 0, inbound: 0, output: 0, outReserved: 0, phase: 'IDLE', progress: 0, x0: new Float64Array(3), delta: new Float64Array(3), members: [], spread: 0, seamGlow: 0 });
    });
    // Conveyor drive units on the north wall.
    ([[-4, 'conv-1', 'Конвейер K1'], [4, 'conv-2', 'Конвейер K2']] as const).forEach(([x, id, label], i) => {
      const node = this.station(x, 10.9, laneId(i === 0 ? 1 : 2, 4));
      machine(id, 'conveyor', label, x, 12.2, x, 10.9, Math.PI / 2, node);
    });
    // Finished-goods warehouse bays (east).
    for (const [r, y] of [[1, -4.5], [2, 0], [3, 4.5]] as const) this.bays.push({ x: 11.6, y, node: this.station(11.6, y, laneId(3, r)), stock: 0 });
    // Docks: reserves on the south wall at the centre, two spare chargers further east.
    for (const [x, attach] of [[-1.4, 20], [1.4, 20], [4, laneId(2, 0)], [8, laneId(3, 0)]] as const) this.chargers.push({ x, y: -11.6, node: this.station(x, -11.6, attach), occupant: null });
  }

  private buildFleet(): void {
    const add = (name: string, team: string, cap: ModuleCapability, x: number, y: number, theta: number, vmax: number): SwarmAgent => {
      const id = this.agents.length + 1;
      const a = new SwarmAgent({ id, name, team, module: createModule(`${cap}-${id}`, cap), x, y, theta, vmax, battery: 0.72 + this.rng.random() * 0.26 });
      this.agents.push(a);
      this.homes.set(id, { x, y, theta });
      return a;
    };
    // Robots start near the lanes and drive to their posts on start-up.
    for (let i = 0; i < 4; i++) add(`Cutter-${i + 1}`, 'Cutter', 'PLASMA_CUTTER', -8.6, -4.5 + i * 4.5 - 0.8, Math.PI, 0.9);
    for (let i = 0; i < 6; i++) { const p = this.posts.find(q => q.id === `Welder-${i + 1}`)!; add(`Welder-${i + 1}`, 'Welder', 'ARC_WELDER', p.x < 0 ? -4.6 : 4.6, p.y + (i % 3 === 2 ? 0.8 : -0.6), 0, 0.9); }
    const mechHomes: [number, number, number][] = [[-11.6, -8.9, 0], [-11.6, -10.4, 0], [-8, -11.6, Math.PI / 2], [-4, -11.6, Math.PI / 2]];
    mechHomes.forEach(([x, y, th], i) => add(`Mechanic-${i + 1}`, 'Mechanic', 'REPAIR_DIAGNOSTIC', x, y, th, 1.15));
    const logHomes: [number, number][] = [[11.6, 8.9], [11.6, 10.4], [11.6, -8.9], [11.6, -10.4]];
    logHomes.forEach(([x, y], i) => add(`Logistics-${i + 1}`, 'Logistics', 'ROLLER_CARRIER', x, y, Math.PI, 1.5));
    for (let i = 0; i < 2; i++) { const c = this.chargers[i]; const a = add(`Reserve-${i + 1}`, 'Reserve', 'MULTI_SWAP', c.x, c.y, Math.PI / 2, 1.2); a.battery = 1; c.occupant = a.id; a.task = 'CHARGING_DOCK'; }
    // Home spurs for mechanics / logistics so they can return.
    this.homeNodes = new Map();
    for (const a of this.agents) {
      if (a.team !== 'Mechanic' && a.team !== 'Logistics') continue;
      const h = this.homes.get(a.id)!;
      this.homeNodes.set(a.id, this.station(h.x, h.y, this.nearestLane(h.x, h.y)));
    }
    for (const a of this.agents) {
      a.drainIdle = 0.0003; a.drainMove = 0.0009; a.drainWork = 0.0014;
      if (a.team === 'Cutter' || a.team === 'Welder') a.task = 'TO_POST';
      else if (a.team !== 'Reserve') a.task = 'IDLE';
    }
  }

  private homeNodes = new Map<number, number>();
  private readonly idleSince = new Map<number, number>();

  private nearestLane(x: number, y: number): number {
    let best = 0, bd = Infinity;
    for (const n of this.graph.nodes) {
      if (n.id >= 100) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  private postOf(agentId: number): Post | undefined { return this.posts.find(p => p.holder === agentId); }
  machine(id: string): Machine { return this.machines.find(m => m.id === id)!; }

  // ───────────────────────── operator actions ─────────────────────────

  /** «Внедрить поломку станка»: break a working machine and auction the repair among mechanics. */
  injectFault(id?: string): Machine | null {
    const candidates = this.machines.filter(m => !m.broken && (id === undefined || m.id === id));
    if (!candidates.length) return null;
    const m = candidates[Math.floor(this.rng.random() * candidates.length)];
    m.broken = true; m.stage = 'BROKEN'; m.brokeAt = this.time; m.stageProgress = 0;
    this.faults++;
    this.log(`ОТКАЗ: ${m.label} — ${m.kind === 'cutting' ? 'сбой привода портала' : m.kind === 'jig' ? 'перегрев стапеля' : 'заклинивание роликов'}; объявлен аукцион J_ij среди Mechanic-1..4`);
    this.auctionRepair(m);
    return m;
  }

  /** «Перекрыть коридор цеха» (toggle): close / reopen the busiest corridor edge (S1). */
  toggleCorridor(): number | null {
    if (this.blockedEdge !== null) {
      const e = this.blockedEdge;
      this.network.openEdge(e);
      this.blockedEdge = null;
      this.log(`S1: коридор E${e} открыт — оценки t̂_e сохраняются в локальных таблицах роботов`);
      return null;
    }
    const usage = new Map<number, number>();
    for (const a of this.agents) for (let k = a.wpIndex; k < a.wpEdge.length; k++) { const e = a.wpEdge[k]; if (e >= 0 && this.graph.edge(e).a < 100 && this.graph.edge(e).b < 100) usage.set(e, (usage.get(e) ?? 0) + 1); }
    let edge = this.graph.findEdge(laneId(1, 4), 22)!.id, best = 0;
    for (const [e, n] of usage) if (n > best) { best = n; edge = e; }
    const replanned = this.network.closeEdge(edge, 'BLOCKED', this.time);
    this.blockedEdge = edge;
    const e = this.graph.edge(edge);
    this.log(`S1: коридор E${edge} (${e.a}↔${e.b}) перекрыт · перепланировано маршрутов: ${replanned.length}`);
    return edge;
  }

  /** «Симулировать разряд»: drop the battery of an active cutter or welder to 24.9 %. */
  injectBatteryDrop(id?: number): SwarmAgent | null {
    const pool = this.agents.filter(a => (id === undefined || a.id === id) && a.active && (a.module.capability === 'ARC_WELDER' || a.module.capability === 'PLASMA_CUTTER') && this.postOf(a.id) && !this.swaps.some(s => s.low === a && s.stage !== 'DONE'));
    if (!pool.length) return null;
    const a = pool[Math.floor(this.rng.random() * pool.length)];
    a.battery = 0.249;
    this.log(`БАТАРЕЯ: заряд ${a.name} упал до 24.9% — порог hot-swap 25%`);
    return a;
  }

  // ───────────────────────── control loop (50 Hz) ─────────────────────────

  protected control(dt: number): void {
    if (this.holding) { for (const a of this.agents) a.drive(dt); return; }
    const t = this.time;
    if (!this.swapTriggered && t >= this.swapAt) { this.swapTriggered = true; this.injectBatteryDrop(this.agents.find(a => a.name === 'Welder-2')?.id); }
    if (this.autoFaults && t >= this.nextFault) { this.nextFault = t + 30 + this.rng.random() * 15; this.injectFault(); }

    this.gated.clear();
    for (const a of this.agents) {
      // Gates first (crossing mutex, station queue), then the drive step sees this tick's speed scale.
      a.speedScale = 1;
      // A robot queued for a station never sits on a crossing lease (that would deadlock the crossing).
      const haul = this.hauls.get(a.id);
      if (haul) this.stationGate(a, haul);
      if (this.gated.has(a.id)) { const held = this.leases.get(a.id); if (held) { this.mutex.release(held, a.id); this.leases.delete(a.id); } }
      else if (a.hasRoute && a.module.capability !== 'PLASMA_CUTTER' && a.module.capability !== 'ARC_WELDER') this.crossing(a);
      const status = this.network.follow(a, t, dt);
      if (this.charging.has(a.id)) this.chargeStep(a, dt);
      else if (a.active && a.battery < HOT_SWAP_THRESHOLD && !this.swaps.some(s => s.low === a && s.stage !== 'DONE') && (a.team === 'Cutter' || a.team === 'Welder')) this.startSwap(a);
      switch (a.module.capability) {
        case 'PLASMA_CUTTER': this.cutter(a, dt); break;
        case 'ROLLER_CARRIER': this.logistics(a, dt, status); break;
        case 'REPAIR_DIAGNOSTIC': this.mechanic(a, dt, status); break;
        default: break;
      }
    }
    for (const j of this.jigs) this.jigStep(j, dt);
    for (const s of this.swaps) this.swapStep(s);
  }

  private atPost(a: SwarmAgent, p: Post): boolean { return Math.hypot(a.x - p.x, a.y - p.y) < 0.03 && !a.hasRoute; }

  private cutter(a: SwarmAgent, dt: number): void {
    const table = this.tables.find(tb => tb.post.holder === a.id);
    a.working = false;
    if (!table || !a.active) return;
    if (!this.atPost(a, table.post)) { a.task = a.hasRoute ? 'TO_POST' : a.task; return; }
    const conveyor = this.machine(table.conveyor);
    a.aimX = table.machine.x + 0.4; a.aimY = table.machine.y + Math.sin(this.time * 0.7 + a.id) * 0.45; a.aimZ = 0.32;
    if (table.machine.broken) { a.task = 'WAITING_REPAIR'; this.moduleTo(a, 'SAFE'); return; }
    if (conveyor.broken) { a.task = 'NO_SHEET'; this.moduleTo(a, 'SAFE'); return; }
    if (table.buffer >= 2) { a.task = 'BUFFER_FULL'; this.moduleTo(a, 'ARM'); return; }
    this.moduleTo(a, 'ACTIVE');
    a.task = 'CUTTING_METAL';
    a.working = true;
    a.spin += dt * 40;
    table.progress += dt / CUT_SECONDS;
    a.progress = table.progress;
    if (table.progress >= 1) {
      table.progress = 0; table.buffer++; this.cut++;
      this.moduleTo(a, 'COMPLETE');
    }
  }

  /** Drive the module through ARM → START → COMPLETE with idempotent commands. */
  private moduleTo(a: SwarmAgent, want: 'ARM' | 'ACTIVE' | 'SAFE' | 'COMPLETE'): void {
    const m = a.module;
    const send = (action: 'ARM' | 'START' | 'COMPLETE' | 'SAFE' | 'RESET'): void => { applyModuleCommand(m, this.actions.issue(this.epoch, action)); };
    if (want === 'SAFE') { if (m.state !== 'SAFE' && m.state !== 'IDLE') send('SAFE'); return; }
    if (m.state === 'SAFE' || m.state === 'FAULT') send('RESET');
    if (want === 'COMPLETE') { if (m.state === 'ACTIVE') send('COMPLETE'); return; }
    if (m.state === 'IDLE') send('ARM');
    if (want === 'ACTIVE' && m.state === 'ARMED') send('START');
  }

  // ───────────────────────── welding (M0 synchronised) ─────────────────────────

  private jigStep(j: Jig, dt: number): void {
    const present: SwarmAgent[] = [];
    for (const p of j.posts) {
      const a = p.holder > 0 ? this.agent(p.holder) : undefined;
      if (!a) continue;
      a.working = false; a.aimX = j.x + (p.x - j.x) * 0.4; a.aimY = j.y + (p.y - j.y) * 0.4 + (p.y === j.y ? Math.sin(this.time * 0.6 + a.id) * 0.25 : 0); a.aimZ = 0.47;
      if (a.active && this.atPost(a, p) && a.battery >= HOT_SWAP_THRESHOLD) present.push(a);
    }
    const ready = !j.machine.broken && j.output < 2 && present.length >= 2;
    if (j.phase === 'IDLE') {
      for (const a of present) { a.task = j.machine.broken ? 'WAITING_REPAIR' : j.input < 2 ? 'WAITING_PARTS' : j.output >= 2 ? 'OUTPUT_FULL' : 'READY'; a.progress = 0; }
      if (ready && j.input >= 2) {
        j.phase = 'SYNC';
        j.members = present.map(a => a.id);
        // Each welder's own estimate of the seam start (normalised phase), from its seam-tracking sensor.
        for (let i = 0; i < j.members.length; i++) j.x0[i] = 0.5 + (this.rng.random() - 0.5) * 0.16;
        j.spread = m0Spread(j.x0, j.members.length);
        this.log(`СВАРКА ${j.id}: согласование фазы шва M0 · ${j.members.length} робота · D(0) = ${j.spread.toFixed(3)}`);
      }
      return;
    }
    if (j.machine.broken || j.members.some(id => !present.some(a => a.id === id))) {
      // A member left (hot-swap) or the jig failed: stop the arc, keep progress, resync later.
      for (const id of j.members) this.moduleTo(this.agent(id)!, 'SAFE');
      if (j.phase === 'WELDING') this.log(`СВАРКА ${j.id}: шов приостановлен — состав группы изменился (epoch ${this.epoch})`);
      j.phase = 'IDLE';
      return;
    }
    for (const id of j.members) {
      const a = this.agent(id)!;
      a.task = j.phase === 'SYNC' ? 'SYNC_M0' : 'WELDING_JOINT';
      a.progress = j.progress;
    }
    if (j.phase === 'WELDING') {
      for (const id of j.members) { const a = this.agent(id)!; a.working = true; a.spin += dt * 6; this.moduleTo(a, 'ACTIVE'); }
      j.progress += dt / WELD_SECONDS;
      j.seamGlow = j.progress;
      if (j.progress >= 1) {
        j.progress = 0; j.phase = 'IDLE'; j.input -= 2; j.output++; this.welded++;
        for (const id of j.members) this.moduleTo(this.agent(id)!, 'COMPLETE');
        this.log(`СВАРКА ${j.id}: узел готов, шов остывает · всего сварено ${this.welded}`);
      }
    }
  }

  // ───────────────────────── logistics (auction + mutex) ─────────────────────────

  private logistics(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const h = this.hauls.get(a.id);
    a.working = false;
    if (!h) {
      if (!a.hasRoute) {
        a.task = this.charging.has(a.id) ? 'CHARGING' : 'IDLE'; a.target = ''; a.bid = null; a.progress = 0;
        const since = this.idleSince.get(a.id) ?? this.time;
        this.idleSince.set(a.id, since);
        const home = this.homes.get(a.id)!;
        if (this.time - since > PARK_AFTER && Math.hypot(a.x - home.x, a.y - home.y) > 0.2) { this.network.plan(a, home.x, home.y, home.theta, this.homeNodes.get(a.id)); a.task = 'RETURNING'; }
      }
      return;
    }
    this.idleSince.delete(a.id);
    if (h.stage === 'TO_PICKUP' || h.stage === 'TO_DROP') {
      if (!this.gated.has(a.id)) a.task = h.stage === 'TO_PICKUP' ? 'TO_PICKUP' : 'HAULING_PART';
      a.progress = 1 - Math.min(1, a.remaining() / 25);
      const goal = this.haulGoal(h);
      if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - goal.x, a.y - goal.y) < 0.15)) { h.stage = h.stage === 'TO_PICKUP' ? 'LOADING' : 'UNLOADING'; h.timer = XFER_SECONDS; }
      else if (!a.hasRoute) this.network.plan(a, goal.x, goal.y, a.finalTheta, goal.node);
      return;
    }
    h.timer -= dt;
    a.working = true;
    a.progress = 1 - h.timer / XFER_SECONDS;
    if (h.timer > 0) return;
    const task = h.task;
    if (h.stage === 'LOADING') {
      if (task.kind === 'blanks') { task.from.buffer -= task.count; task.from.reserved -= task.count; a.cargoKind = 1; a.cargo = task.count / 2; this.network.plan(a, task.to.dropX, task.to.dropY, task.to.y > 0 ? -Math.PI / 2 : Math.PI / 2, task.to.dropNode); }
      else { task.from.output--; task.from.outReserved--; a.cargoKind = 2; a.cargo = 1; this.network.plan(a, task.to.x, task.to.y, 0, task.to.node); }
      h.stage = 'TO_DROP'; h.timer = 0; a.task = 'HAULING_PART';
      return;
    }
    if (task.kind === 'blanks') { task.to.input += task.count; task.to.inbound -= task.count; }
    else { task.to.stock++; this.delivered++; this.log(`СКЛАД: ${a.name} сдал сварной узел · на складе ${this.delivered}`); }
    a.cargo = 0; a.cargoKind = 0;
    this.hauls.delete(a.id);
    const home = this.homes.get(a.id)!;
    this.network.plan(a, home.x, home.y, home.theta, this.homeNodes.get(a.id));
    a.task = 'RETURNING';
  }

  private haulGoal(h: Haul): { x: number; y: number; node: number } {
    const k = h.task;
    if (h.stage === 'TO_PICKUP') return k.kind === 'blanks' ? { x: k.from.outX, y: k.from.outY, node: k.from.outNode } : { x: k.from.dropX, y: k.from.dropY, node: k.from.dropNode };
    return k.kind === 'blanks' ? { x: k.to.dropX, y: k.to.dropY, node: k.to.dropNode } : { x: k.to.x, y: k.to.y, node: k.to.node };
  }

  /**
   * Station queue: pickup / drop points hold one carrier at a time. The lease is renewed while the
   * robot approaches or transfers and lapses (TTL 1 s) once it drives off.
   */
  private stationGate(a: SwarmAgent, h: Haul): void {
    const goal = this.haulGoal(h), d = Math.hypot(a.x - goal.x, a.y - goal.y);
    if (d > 3.2) return;
    if (this.stationMutex.acquire(`S${goal.node}`, a.id, this.epoch, this.time)) return;
    a.speedScale = d < 2.2 ? 0 : 0.3;
    a.task = 'QUEUE';
    this.gated.add(a.id);
  }

  readonly stationMutex = new ResourceMutex(1);
  /** Robots held by a gate during this control step. */
  private readonly gated = new Set<number>();

  /** Lease held per robot on the narrow centre crossings. */
  private readonly leases = new Map<number, string>();

  /**
   * Crossing mutex (TTL + epoch): a moving robot must hold the lease of a centre crossing while it is
   * within 2.6 m of it; without the lease it holds short and waits.
   */
  private crossing(a: SwarmAgent): void {
    let near: (typeof CROSS)[number] | null = null;
    for (const c of CROSS) if (Math.hypot(a.x - c.x, a.y - c.y) < 2.6) near = c;
    const held = this.leases.get(a.id);
    if (!near) {
      if (held) { this.mutex.release(held, a.id); this.leases.delete(a.id); }
      return;
    }
    const key = `X${near.id}`;
    if (this.mutex.acquire(key, a.id, this.epoch, this.time)) {
      this.leases.set(a.id, key);
      return;
    }
    // Hold short of the crossing until the lease is free.
    a.speedScale = Math.hypot(a.x - near.x, a.y - near.y) < 2.25 ? 0 : 0.3;
    if (a.module.capability === 'ROLLER_CARRIER') { a.task = 'MUTEX_WAIT'; this.gated.add(a.id); }
  }

  private haulTasks(): HaulTask[] {
    const tasks: HaulTask[] = [];
    for (const j of this.jigs) if (j.output - j.outReserved > 0) {
      const bay = this.bays.reduce((b, c) => (Math.abs(c.y - j.y) < Math.abs(b.y - j.y) ? c : b));
      tasks.push({ kind: 'assembly', from: j, to: bay });
    }
    for (const tb of this.tables) {
      const free = tb.buffer - tb.reserved;
      if (free <= 0) continue;
      const jig = [...this.jigs].sort((p, q) => (p.input + p.inbound) - (q.input + q.inbound) || Math.abs(p.y - tb.post.y) - Math.abs(q.y - tb.post.y))[0];
      if (jig.input + jig.inbound >= 4) continue;
      tasks.push({ kind: 'blanks', from: tb, to: jig, count: Math.min(2, free, 4 - jig.input - jig.inbound) });
    }
    return tasks;
  }

  private dispatchHauls(): void {
    const idle = this.agents.filter(a => a.module.capability === 'ROLLER_CARRIER' && a.active && !this.hauls.has(a.id) && a.battery >= HOT_SWAP_THRESHOLD && !this.charging.has(a.id));
    if (!idle.length) return;
    const tasks = this.haulTasks();
    if (!tasks.length) return;
    const caches = new Map(idle.map(a => [a.id, this.network.timesFrom(a)]));
    const pickup = (k: HaulTask): { x: number; y: number; node: number } => k.kind === 'blanks' ? { x: k.from.outX, y: k.from.outY, node: k.from.outNode } : { x: k.from.dropX, y: k.from.dropY, node: k.from.dropNode };
    const result = runAuction(
      tasks.map((k, i) => ({ id: i, capability: 'ROLLER_CARRIER', priority: k.kind === 'assembly' ? 2 : 1 })),
      idle.map(a => ({ id: a.id, capability: 'ROLLER_CARRIER' })),
      (agentId, taskId): CostTerms => {
        const a = this.agent(agentId)!, p = pickup(tasks[taskId]);
        return { t: this.network.travelTime(a, p.x, p.y, p.node, caches.get(agentId)), q: 0, r: batteryRisk(a.battery), u: this.network.uncertainty(a, p.x, p.y, p.node) };
      },
    );
    for (const w of result.awards) {
      const a = this.agent(w.agentId)!, task = tasks[w.taskId], p = pickup(task);
      if (task.kind === 'blanks') { task.from.reserved += task.count; task.to.inbound += task.count; } else task.from.outReserved++;
      this.hauls.set(a.id, { task, stage: 'TO_PICKUP', timer: 0 });
      a.bid = w.cost;
      a.target = task.kind === 'blanks' ? `${task.from.machine.label} → Стапель ${task.to.id}` : `Стапель ${task.from.id} → склад`;
      a.task = 'TO_PICKUP';
      this.network.plan(a, p.x, p.y, task.kind === 'blanks' ? Math.PI : (task.from.y > 0 ? -Math.PI / 2 : Math.PI / 2), p.node);
    }
  }

  // ───────────────────────── maintenance (J_ij auction) ─────────────────────────

  private auctionRepair(m: Machine): void {
    const mechs = this.agents.filter(a => a.module.capability === 'REPAIR_DIAGNOSTIC' && a.active && !this.charging.has(a.id));
    if (!mechs.length) return;
    const result = runAuction([{ id: 0, capability: 'REPAIR_DIAGNOSTIC', priority: 1 }], mechs.map(a => ({ id: a.id, capability: 'REPAIR_DIAGNOSTIC' })), (agentId): CostTerms => {
      const a = this.agent(agentId)!;
      const busy = this.repairs.get(agentId), queued = this.repairQueue.get(agentId)?.length ?? 0;
      // A busy mechanic bids from its current job: remaining job time + travel from there.
      const remainingJob = busy ? (busy.stage === 'TO_FAULT' ? a.remaining() / a.vmax : 0) + (busy.stage === 'REPAIRING' ? busy.timer : DIAG_SECONDS + REPAIR_SECONDS) : 0;
      return { t: remainingJob + this.network.travelTime(a, m.sx, m.sy, m.serviceNode), q: (busy ? 1 : 0) + queued, r: batteryRisk(a.battery), u: this.network.uncertainty(a, m.sx, m.sy, m.serviceNode) };
    });
    const win = result.awards[0];
    this.lastAuction = {
      machine: m.label,
      bids: result.bids.map(b => ({ name: this.agent(b.agentId)!.name, cost: b.cost, ...b.terms, won: b.agentId === win?.agentId })).sort((p, q) => p.cost - q.cost),
    };
    if (!win) return;
    const a = this.agent(win.agentId)!;
    this.log(`АУКЦИОН J_ij · ${m.label}: ${this.lastAuction.bids.map(b => `${b.name} ${b.cost.toFixed(1)}`).join(' · ')} → победитель ${a.name}`);
    m.repairer = a.id;
    if (this.repairs.has(a.id)) { const q = this.repairQueue.get(a.id) ?? []; q.push(m); this.repairQueue.set(a.id, q); a.target = `${a.target} + ${m.label}`; return; }
    this.assignRepair(a, m, win.cost);
  }

  private assignRepair(a: SwarmAgent, m: Machine, cost: number | null): void {
    this.repairs.set(a.id, { machine: m, stage: 'TO_FAULT', timer: 0 });
    a.bid = cost; a.target = m.label; a.task = 'TO_FAULT';
    this.network.plan(a, m.sx, m.sy, m.sTheta, m.serviceNode);
  }

  private mechanic(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const r = this.repairs.get(a.id);
    a.working = false;
    if (!r) { if (!a.hasRoute) { a.task = 'IDLE'; a.target = ''; a.bid = null; a.progress = 0; } return; }
    const m = r.machine;
    a.aimX = m.x; a.aimY = m.y; a.aimZ = 0.8;
    if (r.stage === 'TO_FAULT') {
      a.progress = 0;
      if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - m.sx, a.y - m.sy) < 0.1)) {
        r.stage = 'DIAGNOSING'; r.timer = DIAG_SECONDS; m.stage = 'DIAGNOSING'; a.task = 'DIAGNOSING';
        this.log(`РЕМОНТ: ${a.name} на месте · диагностика ${m.label} оптическим сенсором`);
      } else if (!a.hasRoute) this.network.plan(a, m.sx, m.sy, m.sTheta, m.serviceNode);
      return;
    }
    a.working = true;
    a.spin += dt * (r.stage === 'REPAIRING' ? 9 : 1);
    r.timer -= dt;
    const total = r.stage === 'DIAGNOSING' ? DIAG_SECONDS : REPAIR_SECONDS;
    m.stageProgress = 1 - r.timer / total;
    a.progress = r.stage === 'DIAGNOSING' ? m.stageProgress * 0.3 : 0.3 + m.stageProgress * 0.7;
    if (r.timer > 0) return;
    if (r.stage === 'DIAGNOSING') { r.stage = 'REPAIRING'; r.timer = REPAIR_SECONDS; m.stage = 'REPAIRING'; a.task = 'REPAIRING_UNIT'; return; }
    m.broken = false; m.stage = 'OK'; m.repairer = null; m.repairs++; m.stageProgress = 0;
    this.repaired++;
    this.log(`РЕМОНТ: ${m.label} восстановлен ${a.name} за ${(this.time - m.brokeAt).toFixed(1)} с после отказа`);
    this.repairs.delete(a.id);
    const next = this.repairQueue.get(a.id)?.shift();
    if (next) { this.assignRepair(a, next, null); return; }
    const home = this.homes.get(a.id)!;
    this.network.plan(a, home.x, home.y, home.theta, this.homeNodes.get(a.id));
    a.task = 'RETURNING'; a.target = '';
  }

  // ───────────────────────── hot-swap ─────────────────────────

  private startSwap(low: SwarmAgent): void {
    const post = this.postOf(low.id);
    if (!post) return;
    const reserves = this.agents.filter(a => a.module.capability === 'MULTI_SWAP' && a.active && a.battery > 0.8 && !this.swaps.some(s => s.reserve === a && s.stage !== 'DONE'));
    // Safe exit first: the tool stops, the robot leaves the work zone even if no reserve is free.
    this.moduleTo(low, 'SAFE');
    low.working = false;
    if (!reserves.length) {
      this.beginHotSwap(low, null);
      this.log(`HOT-SWAP: ${low.name} — нет свободного резерва; безопасный выход на зарядку (epoch ${this.epoch})`);
      post.holder = -1;
      this.sendToCharger(low);
      return;
    }
    const result = runAuction([{ id: 0, capability: 'MULTI_SWAP', priority: 1 }], reserves.map(a => ({ id: a.id, capability: 'MULTI_SWAP' })), (id): CostTerms => {
      const a = this.agent(id)!;
      return { t: this.network.travelTime(a, post.x, post.y, post.node), q: 0, r: batteryRisk(a.battery), u: this.network.uncertainty(a, post.x, post.y, post.node) };
    });
    const reserve = this.agent(result.awards[0].agentId)!;
    const record = this.beginHotSwap(low, reserve);
    this.mutex.revokeBefore(this.epoch);
    this.log(`HOT-SWAP: ${low.name} b = ${(low.battery * 100).toFixed(1)}% < 25% · epoch → ${this.epoch}, устаревшие пакеты отбрасываются; ${reserve.name} (J = ${result.awards[0].cost.toFixed(1)}) принимает модуль ${post.capability}`);
    this.claimPost(reserve, post, result.awards[0].cost);
    this.swaps.push({ record, post, low, reserve, stage: 'EXIT' });
    this.sendToCharger(low);
  }

  /** A post left without a replacement is filled as soon as a charged reserve exists. */
  private fillVacantPosts(): void {
    for (const post of this.posts) {
      if (post.holder > 0) continue;
      const reserve = this.agents.find(a => a.module.capability === 'MULTI_SWAP' && a.active && a.battery > 0.8 && !this.swaps.some(s => s.reserve === a && s.stage !== 'DONE'));
      if (!reserve) return;
      const record = this.restores.find(r => r.replacementId === null && r.tRestore === null);
      this.claimPost(reserve, post, null);
      if (record) { record.replacementId = reserve.id; this.swaps.push({ record, post, low: reserve, reserve, stage: 'EXIT' }); }
      this.log(`РЕЗЕРВ: ${reserve.name} занимает свободный пост ${post.id}`);
    }
  }

  private claimPost(reserve: SwarmAgent, post: Post, bid: number | null): void {
    const dock = this.chargers.find(c => c.occupant === reserve.id);
    if (dock) dock.occupant = null;
    this.charging.delete(reserve.id);
    reserve.module.capability = post.capability;
    reserve.module.moduleId = `${post.capability}-${reserve.id}`;
    reserve.team = post.capability === 'ARC_WELDER' ? 'Welder' : 'Cutter';
    reserve.task = 'SWAP_IN'; reserve.target = post.id; reserve.bid = bid;
    this.network.plan(reserve, post.x, post.y, post.theta, post.node);
    post.holder = reserve.id;
  }

  private sendToCharger(a: SwarmAgent): void {
    const dock = this.chargers.find(c => c.occupant === null) ?? this.chargers[this.chargers.length - 1];
    dock.occupant = a.id;
    a.task = 'HOT_SWAP_EXIT'; a.target = 'док зарядки';
    a.team = 'Reserve';
    this.network.plan(a, dock.x, dock.y, Math.PI / 2, dock.node);
  }

  private swapStep(s: Swap): void {
    if (s.stage === 'DONE') return;
    if (s.stage === 'EXIT' && s.reserve.hasRoute) s.stage = 'ARRIVING';
    if (this.atPost(s.reserve, s.post)) {
      s.stage = 'DONE';
      s.reserve.task = 'READY';
      this.completeHotSwap(s.record);
    }
  }

  private chargeStep(a: SwarmAgent, dt: number): void {
    a.battery = Math.min(1, a.battery + dt * 0.012);
    a.task = 'CHARGING';
    if (a.battery >= 0.97 && a.module.capability !== 'MULTI_SWAP' && (a.team === 'Reserve')) {
      a.module.capability = 'MULTI_SWAP';
      a.module.moduleId = `MULTI_SWAP-${a.id}`;
      a.active = true;
      a.task = 'CHARGING_DOCK';
      this.log(`РЕЗЕРВ: ${a.name} заряжен до 97% и переведён в резерв MULTI_SWAP`);
    }
  }

  // ───────────────────────── radio (20 Hz) / physics ─────────────────────────

  protected radio(): void {
    if (this.holding) return;
    const eps = m0SafeEps(3);
    for (const j of this.jigs) {
      if (j.phase !== 'SYNC') continue;
      const n = j.members.length;
      m0GroupStep(j.x0, j.delta, n, eps, () => !this.linkUp());
      j.spread = m0Spread(j.x0, n);
      if (j.spread <= M0_THRESHOLD) {
        j.phase = 'WELDING';
        this.log(`СВАРКА ${j.id}: консенсус M0 достигнут, D(k) = ${j.spread.toFixed(4)} ≤ 0.01 — синхронное ведение шва`);
      }
    }
    if (this.clock.radioTick % 4 === 0) { this.dispatchHauls(); this.fillVacantPosts(); }
  }

  protected physics(): void {
    // Docked robots charge; arriving low-battery robots go out of service until recharged.
    for (const c of this.chargers) {
      if (c.occupant === null) continue;
      const a = this.agent(c.occupant)!;
      if (!a.hasRoute && Math.hypot(a.x - c.x, a.y - c.y) < 0.1 && !this.charging.has(a.id)) {
        this.charging.add(a.id);
        if (a.module.capability !== 'MULTI_SWAP') { a.active = false; this.log(`ЗАРЯДКА: ${a.name} пристыкован к доку, модуль ${a.module.capability} в SAFE`); }
      }
    }
    for (const a of this.agents) if (this.charging.has(a.id) && a.hasRoute) this.charging.delete(a.id);
  }

  // ───────────────────────── telemetry ─────────────────────────

  snapshot(): WorkflowSnapshot {
    const last = this.network.observations[this.network.observations.length - 1];
    const kpi: FactoryKpi = {
      cut: this.cut, welded: this.welded, repaired: this.repaired, delivered: this.delivered,
      inCutting: this.agents.filter(a => a.task === 'CUTTING_METAL').length,
      inWelding: this.agents.filter(a => a.task === 'WELDING_JOINT' || a.task === 'SYNC_M0').length,
      inRepair: this.repairs.size,
      inHauling: this.hauls.size,
      faults: this.machines.filter(m => m.broken).length,
      corridorBlocked: this.blockedEdge !== null,
      replans: this.network.replans,
      updates: this.network.updates,
      auction: this.lastAuction,
      weldConsensus: this.jigs.map(j => ({ jig: j.id, spread: j.spread, converged: j.phase === 'WELDING' })),
      epoch: this.epoch,
      restoreSeconds: this.meanRestore,
      lastObservation: last ? { edge: last.edgeId, before: last.before, after: last.after } : null,
    };
    const badges: WorkflowBadge[] = this.machines.filter(m => m.stage !== 'OK').map(m => {
      const mech = m.repairer === null ? undefined : this.agent(m.repairer);
      return {
        id: m.id, x: m.kind === 'cutting' ? m.x + 0.3 : m.x, y: m.y, z: m.kind === 'conveyor' ? 2.3 : 1.9,
        title: m.label,
        detail: m.stage === 'BROKEN' ? `Отказ · ${mech ? `едет ${mech.name}` : 'ожидает аукциона'}` : m.stage === 'DIAGNOSING' ? `Диагностика · ${mech?.name ?? ''}` : `Ремонт · ${mech?.name ?? ''}`,
        progress: m.stage === 'BROKEN' ? null : m.stage === 'DIAGNOSING' ? m.stageProgress * 0.3 : 0.3 + m.stageProgress * 0.7,
        tone: m.stage === 'BROKEN' ? 'destructive' : m.stage === 'DIAGNOSING' ? 'info' : 'warning',
      };
    });
    return { kind: 'factory', kpi, rows: this.agents.map(a => this.baseRow(a)), badges };
  }
}
