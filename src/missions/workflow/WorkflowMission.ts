/**
 * Swarm Agentic Workflow base (scientific documentation §1.10–1.16): heterogeneous robots on one
 * Strafer chassis with swappable task modules, coordinated through the four layers
 * chassis → task module → agent / allocation → coordination & learning.
 *
 * Fixed rates: physics 100 Hz (Δt = 10 ms), control 50 Hz, virtual radio 20 Hz. The simulation is
 * deterministic for a seed and shared verbatim by the browser and the headless tests.
 */
import { LoopClock, CONTROL_DT, PHYSICS_DT, RADIO_DT } from '../../simulation/engine/loopClock';
import { Rng } from '../../swarm/rng';
import type { SwarmAgent } from '../../core/agents/SwarmAgent';
import { applyModuleCommand, ActionCounter, type ModuleCapability } from '../../core/agents/taskModule';
import type { RouteNetwork } from '../../core/routing/RouteNetwork';
import type { WorkflowRow, WorkflowSnapshot, WorkflowTeam } from './types';

export const HOT_SWAP_THRESHOLD = 0.25;

export interface WorkflowOptions { seed?: number; onEvent?: (text: string, t: number) => void }

export interface RestoreRecord { agentId: number; replacementId: number | null; tEvent: number; tRestore: number | null; epoch: number }

export abstract class WorkflowMission {
  abstract readonly kind: WorkflowSnapshot['kind'];
  readonly clock = new LoopClock();
  readonly agents: SwarmAgent[] = [];
  readonly teams: WorkflowTeam[] = [];
  abstract readonly network: RouteNetwork;
  readonly rng: Rng;
  readonly radioRng: Rng;
  /** Group composition epoch: incremented on every membership change (hot-swap, failure). */
  epoch = 0;
  holding = false;
  readonly events: { t: number; text: string }[] = [];
  readonly restores: RestoreRecord[] = [];
  protected readonly actions = new ActionCounter();
  private readonly onEvent?: WorkflowOptions['onEvent'];
  private lossValue = 0;

  constructor(o: WorkflowOptions) {
    this.rng = new Rng(o.seed ?? 0);
    this.radioRng = new Rng((o.seed ?? 0) + 7919);
    this.onEvent = o.onEvent;
  }

  get time(): number { return this.clock.time; }
  get lossP(): number { return this.lossValue; }
  set lossP(p: number) { this.lossValue = Math.min(1, Math.max(0, p)); this.network.lossP = this.lossValue; }
  get learning(): boolean { return this.network.learning; }
  set learning(v: boolean) { this.network.learning = v; }

  agent(id: number): SwarmAgent | undefined { return this.agents[id - 1]?.id === id ? this.agents[id - 1] : this.agents.find(a => a.id === id); }

  /** Ground height (m) — flat unless the mission has terrain. */
  heightAt(_x: number, _y: number): number { return 0; }

  /** One 10 ms physics tick (control and radio run on their integer subdivisions). */
  step(_dt = PHYSICS_DT): void {
    if (this.clock.controlDue) this.control(CONTROL_DT);
    if (this.clock.radioDue) this.radio(RADIO_DT);
    for (const a of this.agents) a.integrate(PHYSICS_DT);
    this.separate();
    this.physics(PHYSICS_DT);
    this.clock.advance();
  }

  /** Advance `seconds` of model time (headless runs). */
  run(seconds: number): void {
    const n = Math.round(seconds / PHYSICS_DT);
    for (let i = 0; i < n; i++) this.step();
  }

  protected abstract control(dt: number): void;
  protected abstract radio(dt: number): void;
  protected physics(_dt: number): void {}
  abstract snapshot(): WorkflowSnapshot;

  /** Operator emergency stop: wheels brake, every module goes SAFE (idempotent command). */
  hold(): void {
    if (this.holding) return;
    this.holding = true;
    for (const a of this.agents) {
      a.hold = true;
      a.working = false;
      applyModuleCommand(a.module, this.actions.issue(this.epoch, 'SAFE'));
    }
    this.log('ОПЕРАТОР: экстренная остановка — все модули переведены в SAFE, шасси тормозят');
  }

