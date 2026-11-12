/**
 * /rescue — «Полевой отряд»: wildfire swarm suppression on 140 × 140 m of mountain forest with
 * 24 Strafer robots (CLAUDE.md §4.2).
 *
 *   Firefighter-1..12  WATER_CANNON   SUPPRESSING_FIRE — upwind attack arcs; the sector reference
 *                                     (wind bearing) is agreed by M0, the slots by the J_ij auction;
 *                                     tank 40 L, refill below 15 % at the river or a tanker
 *   Firebreak-1..4     TRENCH_BLADE   CLEARING_FIREBREAK — mineral strip ahead of the fire front
 *   Scout-Relay-1..6   THERMAL_RELAY  THERMAL_RECON / RELAY_ACTIVE — find hidden fires, hold hilltops
 *                                     as line-of-sight relays (30 m radius) back to the base
 *   Supply-1..2        TANKER_REFILL  water shuttle river → fire line, field battery hot-swap
 *
 * Learning (equation 6): smoke slows robots below the slope-only prior, so t̂_e grows on smoky edges
 * and the water routes drift around the heat; edges through intense fire close (S1, HAZARD).
 */
import { SwarmAgent, DriveStatus } from '../core/agents/SwarmAgent';
import { applyModuleCommand, createModule, type ModuleCapability } from '../core/agents/taskModule';
import { batteryRisk, runAuction, type CostTerms } from '../core/allocation/auction';
import { M0_THRESHOLD, m0GroupStep, m0SafeEps, m0Spread } from '../core/consensus/m0Group';
import { RouteNetwork } from '../core/routing/RouteNetwork';
import { S1Graph } from '../core/routing/s1Graph';
import { BASE_CAMP, FIRE_MAP, FORD, FireTerrain } from '../core/fire/FireTerrain';
import { CELL, CellState, FireGrid, GRID, type FireCluster } from '../core/fire/FireGrid';
import { lineOfSight } from '../swarm/graph';
import type { Vec2 } from '../contracts/types';
import { HOT_SWAP_THRESHOLD, WorkflowMission, type RestoreRecord, type WorkflowOptions } from './workflow/WorkflowMission';
import type { WildfireKpi, WorkflowBadge, WorkflowSnapshot } from './workflow/types';

export const TANK_L = 40;
export const TANKER_L = 400;
const FLOW_LPS = 1.1;
const RIVER_FILL_LPS = 8;
const TANKER_FILL_LPS = 10;
const RELAY_RADIUS = 30;
const NOZZLE_RANGE = 15;
const LATTICE = 8;

interface Attack {
  clusterId: number;
  x: number; y: number; radius: number;
  members: number[];
  /** M0 state: each member's estimate of the wind bearing (rad) — the reference of the sectors. */
  theta: Float64Array;
  delta: Float64Array;
  spread: number;
  converged: boolean;
  lastSeen: number;
  seenAt: number;
}

interface FireRole {
  attack: number | null;
  slot: number;
  slots: number;
  stage: 'STAGING' | 'APPROACH' | 'SUPPRESSING_FIRE' | 'REFILL_TRAVEL' | 'REFILLING' | 'HOT_SWAP';
  refill: { kind: 'river'; x: number; y: number } | { kind: 'tanker'; id: number } | null;
  target: number;
  idleSince: number;
  swap: RestoreRecord | null;
}

interface Breaker { stage: 'IDLE' | 'TO_LINE' | 'CLEARING'; ax: number; ay: number; bx: number; by: number; cleared: number }
interface Scout { stage: 'PATROL' | 'TO_RELAY' | 'RELAY_ACTIVE'; relay: Vec2 | null; loop: number; wp: number }
interface Tanker { water: number; stage: 'TO_STAGE' | 'DEPLOYED' | 'TO_RIVER' | 'FILLING'; stageX: number; stageY: number; served: number }

export interface WildfireOptions extends WorkflowOptions { wind?: number }

export class WildfireMission extends WorkflowMission {
  readonly kind = 'wildfire' as const;
  readonly terrain: FireTerrain;
  readonly grid: FireGrid;
  readonly graph = new S1Graph();
  readonly network: RouteNetwork;
  readonly tank = new Map<number, number>();
  readonly fire = new Map<number, FireRole>();
  readonly breakers = new Map<number, Breaker>();
  readonly scouts = new Map<number, Scout>();
  readonly tankers = new Map<number, Tanker>();
  readonly attacks: Attack[] = [];
  readonly riverPoints: Vec2[] = [];
  readonly hazardClosed = new Set<number>();
  /** Radio links of the last connectivity check: [x0, y0, x1, y1, kind] (0 LoS, 1 via relay). */
  links: number[] = [];
  connectivity = 1;
  refills = 0;
  clustersCache: FireCluster[] = [];
  /** Coarse smoke field (10 m cells) for the speed factor, refreshed with the fire automaton. */
  readonly smoke = new Float32Array(14 * 14);
  private readonly edgeSlope: Float32Array;
  private fireAcc = 0;
  private lastPlan = -100;
  private nextAttackId = 1;
  private readonly lattice = new Map<string, number>();
  private readonly patrols: Vec2[][];

  constructor(o: WildfireOptions = {}) {
    super(o);
    this.terrain = new FireTerrain(o.seed ?? 0);
    this.grid = new FireGrid(this.terrain, o.seed ?? 0);
    this.grid.setWind(o.wind ?? 4);
    this.buildGraph();
    this.edgeSlope = new Float32Array(this.graph.edges.length);
    for (const e of this.graph.edges) {
      const a = this.graph.node(e.a), b = this.graph.node(e.b);
      let k = 0;
      for (let s = 0; s <= 4; s++) k += this.terrain.speedAt(a.x + (b.x - a.x) * s / 4, a.y + (b.y - a.y) * s / 4);
      this.edgeSlope[e.id] = k / 5;
    }
    for (const x of [-50, -30, -12, 12, 30, 50]) this.riverPoints.push({ x, y: this.terrain.riverY(x) + 4.8 });
    this.patrols = [
      [{ x: -50, y: -20 }, { x: -50, y: 20 }, { x: -24, y: 30 }, { x: -24, y: -10 }],
      [{ x: 10, y: 50 }, { x: 40, y: 56 }, { x: 56, y: 30 }, { x: 24, y: 20 }],
      [{ x: 30, y: -20 }, { x: 56, y: -24 }, { x: 56, y: 6 }, { x: 34, y: 4 }],
      [{ x: -40, y: 50 }, { x: -10, y: 58 }, { x: -6, y: 30 }, { x: -36, y: 36 }],
    ];
    this.buildFleet();
    this.network = new RouteNetwork(this.graph, this.rng.fork(), this.agents);
    this.network.edgeFactor = e => this.edgeSlope[e.id];
    this.teams.push(
      { id: 'Firefighter', capability: 'WATER_CANNON', size: 12 }, { id: 'Firebreak', capability: 'TRENCH_BLADE', size: 4 },
      { id: 'Scout-Relay', capability: 'THERMAL_RELAY', size: 6 }, { id: 'Supply', capability: 'TANKER_REFILL', size: 2 },
    );
    // Initial fires: two visible fronts and one hidden smoulder the scouts have to find.
    const fires = this.pickFires();
    this.grid.ignite(fires[0].x, fires[0].y, 0.7, 2, true);
    this.grid.ignite(fires[1].x, fires[1].y, 0.6, 1, true);
    this.grid.ignite(fires[2].x, fires[2].y, 0.3, 1, false);
    this.log(`ПОЖАР: два очага замечены с базы по дыму, ветер ${this.grid.windSpeed.toFixed(1)} м/с на северо-восток; рой из 24 роботов выходит через брод`);
    for (const a of this.agents) this.ground(a);
  }

  // ───────────────────────── construction ─────────────────────────

  private buildGraph(): void {
    const t = this.terrain, g = this.graph, n = Math.floor((FIRE_MAP.half - 6) / LATTICE);
    const id = (i: number, j: number): number => (j + n) * (2 * n + 1) + (i + n);
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const x = i * LATTICE, y = j * LATTICE;
      if (!t.passable(x, y)) continue;
      g.addNode(id(i, j), x, y);
      this.lattice.set(`${i},${j}`, id(i, j));
    }
    const ok = (a: Vec2, b: Vec2): boolean => {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let s = 0; s <= steps; s++) if (!t.passable(a.x + (b.x - a.x) * s / steps, a.y + (b.y - a.y) * s / steps)) return false;
      return true;
    };
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const a = this.lattice.get(`${i},${j}`);
      if (a === undefined) continue;
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const b = this.lattice.get(`${i + di},${j + dj}`);
        if (b === undefined) continue;
        if (ok(g.node(a), g.node(b))) g.addEdge(a, b);
      }
    }
  }

  private buildFleet(): void {
    const add = (name: string, team: string, cap: ModuleCapability, vmax: number): SwarmAgent => {
      const id = this.agents.length + 1, k = id - 1;
      const x = BASE_CAMP.x - 7 + (k % 8) * 1.9, y = BASE_CAMP.y - 3 + Math.floor(k / 8) * 2.2;
      const a = new SwarmAgent({ id, name, team, module: createModule(`${cap}-${id}`, cap), x, y, theta: Math.PI / 2, vmax, battery: 0.82 + this.rng.random() * 0.17 });
      a.drainIdle = 0.0004; a.drainMove = 0.0013; a.drainWork = 0.0018;
      this.agents.push(a);
      return a;
    };
    for (let i = 0; i < 12; i++) { const a = add(`Firefighter-${i + 1}`, 'Firefighter', 'WATER_CANNON', 1.45); this.tank.set(a.id, TANK_L); a.cargo = 1; this.fire.set(a.id, { attack: null, slot: 0, slots: 1, stage: 'STAGING', refill: null, target: -1, idleSince: 0, swap: null }); }
    for (let i = 0; i < 4; i++) { const a = add(`Firebreak-${i + 1}`, 'Firebreak', 'TRENCH_BLADE', 1.1); this.breakers.set(a.id, { stage: 'IDLE', ax: 0, ay: 0, bx: 0, by: 0, cleared: 0 }); }
    for (let i = 0; i < 6; i++) { const a = add(`Scout-Relay-${i + 1}`, 'Scout-Relay', 'THERMAL_RELAY', 1.55); this.scouts.set(a.id, { stage: 'PATROL', relay: null, loop: i % 4, wp: (i >> 2) * 2 }); }
    for (let i = 0; i < 2; i++) { const a = add(`Supply-${i + 1}`, 'Supply', 'TANKER_REFILL', 1.2); this.tank.set(a.id, TANKER_L); a.cargo = 1; this.tankers.set(a.id, { water: TANKER_L, stage: 'TO_STAGE', stageX: FORD.x + (i ? 6 : -6), stageY: this.terrain.riverY(FORD.x) + 9, served: 0 }); }
  }

  private pickFires(): Vec2[] {
    const pick = (cx: number, cy: number): Vec2 => {
      for (let r = 0; r < 20; r++) for (let a = 0; a < 12; a++) {
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (this.terrain.forestAt(x, y) > 0.55 && !this.terrain.isWater(x, y)) return { x, y };
      }
      return { x: cx, y: cy };
    };
    const j = (): number => this.rng.uniform(-5, 5);
    return [pick(6 + j(), -2 + j()), pick(-24 + j(), -6 + j()), pick(30 + j(), 22 + j())];
  }

  heightAt(x: number, y: number): number { return this.terrain.heightAt(x, y); }

  /** Wind speed (m/s), set from the UI slider. */
  get wind(): number { return this.grid.windSpeed; }
  set wind(v: number) { this.grid.setWind(v); }

  // ───────────────────────── operator actions ─────────────────────────

  /** «Добавить очаг возгорания»: a hidden smoulder in the forest, ≥ 25 m from every robot. */
  igniteRandom(): Vec2 | null {
    for (let attempt = 0; attempt < 400; attempt++) {
      const x = this.rng.uniform(-58, 58), y = this.rng.uniform(-20, 60);
      if (this.terrain.forestAt(x, y) < 0.5 || this.terrain.isWater(x, y)) continue;
      const k = this.grid.index(x, y);
      if (k < 0 || this.grid.state[k] !== CellState.UNBURNT) continue;
      if (this.agents.some(a => Math.hypot(a.x - x, a.y - y) < 25)) continue;
      this.grid.ignite(x, y, 0.35, 1, false);
      this.log('ПОЖАР: новое скрытое тление — координаты неизвестны рою, ведётся тепловизионный поиск');
      return { x, y };
    }
    return null;
  }

  // ───────────────────────── loops ─────────────────────────

  private ground(a: SwarmAgent): void {
    const t = this.terrain;
    a.z = t.heightAt(a.x, a.y);
    const gx = t.heightAt(a.x + 0.3, a.y) - t.heightAt(a.x - 0.3, a.y), gy = t.heightAt(a.x, a.y + 0.3) - t.heightAt(a.x, a.y - 0.3);
    const c = Math.cos(a.theta), s = Math.sin(a.theta);
    a.pitch = -Math.atan((gx * c + gy * s) / 0.6);
    a.roll = Math.atan((-gx * s + gy * c) / 0.6);
  }

  private smokeAt(x: number, y: number): number {
    const i = Math.floor((x + 70) / 10), j = Math.floor((y + 70) / 10);
    return i < 0 || j < 0 || i >= 14 || j >= 14 ? 0 : this.smoke[j * 14 + i];
  }

  protected control(dt: number): void {
    if (this.holding) { for (const a of this.agents) a.drive(dt); return; }
    const t = this.time;
    for (const a of this.agents) {
      // k_slope at the robot × smoke slowdown (not in the prior → learned through t̂_e).
      a.speedScale = this.terrain.speedAt(a.x, a.y) * (1 - 0.25 * Math.min(1, this.smokeAt(a.x, a.y)));
      const status = this.network.follow(a, t, dt);
      switch (a.module.capability) {
        case 'WATER_CANNON': this.firefighter(a, dt, status); break;
        case 'TRENCH_BLADE': this.breaker(a, dt, status); break;
        case 'THERMAL_RELAY': this.scout(a, dt, status); break;
        case 'TANKER_REFILL': this.tanker(a, dt, status); break;
        default: break;
      }
    }
  }

  protected physics(dt: number): void {
    for (const a of this.agents) this.ground(a);
    if (this.holding) return;
    this.fireAcc += dt;
    if (this.fireAcc >= 0.25 - 1e-9) {
      this.fireAcc -= 0.25;
      this.applyWater();
      this.grid.update(0.25);
      this.refreshSmoke();
    }
  }

  protected radio(): void {
    if (this.holding) return;
    const tick = this.clock.radioTick;
    // M0 consensus on the sector reference inside every attack group (20 Hz, lossy links).
    for (const at of this.attacks) {
      const n = at.members.length;
      if (n < 2) { at.converged = true; at.spread = 0; continue; }
      m0GroupStep(at.theta, at.delta, n, m0SafeEps(n), () => !this.linkUp());
      at.spread = m0Spread(at.theta, n);
      if (!at.converged && at.spread <= M0_THRESHOLD) {
        at.converged = true;
        this.log(`ТУШЕНИЕ: группа очага #${at.clusterId} согласовала сектора (M0, D(k) = ${at.spread.toFixed(4)} рад) — ${n} гидромониторов`);
      }
    }
    if (tick % 20 === 0) { this.clustersCache = this.grid.clusters(); this.detectFires(); this.planAttacks(); this.hazards(); this.connectivityCheck(); }
    if (tick % 100 === 0 || this.time - this.lastPlan > 18) this.planFirebreaks();
    if (tick % 200 === 50) this.planRelays();
  }

  // ───────────────────────── fire sensing / hazards ─────────────────────────

  private refreshSmoke(): void {
    this.smoke.fill(0);
    for (let n = 0; n < this.grid.burningCount; n++) {
      const k = this.grid.burning[n], x = this.grid.cx(k), y = this.grid.cy(k);
      // Smoke drifts downwind.
      const sx = x + this.grid.windX * 4, sy = y + this.grid.windY * 4;
      const i = Math.floor((sx + 70) / 10), j = Math.floor((sy + 70) / 10);
      if (i < 0 || j < 0 || i >= 14 || j >= 14) continue;
      this.smoke[j * 14 + i] += this.grid.intensity[k] * 0.12;
    }
  }

  private detectFires(): void {
    // Big smoke columns are seen from the base; scouts' thermal domes find smoulders (LoS, 24 m).
    for (const c of this.clustersCache) if (!c.detected && c.cells >= 14) { this.grid.detect(c.x, c.y, c.radius + 2); this.log(`ПОЖАР: столб дыма замечен с базы — очаг у (${c.x.toFixed(0)}; ${c.y.toFixed(0)})`); }
    for (const a of this.agents) {
      const range = a.module.capability === 'THERMAL_RELAY' ? 24 : 10;
      for (const c of this.clustersCache) {
        if (c.detected || Math.hypot(c.x - a.x, c.y - a.y) > range + c.radius) continue;
        if (a.module.capability === 'THERMAL_RELAY' && !lineOfSight({ x: a.x, y: a.y }, c, this.terrain, 1.2 + a.extension * 1.3, 0.5)) continue;
        if (this.grid.detect(c.x, c.y, c.radius + 2) > 0) { c.detected = true; this.log(`${a.name}: тепловизор обнаружил скрытый очаг у (${c.x.toFixed(0)}; ${c.y.toFixed(0)}) — координаты опубликованы в радиосеть`); }
      }
    }
  }

  /** S1: edges through intense fire close (HAZARD) and reopen once the flame is gone. */
  private hazards(): void {
    for (const e of this.graph.edges) {
      const a = this.graph.node(e.a), b = this.graph.node(e.b);
      let hot = 0;
      for (let s = 0; s <= 4; s++) {
        const k = this.grid.index(a.x + (b.x - a.x) * s / 4, a.y + (b.y - a.y) * s / 4);
        if (k >= 0 && this.grid.state[k] === CellState.BURNING) hot = Math.max(hot, this.grid.intensity[k]);
      }
      if (hot > 0.45 && !this.hazardClosed.has(e.id)) {
        this.hazardClosed.add(e.id);
        const r = this.network.closeEdge(e.id, 'HAZARD', this.time);
        if (r.length) this.log(`S1: ребро E${e.id} закрыто огнём · перепланировано ${r.length}`);
      } else if (hot < 0.1 && this.hazardClosed.has(e.id)) {
        this.hazardClosed.delete(e.id);
        this.network.openEdge(e.id);
      }
    }
  }

  private connectivityCheck(): void {
    const nodes: { x: number; y: number; h: number; relay: boolean }[] = [{ x: BASE_CAMP.x, y: BASE_CAMP.y, h: 6, relay: true }];
    for (const a of this.agents) nodes.push({ x: a.x, y: a.y, h: a.module.capability === 'THERMAL_RELAY' ? 1.2 + a.extension * 1.4 : 1, relay: this.scouts.get(a.id)?.stage === 'RELAY_ACTIVE' });
    const n = nodes.length, reached = new Uint8Array(n), queue = [0];
    reached[0] = 1;
    const links: number[] = [];
    while (queue.length) {
      const i = queue.shift()!;
      for (let j = 0; j < n; j++) {
        if (reached[j]) continue;
        const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        const range = a.relay || b.relay ? RELAY_RADIUS : 18;
        if (d > range || !lineOfSight(a, b, this.terrain, a.h, b.h)) continue;
        reached[j] = 1; queue.push(j);
        links.push(a.x, a.y, b.x, b.y, a.relay || b.relay ? 1 : 0);
      }
    }
    let ok = 0;
    for (let j = 1; j < n; j++) ok += reached[j];
    this.connectivity = ok / (n - 1);
    this.links = links;
  }

  // ───────────────────────── firefighters ─────────────────────────

  /** Two crews ended up on one merged front: the younger attack hands its members over. */
  private mergeAttack(from: Attack, into: Attack): void {
    for (const id of from.members) {
      if (into.members.length >= 12) break;
      into.theta[into.members.length] = into.members.length ? into.theta[0] : Math.atan2(this.grid.windY, this.grid.windX);
      into.members.push(id);
      this.fire.get(id)!.attack = into.clusterId;
    }
    into.converged = false;
    from.members.length = 0;
    from.lastSeen = -1;
    into.members.forEach((id, k) => { const r = this.fire.get(id)!; r.slot = k; r.slots = into.members.length; });
  }

  /** Upwind slots around every known fire, distributed by the J_ij auction. */
  private planAttacks(): void {
    const known = this.clustersCache.filter(c => c.detected).sort((p, q) => q.cells * q.maxI - p.cells * p.maxI);
    // Track clusters; dissolve attacks whose fire is out.
    // Track fronts: every attack follows its nearest overlapping cluster (smoothed); attacks that
    // end up on the same cluster merge; clusters nobody follows open a new attack.
    const owner = new Map<FireCluster, Attack>();
    for (const at of this.attacks) {
      let best: FireCluster | null = null, bd = Infinity;
      for (const c of known) { const d = Math.hypot(at.x - c.x, at.y - c.y); if (d < Math.min(at.radius, 16) + c.radius + 6 && d < bd) { bd = d; best = c; } }
      if (!best) continue;
      const prev = owner.get(best);
      if (prev) { this.mergeAttack(at, prev); continue; }
      owner.set(best, at);
      at.x += (best.x - at.x) * 0.5; at.y += (best.y - at.y) * 0.5; at.radius = best.radius; at.lastSeen = best.cells; at.seenAt = this.time;
    }
    for (const c of known) {
      if (owner.has(c) || [...owner.keys()].some(o => Math.hypot(o.x - c.x, o.y - c.y) < o.radius + c.radius)) continue;
      const at: Attack = { clusterId: this.nextAttackId++, x: c.x, y: c.y, radius: c.radius, members: [], theta: new Float64Array(12), delta: new Float64Array(12), spread: 0, converged: false, lastSeen: c.cells, seenAt: this.time };
      this.attacks.push(at);
      owner.set(c, at);
    }
    for (let i = this.attacks.length - 1; i >= 0; i--) if (this.attacks[i].members.length === 0 && this.attacks[i].lastSeen < 0) this.attacks.splice(i, 1);
    for (let i = this.attacks.length - 1; i >= 0; i--) {
      const at = this.attacks[i];
      // Grace period: a front that flickers out for a moment keeps its crew.
      if (this.time - at.seenAt < 5) continue;
      for (const id of at.members) { const r = this.fire.get(id)!; r.attack = null; if (r.stage === 'APPROACH' || r.stage === 'SUPPRESSING_FIRE') { r.stage = 'STAGING'; r.idleSince = this.time; } this.agent(id)!.working = false; }
      this.log(`ТУШЕНИЕ: очаг #${at.clusterId} ликвидирован`);
      this.attacks.splice(i, 1);
    }
    this.rebalanceCrews();
    // Demand per attack: 2 … 6 nozzles by fire size; free firefighters bid on open slots.
    const free = this.agents.filter(a => { const r = this.fire.get(a.id); return r && r.attack === null && (r.stage === 'STAGING') && (this.tank.get(a.id) ?? 0) > TANK_L * 0.3 && a.battery > HOT_SWAP_THRESHOLD; });
    if (!free.length || !this.attacks.length) return;
    const tasks: { id: number; capability: string; priority: number; at: Attack }[] = [];
    let tid = 0;
    for (const at of this.attacks) {
      const demand = Math.max(2, Math.min(6, Math.round(at.lastSeen / 10) + 2)) - at.members.length;
      for (let k = 0; k < demand; k++) tasks.push({ id: tid++, capability: 'WATER_CANNON', priority: Math.min(3, Math.round(at.lastSeen / 20)), at });
    }
    // Surplus nozzles (beyond one kept at the ford for new ignitions) reinforce the biggest fronts
    // instead of idling at the staging area; at most 9 per front.
    const bySize = [...this.attacks].sort((p, q) => q.lastSeen - p.lastSeen);
    for (let spare = free.length - tasks.length - 1, k = 0; spare > 0 && k < bySize.length * 9; k++) {
      const at = bySize[k % bySize.length];
      if (at.members.length + tasks.filter(x => x.at === at).length >= 9) continue;
      tasks.push({ id: tid++, capability: 'WATER_CANNON', priority: 0, at });
      spare--;
    }
    if (!tasks.length) return;
    const caches = new Map(free.map(a => [a.id, this.network.timesFrom(a)]));
    const result = runAuction(tasks, free.map(a => ({ id: a.id, capability: 'WATER_CANNON' })), (agentId, taskId): CostTerms => {
      const a = this.agent(agentId)!, at = tasks[taskId].at;
      const sx = at.x - this.grid.windX * (at.radius + 6), sy = at.y - this.grid.windY * (at.radius + 6);
      return { t: this.network.travelTime(a, sx, sy, undefined, caches.get(agentId)), q: 0, r: batteryRisk(a.battery), u: Math.min(1, this.smokeAt(sx, sy)) };
    });
    for (const w of result.awards) {
      const a = this.agent(w.agentId)!, at = tasks[w.taskId].at, r = this.fire.get(a.id)!;
      at.members.push(a.id);
      // Each member starts from its own anemometer estimate of the wind bearing (noisy); M0 aligns them.
      const n = at.members.length - 1;
      at.theta[n] = Math.atan2(this.grid.windY, this.grid.windX) + (this.rng.random() - 0.5) * 0.3;
      at.converged = false;
      r.attack = at.clusterId; r.stage = 'APPROACH';
      a.bid = w.cost; a.target = `очаг #${at.clusterId}`;
    }
    for (const at of this.attacks) at.members.forEach((id, k) => { const r = this.fire.get(id)!; r.slot = k; r.slots = at.members.length; });
    for (const at of this.attacks) for (const id of at.members) { const a = this.agent(id)!, r = this.fire.get(id)!; if (r.stage === 'APPROACH') this.routeToSlot(a, at, r); }
  }

  /**
   * A newly detected front with fewer than two nozzles and no free firefighter in reserve: the
   * largest crew (≥ 4) releases its member closest to the new front, which then bids in the auction.
   * Keeps far fires from waiting for a whole crew to run dry.
   */
  private rebalanceCrews(): void {
    const reserve = this.agents.some(a => { const r = this.fire.get(a.id); return r && r.attack === null && r.stage === 'STAGING' && (this.tank.get(a.id) ?? 0) > TANK_L * 0.3 && a.battery > HOT_SWAP_THRESHOLD; });
    if (reserve) return;
    for (const needy of this.attacks) {
      for (let pull = needy.members.length; pull < 2; pull++) {
        let donor: Attack | null = null;
        for (const at of this.attacks) if (at !== needy && at.members.length >= 4 && (!donor || at.members.length > donor.members.length)) donor = at;
        if (!donor) return;
        let best: SwarmAgent | null = null, bd = Infinity;
        for (const id of donor.members) {
          const a = this.agent(id)!, d = Math.hypot(a.x - needy.x, a.y - needy.y);
          if ((this.tank.get(id) ?? 0) > TANK_L * 0.35 && d < bd) { bd = d; best = a; }
        }
        if (!best) return;
        this.leaveAttack(best, this.fire.get(best.id)!);
        this.log(`АУКЦИОН: ${best.name} снят с очага #${donor.clusterId} (${donor.members.length + 1} стволов) на непокрытый очаг #${needy.clusterId}`);
      }
    }
  }

  /** Slot k of n on the upwind arc of the fire, using the robot's own (consensus) wind bearing. */
  /** Attack by cluster id without a per-call closure (control-rate lookup). */
  private attackById(id: number | null): Attack | undefined {
    if (id === null) return undefined;
    for (const at of this.attacks) if (at.clusterId === id) return at;
    return undefined;
  }

  private readonly slotScratch: Vec2 = { x: 0, y: 0 };

  /** Writes into a shared scratch point: copy it if it must outlive the next call. */
  private slotPoint(at: Attack, r: FireRole, a: SwarmAgent): Vec2 {
    const idx = at.members.indexOf(a.id);
    const theta = idx >= 0 ? at.theta[idx] : Math.atan2(this.grid.windY, this.grid.windX);
    const spread = r.slots > 1 ? (r.slot / (r.slots - 1) - 0.5) * 2.4 : 0;
    const phi = theta + Math.PI + spread, R = Math.min(at.radius, 14) + 6;
    let x = at.x + Math.cos(phi) * R, y = at.y + Math.sin(phi) * R;
    // Keep the slot on dry, passable ground.
    for (let k = 0; k < 6 && !this.terrain.passable(x, y); k++) { x = (x + at.x) / 2; y = (y + at.y) / 2; }
    this.slotScratch.x = Math.max(-66, Math.min(66, x));
    this.slotScratch.y = Math.max(-66, Math.min(66, y));
    return this.slotScratch;
  }

  private routeToSlot(a: SwarmAgent, at: Attack, r: FireRole): void {
    const p = this.slotPoint(at, r, a);
    this.network.plan(a, p.x, p.y, Math.atan2(at.y - p.y, at.x - p.x));
  }

  private firefighter(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const r = this.fire.get(a.id)!;
    const tank = this.tank.get(a.id)!;
    a.cargo = tank / TANK_L;
    a.working = false;
    if (r.stage !== 'HOT_SWAP' && r.stage !== 'REFILL_TRAVEL' && r.stage !== 'REFILLING' && a.battery < HOT_SWAP_THRESHOLD) { this.startFieldSwap(a, r); return; }
    switch (r.stage) {
      case 'STAGING': {
        a.task = 'STAGING'; a.progress = 0;
        if (!a.hasRoute && Math.hypot(a.x - FORD.x, a.y - (this.terrain.riverY(FORD.x) + 10)) > 8) this.network.plan(a, FORD.x + (a.id % 4 - 1.5) * 2.5, this.terrain.riverY(FORD.x) + 10 + Math.floor(a.id / 4) * 2, Math.PI / 2);
        if (tank < TANK_L * 0.6) this.startRefill(a, r);
        return;
      }
      case 'APPROACH': case 'SUPPRESSING_FIRE': {
        const at = this.attackById(r.attack);
        if (!at) { r.stage = 'STAGING'; r.attack = null; return; }
        const slot = this.slotPoint(at, r, a);
        const d = Math.hypot(slot.x - a.x, slot.y - a.y);
        if (r.stage === 'APPROACH') {
          a.task = 'APPROACH';
          a.progress = 0;
          // The slot drifts with the fire front: arrive within 3 m; re-route if the goal moved away.
          if (status === DriveStatus.Arrived || d < 3) { r.stage = 'SUPPRESSING_FIRE'; a.stop(); a.finalTheta = Math.atan2(at.y - a.y, at.x - a.x); applyModuleCommand(a.module, this.actions.issue(this.epoch, 'ARM')); }
          // Re-route only when the front drifted far, and not more often than every 8 s (keeps route progress).
          else if (!a.hasRoute || (Math.hypot(a.goalX - slot.x, a.goalY - slot.y) > 10 && this.time - r.idleSince > 8)) { this.routeToSlot(a, at, r); r.idleSince = this.time; }
          // Close enough to spray on the way in.
          if (d > 3 && this.grid.maxIntensityNear(a.x, a.y, NOZZLE_RANGE * 0.8) > 0.05 && tank > 0) this.spray(a, r, at, dt);
          if (tank <= TANK_L * 0.15) { this.leaveAttack(a, r); this.startRefill(a, r); }
          return;
        }
        // Hold the slot as the arc rotates with the consensus bearing and the front moves.
        if (d > 4 && !a.hasRoute) this.network.plan(a, slot.x, slot.y, Math.atan2(at.y - slot.y, at.x - slot.x));
        a.finalTheta = Math.atan2(at.y - a.y, at.x - a.x);
        a.task = 'SUPPRESSING_FIRE';
        if (!this.spray(a, r, at, dt)) { a.task = 'NO_TARGET'; if (this.time - r.idleSince > 4) { this.leaveAttack(a, r); } } else r.idleSince = this.time;
        if (tank <= TANK_L * 0.15) { this.leaveAttack(a, r); this.startRefill(a, r); }
        return;
      }
      case 'REFILL_TRAVEL': {
        a.task = 'REFILL_TRAVEL';
        const ref = r.refill!;
        const p = ref.kind === 'river' ? ref : this.agent(ref.id)!;
        if (ref.kind === 'tanker' && (this.tankers.get(ref.id)!.stage !== 'DEPLOYED' || this.tankers.get(ref.id)!.water < 10)) { this.startRefill(a, r); return; }
        const d = Math.hypot(p.x - a.x, p.y - a.y);
        if (d < (ref.kind === 'river' ? 1.2 : 1.6)) { r.stage = 'REFILLING'; a.stop(); }
        else if (!a.hasRoute) this.network.plan(a, p.x + (ref.kind === 'tanker' ? -Math.cos(a.id) * 1.1 : 0), p.y + (ref.kind === 'tanker' ? -Math.sin(a.id) * 1.1 : 0));
        return;
      }
      case 'REFILLING': {
        a.task = 'REFILLING'; a.working = false;
        const ref = r.refill!;
        let rate = RIVER_FILL_LPS;
        if (ref.kind === 'tanker') {
          const tk = this.tankers.get(ref.id)!;
          rate = Math.min(TANKER_FILL_LPS, tk.water / dt);
          tk.water -= Math.min(rate * dt, TANK_L - tank);
          if (a.battery < 0.5) { a.battery = 0.96; this.log(`ПОЛЕВОЙ HOT-SWAP: ${a.name} получил свежую батарею от ${this.agent(ref.id)!.name}`); if (r.swap) { this.completeHotSwap(r.swap); r.swap = null; } }
        }
        const next = Math.min(TANK_L, tank + rate * dt);
        this.tank.set(a.id, next);
        a.progress = next / TANK_L;
        if (next >= TANK_L - 0.01 || rate <= 0) {
          this.refills++;
          r.stage = 'STAGING'; r.refill = null; r.idleSince = this.time; a.bid = null;
          if (r.swap && a.battery > 0.5) { this.completeHotSwap(r.swap); r.swap = null; }
        }
        return;
      }
      case 'HOT_SWAP': {
        a.task = 'HOT_SWAP';
        const tk = [...this.tankers.entries()].find(([, v]) => v.stage === 'DEPLOYED');
        if (!tk) { if (!a.hasRoute) this.network.plan(a, BASE_CAMP.x, BASE_CAMP.y + 4); if (Math.hypot(a.x - BASE_CAMP.x, a.y - BASE_CAMP.y - 4) < 2) { a.battery = 0.96; r.stage = 'STAGING'; if (r.swap) { this.completeHotSwap(r.swap); r.swap = null; } } return; }
        r.refill = { kind: 'tanker', id: tk[0] }; r.stage = 'REFILL_TRAVEL';
        return;
      }
    }
  }

  private leaveAttack(a: SwarmAgent, r: FireRole): void {
    const at = this.attackById(r.attack);
    if (at) {
      const idx = at.members.indexOf(a.id);
      if (idx >= 0) { at.members.splice(idx, 1); for (let k = idx; k < at.members.length; k++) at.theta[k] = at.theta[k + 1]; }
      at.members.forEach((id, k) => { const q = this.fire.get(id)!; q.slot = k; q.slots = at.members.length; });
    }
    r.attack = null; r.stage = 'STAGING'; r.idleSince = this.time; a.working = false; a.bid = null; a.target = '';
    applyModuleCommand(a.module, this.actions.issue(this.epoch, 'SAFE'));
  }

  /** Spray the hottest burning cell in reach and in the robot's sector. Returns false without a target. */
  private spray(a: SwarmAgent, r: FireRole, at: Attack, dt: number): boolean {
    const tank = this.tank.get(a.id)!;
    if (tank <= 0) return false;
    const toFire = Math.atan2(at.y - a.y, at.x - a.x);
    let best = -1, score = -Infinity;
    for (let n = 0; n < this.grid.burningCount; n++) {
      const k = this.grid.burning[n], x = this.grid.cx(k), y = this.grid.cy(k), d = Math.hypot(x - a.x, y - a.y);
      if (d > NOZZLE_RANGE) continue;
      const bearing = Math.abs(Math.atan2(Math.sin(Math.atan2(y - a.y, x - a.x) - toFire), Math.cos(Math.atan2(y - a.y, x - a.x) - toFire)));
      if (bearing > 1.0) continue;
      const s = this.grid.intensity[k] - d * 0.03 - bearing * 0.2;
      if (s > score) { score = s; best = k; }
    }
    if (best < 0) return false;
    r.target = best;
    a.working = true;
    a.aimX = this.grid.cx(best); a.aimY = this.grid.cy(best); a.aimZ = this.grid.height[best];
    this.tank.set(a.id, Math.max(0, tank - FLOW_LPS * dt));
    a.progress = 1 - this.grid.intensity[best];
    if (a.module.state === 'ARMED') applyModuleCommand(a.module, this.actions.issue(this.epoch, 'START'));
    return true;
  }

  /** Water deposited at the fire tick from every spraying nozzle. */
  private applyWater(): void {
    for (const a of this.agents) if (a.working && a.module.capability === 'WATER_CANNON') { const r = this.fire.get(a.id)!; if (r.target >= 0) this.grid.douse(r.target, FLOW_LPS); }
  }

  /** River bank or a deployed tanker, by J_ij = t̂ + w_q·queue + w_e·r + w_u·u. */
  private startRefill(a: SwarmAgent, r: FireRole): void {
    const options: { ref: FireRole['refill']; terms: CostTerms }[] = [];
    const cache = this.network.timesFrom(a);
    for (const p of this.riverPoints) options.push({ ref: { kind: 'river', x: p.x, y: p.y }, terms: { t: this.network.travelTime(a, p.x, p.y, undefined, cache) + TANK_L / RIVER_FILL_LPS, q: 0, r: 0, u: 0 } });
    for (const [id, tk] of this.tankers) {
      if (tk.stage !== 'DEPLOYED' || tk.water < 25) continue;
      const tankerAgent = this.agent(id)!;
      const queue = [...this.fire.values()].filter(f => f.refill?.kind === 'tanker' && f.refill.id === id).length;
      options.push({ ref: { kind: 'tanker', id }, terms: { t: this.network.travelTime(a, tankerAgent.x, tankerAgent.y, undefined, cache) + TANK_L / TANKER_FILL_LPS, q: queue, r: 0, u: 0 } });
    }
    const result = runAuction(options.map((_, i) => ({ id: i, capability: 'REFILL', priority: 0 })), [{ id: a.id, capability: 'REFILL' }], (_, taskId) => options[taskId].terms);
    const best = result.bids.sort((p, q) => p.cost - q.cost)[0];
    if (!best) return;
    r.refill = options[best.taskId].ref; r.stage = 'REFILL_TRAVEL';
    a.bid = best.cost; a.target = r.refill!.kind === 'river' ? 'дозаправка у реки' : `танкер ${this.agent((r.refill as { id: number }).id)!.name}`;
    a.stop();
  }

  private startFieldSwap(a: SwarmAgent, r: FireRole): void {
    this.leaveAttack(a, r);
    r.swap = this.beginHotSwap(a, null);
    r.stage = 'HOT_SWAP';
    this.log(`HOT-SWAP: ${a.name} b = ${(a.battery * 100).toFixed(1)}% < 25% · epoch → ${this.epoch}; выход из зоны огня к танкеру`);
  }

  // ───────────────────────── firebreak dozers ─────────────────────────

  private planFirebreaks(): void {
    this.lastPlan = this.time;
    const known = this.clustersCache.filter(c => c.detected).sort((p, q) => q.cells - p.cells);
    const idle = [...this.breakers.entries()].filter(([, b]) => b.stage === 'IDLE').map(([id]) => this.agent(id)!);
    if (!known.length || !idle.length) return;
    const c = known[0], wx = this.grid.windX, wy = this.grid.windY;
    const cx = c.x + wx * (c.radius + 12), cy = c.y + wy * (c.radius + 12), nx = -wy, ny = wx;
    const segs: { ax: number; ay: number; bx: number; by: number }[] = [];
    for (let k = 0; k < 4; k++) {
      const s0 = -16 + k * 8, s1 = s0 + 8;
      const seg = { ax: cx + nx * s0, ay: cy + ny * s0, bx: cx + nx * s1, by: cy + ny * s1 };
      if (this.terrain.passable(seg.ax, seg.ay) && this.terrain.passable(seg.bx, seg.by)) segs.push(seg);
    }
    if (!segs.length) return;
    const result = runAuction(segs.map((_, i) => ({ id: i, capability: 'TRENCH_BLADE', priority: 0 })), idle.map(a => ({ id: a.id, capability: 'TRENCH_BLADE' })), (agentId, taskId): CostTerms => {
      const a = this.agent(agentId)!, s = segs[taskId];
      return { t: this.network.travelTime(a, s.ax, s.ay), q: 0, r: batteryRisk(a.battery), u: Math.min(1, this.smokeAt(s.ax, s.ay)) };
    });
    for (const w of result.awards) {
      const a = this.agent(w.agentId)!, b = this.breakers.get(a.id)!, s = segs[w.taskId];
      Object.assign(b, s, { stage: 'TO_LINE' as const, cleared: 0 });
      a.bid = w.cost; a.target = `полоса перед фронтом очага`;
      this.network.plan(a, s.ax, s.ay, Math.atan2(s.by - s.ay, s.bx - s.ax));
    }
    this.log(`ПРОСЕКА: аукцион J_ij распределил ${result.awards.length} участка минерализованной полосы перед фронтом (ветер ${this.grid.windSpeed.toFixed(1)} м/с)`);
  }

  private breaker(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const b = this.breakers.get(a.id)!;
    a.working = false;
    if (b.stage === 'IDLE') { a.task = 'IDLE'; a.progress = 0; a.bid = null; return; }
    if (b.stage === 'TO_LINE') {
      a.task = 'TO_LINE';
      if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - b.ax, a.y - b.ay) < 1)) {
        b.stage = 'CLEARING';
        a.stop(); a.wpX.push(b.bx); a.wpY.push(b.by); a.wpEdge.push(-1); a.finalTheta = Math.atan2(b.by - b.ay, b.bx - b.ax);
      } else if (!a.hasRoute) this.network.plan(a, b.ax, b.ay);
      return;
    }
    a.task = 'CLEARING_FIREBREAK';
    a.working = true;
    a.spin += dt * 25;
    a.speedScale = Math.min(a.speedScale, 0.5);
    const c = Math.cos(a.theta), s = Math.sin(a.theta);
    for (const off of [-1.4, 0, 1.4]) if (this.grid.clear(a.x + c * 0.6 - s * off, a.y + s * 0.6 + c * off)) b.cleared++;
    const total = Math.hypot(b.bx - b.ax, b.by - b.ay);
    a.progress = Math.min(1, 1 - Math.hypot(b.bx - a.x, b.by - a.y) / total);
    if (status === DriveStatus.Arrived || !a.hasRoute) { b.stage = 'IDLE'; a.working = false; a.task = 'IDLE'; }
  }

  // ───────────────────────── scouts / relays ─────────────────────────

  /** Relay chain base → each known fire over hilltop candidates (30 m, line of sight). */
  private planRelays(): void {
    const known = this.clustersCache.filter(c => c.detected).sort((p, q) => q.cells - p.cells).slice(0, 2);
    const candidates = this.graph.nodes.filter(n => this.terrain.heightAt(n.x, n.y) > 2).map(n => ({ x: n.x, y: n.y })).concat(this.terrain.hills);
    const wanted: Vec2[] = [];
    for (const c of known) {
      // Dijkstra over hop count with a height bonus.
      const src = { x: BASE_CAMP.x, y: BASE_CAMP.y }, nodes = [src, ...candidates], n = nodes.length;
      const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
      dist[0] = 0;
      let goal = -1;
      for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
        if (u < 0) break;
        done[u] = 1;
        if (u > 0 && Math.hypot(nodes[u].x - c.x, nodes[u].y - c.y) <= RELAY_RADIUS - 4 && lineOfSight(nodes[u], c, this.terrain, 2.6, 1)) { goal = u; break; }
        for (let v = 1; v < n; v++) {
          if (done[v]) continue;
          const d = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
          if (d > RELAY_RADIUS - 2 || d < 4) continue;
          if (!lineOfSight(nodes[u], nodes[v], this.terrain, u === 0 ? 6 : 2.6, 2.6)) continue;
          const w = 1 + 0.03 * (12 - Math.min(12, this.terrain.heightAt(nodes[v].x, nodes[v].y)));
          if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
        }
      }
      for (let v = goal; v > 0; v = prev[v]) if (!wanted.some(p => Math.hypot(p.x - nodes[v].x, p.y - nodes[v].y) < 6)) wanted.push(nodes[v]);
    }
    const relays = wanted.slice(0, 5);
    const scoutIds = [...this.scouts.keys()];
    // Keep relays already standing on a wanted point.
    // Sticky chain: a relay already on (or heading to) a point within 12 m of a wanted one keeps it.
    const near = (p: Vec2, q: Vec2): boolean => Math.hypot(p.x - q.x, p.y - q.y) < 12;
    const tasks = relays.filter(p => !scoutIds.some(id => { const s = this.scouts.get(id)!; return s.relay && near(s.relay, p); }));
    for (const id of scoutIds) {
      const s = this.scouts.get(id)!;
      if (s.relay && !relays.some(p => near(s.relay!, p)) && this.connectivity > 0.9) { s.relay = null; s.stage = 'PATROL'; this.agent(id)!.stop(); }
    }
    const free = scoutIds.filter(id => !this.scouts.get(id)!.relay).map(id => this.agent(id)!);
    if (!tasks.length || !free.length) return;
    const result = runAuction(tasks.map((_, i) => ({ id: i, capability: 'THERMAL_RELAY', priority: 0 })), free.map(a => ({ id: a.id, capability: 'THERMAL_RELAY' })), (agentId, taskId): CostTerms => {
      const a = this.agent(agentId)!, p = tasks[taskId];
      return { t: this.network.travelTime(a, p.x, p.y), q: 0, r: batteryRisk(a.battery), u: this.network.uncertainty(a, p.x, p.y) };
    });
    for (const w of result.awards) {
      const a = this.agent(w.agentId)!, s = this.scouts.get(a.id)!, p = tasks[w.taskId];
      s.relay = { ...p }; s.stage = 'TO_RELAY';
      a.bid = w.cost; a.target = `высота (${p.x.toFixed(0)}; ${p.y.toFixed(0)}) · ${this.terrain.heightAt(p.x, p.y).toFixed(1)} м`;
      this.network.plan(a, p.x, p.y);
    }
    if (result.awards.length) this.log(`СВЯЗЬ: цепочка реле база → очаг · ${relays.length} высот; аукцион J_ij назначил ретрансляторов: ${result.awards.length}`);
  }

  private scout(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const s = this.scouts.get(a.id)!;
    if (s.stage === 'RELAY_ACTIVE') {
      a.extension = Math.min(1, a.extension + dt / 3);
      a.task = 'RELAY_ACTIVE'; a.working = true; a.progress = a.extension;
      return;
    }
    a.extension = Math.max(0, a.extension - dt / 2);
    a.working = false;
    if (s.stage === 'TO_RELAY' && s.relay) {
      a.task = 'TO_RELAY';
      if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - s.relay.x, a.y - s.relay.y) < 1)) { s.stage = 'RELAY_ACTIVE'; this.log(`СВЯЗЬ: ${a.name} развернул мачту-ретранслятор на высоте ${a.z.toFixed(1)} м`); }
      else if (!a.hasRoute) this.network.plan(a, s.relay.x, s.relay.y);
      return;
    }
    a.task = 'THERMAL_RECON'; a.bid = null; a.target = `патруль сектора ${s.loop + 1}`;
    if (!a.hasRoute) {
      const loop = this.patrols[s.loop], p = loop[s.wp % loop.length];
      s.wp++;
      this.network.plan(a, p.x, p.y);
    }
    a.progress = (s.wp % 4) / 4;
  }

  // ───────────────────────── tankers ─────────────────────────

  private tanker(a: SwarmAgent, dt: number, status: DriveStatus): void {
    const tk = this.tankers.get(a.id)!;
    a.cargo = tk.water / TANKER_L;
    this.tank.set(a.id, tk.water);
    a.working = false;
    switch (tk.stage) {
      case 'TO_STAGE': {
        a.task = 'TO_STAGE';
        const known = this.attacks[0];
        if (known) { tk.stageX = known.x - this.grid.windX * (known.radius + 18) + (a.id % 2 ? 4 : -4); tk.stageY = known.y - this.grid.windY * (known.radius + 18); }
        if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - tk.stageX, a.y - tk.stageY) < 1.5)) { tk.stage = 'DEPLOYED'; this.log(`СНАБЖЕНИЕ: ${a.name} развёрнут у линии огня · ${tk.water.toFixed(0)} л воды и запасные батареи`); }
        else if (!a.hasRoute) this.network.plan(a, tk.stageX, tk.stageY);
        return;
      }
      case 'DEPLOYED': {
        let serving = 0;
        for (const f of this.fire.values()) if (f.stage === 'REFILLING' && f.refill?.kind === 'tanker' && f.refill.id === a.id) serving++;
        a.task = serving ? 'REFILL_TRANSFER' : 'TANKER_DEPLOYED';
        a.working = serving > 0;
        a.spin += dt * (serving ? 6 : 0);
        a.progress = tk.water / TANKER_L;
        if (tk.water < 70) { tk.stage = 'TO_RIVER'; const p = this.nearestRiver(a); this.network.plan(a, p.x, p.y); a.target = 'забор воды у брода'; }
        // Follow the fire if it moved far away.
        const known = this.attacks[0];
        if (known && Math.hypot(known.x - a.x, known.y - a.y) > known.radius + 36 && !serving) tk.stage = 'TO_STAGE';
        return;
      }
      case 'TO_RIVER': {
        a.task = 'TO_RIVER';
        const p = this.nearestRiver(a);
        if (status === DriveStatus.Arrived || (!a.hasRoute && Math.hypot(a.x - p.x, a.y - p.y) < 1.5)) tk.stage = 'FILLING';
        else if (!a.hasRoute) this.network.plan(a, p.x, p.y);
        return;
      }
      case 'FILLING': {
        a.task = 'REFILLING'; a.working = true; a.spin += dt * 6;
        tk.water = Math.min(TANKER_L, tk.water + 25 * dt);
        a.progress = tk.water / TANKER_L;
        if (tk.water >= TANKER_L) { tk.stage = 'TO_STAGE'; a.target = 'к линии огня'; }
        return;
      }
    }
  }

  private nearestRiver(a: SwarmAgent): Vec2 {
    let best = this.riverPoints[0], bd = Infinity;
    for (const p of this.riverPoints) { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // ───────────────────────── telemetry ─────────────────────────

  snapshot(): WorkflowSnapshot {
    const c = this.grid.counts();
    const affected = c.burning + c.burnt + c.extinguished;
    let water = 0, cap = 0;
    for (const a of this.agents) if (a.module.capability === 'WATER_CANNON') { water += this.tank.get(a.id)!; cap += TANK_L; }
    const kpi: WildfireKpi = {
      activeFires: this.clustersCache.filter(x => x.detected).length,
      burningCells: c.burning,
      contained: affected ? (c.burnt + c.extinguished) / affected : 1,
      burnt: c.burnt, extinguished: c.extinguished, firebreakCells: c.firebreak,
      waterFleet: water, waterCapacity: cap,
      connectivity: this.connectivity,
      relaysActive: [...this.scouts.values()].filter(s => s.stage === 'RELAY_ACTIVE').length,
      wind: this.grid.windSpeed,
      replans: this.network.replans, updates: this.network.updates, refills: this.refills, epoch: this.epoch,
    };
    const badges: WorkflowBadge[] = this.attacks.map(at => ({
      id: `fire-${at.clusterId}`, x: at.x, y: at.y, z: this.terrain.heightAt(at.x, at.y) + 7,
      title: `Очаг #${at.clusterId}`,
      detail: `${(at.lastSeen * CELL * CELL / 10000).toFixed(2)} га · ${at.members.length} гидромонит. · M0 ${at.converged ? '✓' : '…'}`,
      progress: null, tone: 'destructive' as const,
    }));
    const rows = this.agents.map(a => this.baseRow(a, this.tank.has(a.id) ? { load: this.tank.get(a.id)!, loadPct: this.tank.get(a.id)! / (a.module.capability === 'TANKER_REFILL' ? TANKER_L : TANK_L) } : {}));
    return { kind: 'wildfire', kpi, rows, badges };
  }
}