  protected log(text: string): void {
    this.events.push({ t: this.time, text });
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
    this.onEvent?.(text, this.time);
  }

  /** Start a hot-swap: the group epoch advances, stale packets are dropped from now on. */
  protected beginHotSwap(agent: SwarmAgent, replacement: SwarmAgent | null): RestoreRecord {
    this.epoch++;
    for (const a of this.agents) a.epoch = this.epoch;
    const r: RestoreRecord = { agentId: agent.id, replacementId: replacement?.id ?? null, tEvent: this.time, tRestore: null, epoch: this.epoch };
    this.restores.push(r);
    return r;
  }

  protected completeHotSwap(r: RestoreRecord): void {
    if (r.tRestore !== null) return;
    r.tRestore = this.time;
    this.log(`HOT-SWAP: функция восстановлена за ${(r.tRestore - r.tEvent).toFixed(1)} с (epoch ${r.epoch})`);
  }

  /** Mean t_restore − t_event over completed swaps (s), or null. */
  get meanRestore(): number | null {
    const done = this.restores.filter(r => r.tRestore !== null);
    return done.length ? done.reduce((s, r) => s + (r.tRestore! - r.tEvent), 0) / done.length : null;
  }

  /** True when the packet between two robots is delivered this radio tick. */
  protected linkUp(): boolean { return !this.radioRng.bernoulli(this.lossP); }

  /** Agents that may not be pushed by the separation step (docked, working at a station). */
  protected anchored(a: SwarmAgent): boolean { return a.working || !a.hasRoute; }

  /**
   * Minimal footprint separation (0.62 m between centres): pairs push apart, and robots that meet
   * head-on both strafe to their right — Mecanum wheels make the sidestep free.
   */
  private separate(): void {
    const n = this.agents.length, R = 0.62;
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.agents[j];
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 < 1e-10) continue;
        const d = Math.sqrt(d2), push = (R - d) * 0.25, nx = dx / d, ny = dy / d;
        const fa = this.anchored(a), fb = this.anchored(b);
        if (fa && fb) continue;
        const wa = fa ? 0 : fb ? 1 : 0.5, wb = fb ? 0 : fa ? 1 : 0.5;
        a.x -= nx * push * wa; a.y -= ny * push * wa;
        b.x += nx * push * wb; b.y += ny * push * wb;
        // Head-on: both sidestep right of their own travel direction.
        if (!fa && a.speed > 0.05) { a.x += Math.sin(Math.atan2(a.vy, a.vx)) * push * 0.6; a.y -= Math.cos(Math.atan2(a.vy, a.vx)) * push * 0.6; }
        if (!fb && b.speed > 0.05) { b.x += Math.sin(Math.atan2(b.vy, b.vx)) * push * 0.6; b.y -= Math.cos(Math.atan2(b.vy, b.vx)) * push * 0.6; }
      }
    }
  }

  /** Common telemetry row. */
  protected baseRow(a: SwarmAgent, extra: Partial<WorkflowRow> = {}): WorkflowRow {
    return {
      id: a.id, name: a.name, team: a.team, module: a.module.capability, moduleState: a.module.state,
      task: a.task, target: a.target, bid: a.bid, progress: a.progress, battery: a.battery,
      epoch: a.epoch, hold: a.hold, active: a.active, edgeEstimate: this.network.currentEdgeEstimate(a),
      ...extra,
    };
  }

  /** Team (brigade) of a robot — capability changes during hot-swap move the robot between teams. */
  teamOf(id: number): string | undefined { return this.agent(id)?.team; }

  /** Robots of a team. */
  members(team: string): SwarmAgent[] { return this.agents.filter(a => a.team === team); }

  protected capabilityTeam(cap: ModuleCapability): WorkflowTeam | undefined { return this.teams.find(t => t.capability === cap); }
}
