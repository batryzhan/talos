/**
 * SwarmFleet — several cooperating sub-swarms (teams) of an 8…32-robot fleet (CLAUDE.md v2 §4).
 *
 * Each team is a SwarmManager (its own ring radio, epoch, controller A/B/C, FSM, formula-16 platform)
 * over a subset of the robots. The fleet adds:
 *  - dispatch of SubSwarmAssignment onto payloads, team phases (TeamPhase)
 *  - DOCKING_ALIGN → PRECISION_MATE → MATED: two teams converge their target heights by the M0
 *    consensus law (2-node graph, mean-preserving) and the mover team servoes its payload onto the
 *    mating pose using the payload pose MEASURED from its robots (|Δh| < 1 mm, |Δθ| < 0.2°, 1 mm)
 *  - CHARGING_DOCK hot-swap: a member with b_i < 0.25 is replaced by a reserve while the team
 *    freezes the load; the leaving robot is removed (epoch++), lowers, drives to a free charger;
 *    the reserve stages outside the formation, joins (epoch++), approaches its support point,
 *    seeks contact, lifts to h* and resumes TRANSPORT. Leaving is only allowed if the remaining
 *    supports keep the stability margin ρ ≥ ρ_min (support polygon recomputed).
 *  - simple point-to-point driving for robots outside teams (to chargers, staging, parking).
 *
 * Inter-robot collision avoidance is NOT modelled here (platform / missions responsibility).
 */
import type {
  AgentDuty, ChargingStation, DockingSpec, DockingTelemetry, FleetEvent, FleetStepOutput, FleetWorldState,
  OperationMode, Pose2D, SubSwarmAssignment, SwarmConfig, TeamPhase, TeamTelemetry, Vec2, WorldState,
} from '../contracts/types';
import { CONTROL_HZ } from '../contracts/types';
import type { TalosRobotAgent } from '../robot/TalosRobotAgent';
import { inverseKinematics, worldToBody } from '../robot/mecanum';
import { consensusStep } from './consensus';
import { Rng } from './rng';
import { SwarmManager } from './SwarmManager';
import { stabilityMargin } from './supportPolygon';
import { offsetToWorld, supportPointWorld, wrapAngle } from './virtualPlatform';

export interface SwarmFleetOptions {
  seed?: number;
  chargers?: Vec2[];
  /** Battery level that triggers a hot-swap (default 0.25). */
  lowBattery?: number;
  /** Minimum charge for a reserve to be sent in (default 0.8). */
  reserveMinBattery?: number;
  /** Charging rate (state of charge per second, simulation-accelerated; default 0.05). */
  chargeRate?: number;
  /** Driving speed outside formations (m/s). */
  driveSpeed?: number;
  /** Distance of the reserve staging point outside the support point (m). */
  stagingDistance?: number;
  constrainPose?: Parameters<TalosRobotAgent['step']>[1];
  /** Defaults applied to every team's SwarmManager config. */
  defaults?: Partial<SwarmConfig>;
  /** Where charged reserves park (else they stay next to the charger). */
  reserveParking?: Record<number, Vec2>;
}

interface Swap {
  lowId: number;
  reserveId: number;
  r: Vec2;
  headingOffset: number;
  stage: 'settle' | 'release' | 'rejoin';
  t0: number;
  staging: Vec2;
  resume: TeamPhase;
}

interface Team {
  a: SubSwarmAssignment;
  mgr: SwarmManager;
  phase: TeamPhase;
  special: TeamPhase | null;
  lifted: boolean;
  swap: Swap | null;
  blockedNotified: boolean;
  headingOffsets: Record<number, number>;
}

interface Dock {
  spec: Required<DockingSpec>;
  phase: 'DOCKING_ALIGN' | 'PRECISION_MATE' | 'MATED';
  stableSince: number | null;
  tel: DockingTelemetry;
}

interface NavGoal { pos: Vec2; theta?: number }

const DT_CTRL = 1 / CONTROL_HZ;
const DOCK_EPS = 0.2; // ε of the 2-node M0 height consensus (< 1/d_max = 1)

export class SwarmFleet {
  private readonly agentsById = new Map<number, TalosRobotAgent>();
  private readonly duty = new Map<number, AgentDuty>();
  private readonly goals = new Map<number, NavGoal>();
  private readonly teams = new Map<string, Team>();
  private readonly docks: Dock[] = [];
  readonly chargers: ChargingStation[];
  private readonly rng: Rng;
  private readonly o: Required<Omit<SwarmFleetOptions, 'constrainPose' | 'defaults' | 'reserveParking' | 'chargers' | 'seed'>> & SwarmFleetOptions;
  private t = 0;
  private ctrlAcc = DT_CTRL;
  private events: FleetEvent[] = [];

  constructor(agents: TalosRobotAgent[], options: SwarmFleetOptions = {}) {
    this.o = { lowBattery: 0.25, reserveMinBattery: 0.8, chargeRate: 0.05, driveSpeed: 0.35, stagingDistance: 0.75, ...options };
    this.rng = new Rng(options.seed ?? 0);
    for (const a of agents) {
      if (this.agentsById.has(a.id)) throw new Error(`SwarmFleet: duplicate agent id ${a.id}`);
      this.agentsById.set(a.id, a);
      this.duty.set(a.id, 'IDLE');
    }
    this.chargers = (options.chargers ?? []).map((pos, i) => ({ id: `charger-${i + 1}`, pos: { ...pos }, occupiedBy: null }));
  }

  // ───────────────────────── roster ─────────────────────────

  get time(): number { return this.t; }
  agent(id: number): TalosRobotAgent | undefined { return this.agentsById.get(id); }
  dutyOf(id: number): AgentDuty | undefined { return this.duty.get(id); }
  team(id: string): SwarmManager | undefined { return this.teams.get(id)?.mgr; }
  teamPhase(id: string): TeamPhase | undefined { return this.teams.get(id)?.phase; }
  get teamIds(): string[] { return [...this.teams.keys()]; }

  /** Mark robots as reserves (available for hot-swap). */
  setReserves(ids: number[], parking?: Record<number, Vec2>): void {
    for (const id of ids) {
      if (!this.agentsById.has(id)) throw new Error(`SwarmFleet: unknown agent ${id}`);
      if (this.teamOf(id)) throw new Error(`SwarmFleet: agent ${id} is in a team`);
      this.duty.set(id, 'RESERVE');
      const p = parking?.[id] ?? this.o.reserveParking?.[id];
      if (p) this.goals.set(id, { pos: { ...p } });
    }
  }

  private teamOf(id: number): Team | undefined {
    for (const t of this.teams.values()) if (t.mgr.has(id)) return t;
    return undefined;
  }

  // ───────────────────────── dispatch ─────────────────────────

  /** Create a team on a payload (SubSwarmAssignment). Agents become ACTIVE. */
  dispatch(a: SubSwarmAssignment): SwarmManager {
    if (this.teams.has(a.teamId)) throw new Error(`SwarmFleet: team ${a.teamId} exists`);
    const agents = a.agentIds.map(id => {
      const ag = this.agentsById.get(id);
      if (!ag) throw new Error(`SwarmFleet: unknown agent ${id}`);
      if (this.teamOf(id)) throw new Error(`SwarmFleet: agent ${id} already in a team`);
      return ag;
    });
    const missing = a.agentIds.filter(id => !a.supports.some(s => s.agentId === id));
    if (missing.length) throw new Error(`SwarmFleet: no support point for agents ${missing.join(',')}`);
    const d = this.o.defaults ?? {};
    const mgr = new SwarmManager(agents, {
      ...d,
      seed: this.rng.nextU32(),
      task: a.task,
      controller: a.controller ?? d.controller ?? 'C',
      targetHeight: a.targetHeight ?? d.targetHeight ?? 0.1,
      network: { ...DEFAULT_NET, ...d.network, ...a.network },
    }, { constrainPose: this.o.constrainPose });
    mgr.assignSupports(a.supports, a.payloadPose);
    for (const id of a.agentIds) { this.duty.set(id, 'ACTIVE'); this.goals.delete(id); }
    this.teams.set(a.teamId, { a: { ...a, supports: a.supports.map(s => ({ ...s, r: { ...s.r } })) }, mgr, phase: 'FORMING', special: null, lifted: false, swap: null, blockedNotified: false, headingOffsets: {} });
    return mgr;
  }

  /** Approach + lift request for a team. */
  startTeam(teamId: string): void {
    const t = this.requireTeam(teamId);
    t.mgr.beginApproach();
    t.mgr.requestLift();
  }

  /** Remove a team (after LOWER/DONE). Its robots become IDLE. */
  dismiss(teamId: string): void {
    const t = this.requireTeam(teamId);
    for (const id of t.mgr.ids) this.duty.set(id, 'IDLE');
    this.teams.delete(teamId);
  }

  private requireTeam(id: string): Team {
    const t = this.teams.get(id);
    if (!t) throw new Error(`SwarmFleet: no team ${id}`);
    return t;
  }

  // ───────────────────────── docking ─────────────────────────

  /** Start cooperative docking: mover team brings its payload onto `matePose` in the base payload frame. */
  dock(spec: DockingSpec): void {
    this.requireTeam(spec.baseTeam); this.requireTeam(spec.moverTeam);
    const full: Required<DockingSpec> = { heightOffset: 0, tolHeight: 0.001, tolTheta: (0.2 * Math.PI) / 180, tolPos: 0.001, ...spec };
    this.docks.push({
      spec: full, phase: 'DOCKING_ALIGN', stableSince: null,
      tel: { baseTeam: spec.baseTeam, moverTeam: spec.moverTeam, phase: 'DOCKING_ALIGN', heightError: Infinity, posError: Infinity, thetaError: Infinity },
    });
  }

  /** Payload pose estimated from the robots' poses (what the team actually carries). */
  measuredPayloadPose(teamId: string, world?: FleetWorldState): Pose2D {
    const t = this.requireTeam(teamId);
    const phys = t.a.payloadId ? world?.payloads?.[t.a.payloadId] : undefined;
    if (phys) return { ...phys.pose };
    const ref = t.mgr.payloadReference;
    let sx = 0, sy = 0, ss = 0, sc = 0, n = 0;
    for (const ag of t.mgr.agents) {
      const r = t.mgr.supportOf(ag.id);
      if (!r) continue;
      const th = ag.pose.theta - (t.headingOffsets[ag.id] ?? 0);
      ss += Math.sin(th); sc += Math.cos(th);
      n++;
    }
    const theta = n ? Math.atan2(ss, sc) : ref.theta;
    for (const ag of t.mgr.agents) {
      const r = t.mgr.supportOf(ag.id);
      if (!r) continue;
      const o = offsetToWorld(r, theta);
      sx += ag.pose.x - o.x; sy += ag.pose.y - o.y;
    }
    return n ? { x: sx / n, y: sy / n, theta } : { ...ref };
  }

  private meanHeight(t: Team): number {
    const hs = t.mgr.agents.map(a => a.lift.h);
    return hs.reduce((s, v) => s + v, 0) / Math.max(1, hs.length);
  }

  private dockTick(world: FleetWorldState): void {
    for (const d of this.docks) {
      const base = this.requireTeam(d.spec.baseTeam), mover = this.requireTeam(d.spec.moverTeam);
      const carrying = (t: Team) => t.mgr.agents.length > 0 && t.mgr.agents.every(a => a.mode === 'TRANSPORT');
      if (base.phase === 'HOLD' || mover.phase === 'HOLD') { d.tel.phase = 'HOLD'; continue; }
      if (!carrying(base) || !carrying(mover) || base.swap || mover.swap) continue;
      base.special = d.phase; mover.special = d.phase;

      // (1) M0 height consensus on the 2-node graph: x = [h*_base, h*_mover − offset]
      const x = consensusStep([base.mgr.targetHeight, mover.mgr.targetHeight - d.spec.heightOffset], [[0, 1]], DOCK_EPS);
      base.mgr.setTargetHeight(x[0]);
      mover.mgr.setTargetHeight(x[1] + d.spec.heightOffset);

      // (2) planar servo of the mover payload onto the mating pose (measured poses)
      const pb = this.measuredPayloadPose(d.spec.baseTeam, world), pm = this.measuredPayloadPose(d.spec.moverTeam, world);
      const mo = offsetToWorld(d.spec.matePose, pb.theta);
      const goal = { x: pb.x + mo.x, y: pb.y + mo.y, theta: pb.theta + d.spec.matePose.theta };
      const ex = goal.x - pm.x, ey = goal.y - pm.y, eth = wrapAngle(goal.theta - pm.theta);
      const pos = Math.hypot(ex, ey);
      const hErr = Math.abs(this.meanHeight(mover) - this.meanHeight(base) - d.spec.heightOffset);
      d.tel = { baseTeam: d.spec.baseTeam, moverTeam: d.spec.moverTeam, phase: d.phase, heightError: hErr, posError: pos, thetaError: Math.abs(eth) };

      base.mgr.setTransportCommand({ vc: { x: 0, y: 0 }, omegaC: 0 });
      if (d.phase === 'MATED') { mover.mgr.setTransportCommand({ vc: { x: 0, y: 0 }, omegaC: 0 }); continue; }
      const fine = d.phase === 'PRECISION_MATE';
      const vMax = fine ? 0.006 : 0.12, wMax = fine ? 0.01 : 0.15, k = 0.8;
      let vx = k * ex, vy = k * ey;
      const sp = Math.hypot(vx, vy);
      if (sp > vMax) { vx *= vMax / sp; vy *= vMax / sp; }
      const om = Math.max(-wMax, Math.min(wMax, k * eth));
      mover.mgr.setTransportCommand({ vc: { x: vx, y: vy }, omegaC: om });

      if (d.phase === 'DOCKING_ALIGN' && pos < 0.015 && Math.abs(eth) < (0.5 * Math.PI) / 180 && hErr < 0.003) {
        this.setDockPhase(d, base, mover, 'PRECISION_MATE');
      } else if (d.phase === 'PRECISION_MATE') {
        const ok = pos < d.spec.tolPos && Math.abs(eth) < d.spec.tolTheta && hErr < d.spec.tolHeight;
        if (!ok) d.stableSince = null;
        else if (d.stableSince === null) d.stableSince = this.t;
        else if (this.t - d.stableSince >= 0.3) {
          this.setDockPhase(d, base, mover, 'MATED');
          mover.mgr.setTransportCommand({ vc: { x: 0, y: 0 }, omegaC: 0 });
          this.emit({ kind: 'docked', teamId: d.spec.moverTeam, detail: `mated to ${d.spec.baseTeam}: |Δh|=${(hErr * 1000).toFixed(2)} mm, |Δp|=${(pos * 1000).toFixed(2)} mm, |Δθ|=${((Math.abs(eth) * 180) / Math.PI).toFixed(3)}°` });
        }
      }
    }
  }

  private setDockPhase(d: Dock, base: Team, mover: Team, phase: Dock['phase']): void {
    d.phase = phase; d.tel.phase = phase;
    base.special = phase; mover.special = phase;
    this.emit({ kind: 'phase', teamId: d.spec.moverTeam, detail: phase });
  }

  dockingTelemetry(): DockingTelemetry[] { return this.docks.map(d => ({ ...d.tel })); }

  // ───────────────────────── hot-swap (CHARGING_DOCK) ─────────────────────────

  private swapTick(team: Team, world: FleetWorldState): void {
    const mgr = team.mgr;
    if (team.phase === 'HOLD') return;

    if (!team.swap) {
      if (team.special && team.special !== 'CHARGING_DOCK') return; // never during docking
      if (team.phase !== 'CARRYING' && team.phase !== 'LIFTING') return;
      const low = mgr.agents.filter(a => a.battery < this.o.lowBattery).sort((p, q) => p.battery - q.battery)[0];
      if (!low) { team.blockedNotified = false; return; }
      const r = mgr.supportOf(low.id);
      if (!r) return;
      const blocked = (why: string) => {
        if (!team.blockedNotified) this.emit({ kind: 'hot-swap-blocked', teamId: team.a.teamId, agentId: low.id, detail: why });
        team.blockedNotified = true;
      };
      // support polygon without the leaving robot must keep ρ ≥ ρ_min
      const remaining = mgr.ids.filter(id => id !== low.id).map(id => mgr.supportOf(id)!).filter(Boolean);
      const rho = stabilityMargin(remaining, team.a.com ?? { x: 0, y: 0 });
      if (!(rho >= mgr.config.safety.rhoMin)) return blocked(`ρ without agent ${low.id} = ${Number.isFinite(rho) ? rho.toFixed(3) : '−∞'} m < ρ_min`);
      const spot = supportPointWorld(mgr.payloadReference, r);
      const reserve = [...this.agentsById.values()]
        .filter(a => this.duty.get(a.id) === 'RESERVE' && a.battery >= this.o.reserveMinBattery)
        .sort((p, q) => dist(p.pose, spot) - dist(q.pose, spot))[0];
      if (!reserve) return blocked('no charged reserve available');
      const charger = this.chargers.filter(c => c.occupiedBy === null).sort((p, q) => dist(p.pos, low.pose) - dist(q.pos, low.pose))[0];
      if (!charger) return blocked('no free charging station');

      charger.occupiedBy = low.id;
      const out = offsetToWorld(r, mgr.payloadReference.theta);
      const len = Math.hypot(out.x, out.y) || 1;
      const staging = { x: spot.x + (out.x / len) * this.o.stagingDistance, y: spot.y + (out.y / len) * this.o.stagingDistance };
      team.swap = { lowId: low.id, reserveId: reserve.id, r: { ...r }, headingOffset: team.headingOffsets[low.id] ?? 0, stage: 'settle', t0: this.t, staging, resume: team.phase };
      team.special = 'CHARGING_DOCK';
      mgr.setFrozen(true);
      this.duty.set(reserve.id, 'SWAP_IN');
      this.goals.set(reserve.id, { pos: staging, theta: mgr.payloadReference.theta + team.swap.headingOffset });
      this.emit({ kind: 'hot-swap-start', teamId: team.a.teamId, agentId: low.id, detail: `b=${(low.battery * 100).toFixed(0)}% → reserve ${reserve.id}, ${charger.id}, ρ_remaining=${rho.toFixed(3)} m` });
      return;
    }

    const s = team.swap;
    const low = this.agentsById.get(s.lowId)!, reserve = this.agentsById.get(s.reserveId)!;
    if (s.stage === 'settle') {
      const still = mgr.agents.every(a => a.wheelRates.every(w => Math.abs(w) < 0.05));
      if (this.t - s.t0 >= 0.3 && still) {
        mgr.removeAgent(s.lowId); // epoch++ — membership without the leaving robot
        this.duty.set(s.lowId, 'TO_CHARGER');
        low.setMode('LOWER'); // its pad drops below the load; the others keep it locked
        this.goals.delete(s.lowId);
        s.stage = 'release';
        this.emit({ kind: 'phase', teamId: team.a.teamId, agentId: s.lowId, detail: `agent ${s.lowId} released (epoch ${mgr.currentEpoch})` });
      }
      return;
    }
    if (s.stage === 'release') {
      const spot = supportPointWorld(mgr.payloadReference, s.r);
      const clear = low.lift.h <= low.liftParams.hMin + 0.001 && dist(low.pose, spot) > 0.45;
      const staged = dist(reserve.pose, s.staging) < 0.05;
      if (clear && staged) {
        this.goals.delete(s.reserveId);
        reserve.setMode('READY');
        mgr.addAgent(reserve, s.r, s.headingOffset); // epoch++ — reserve joins at the vacated r_i
        mgr.beginApproachFor(s.reserveId);
        s.stage = 'rejoin';
        this.emit({ kind: 'phase', teamId: team.a.teamId, agentId: s.reserveId, detail: `reserve ${s.reserveId} joined (epoch ${mgr.currentEpoch})` });
      }
      return;
    }
    // rejoin: wait until the reserve carries at h*
    const m = reserve.mode;
    const atHeight = Math.abs(reserve.lift.h - mgr.targetHeight) < 0.002;
    if (m === 'TRANSPORT' || (s.resume === 'LIFTING' && m === 'LIFT' && atHeight)) {
      mgr.setFrozen(false);
      this.duty.set(s.reserveId, 'ACTIVE');
      team.special = null;
      team.swap = null;
      this.emit({ kind: 'hot-swap-done', teamId: team.a.teamId, agentId: s.reserveId, detail: `formation restored, epoch ${mgr.currentEpoch}` });
    }
    void world;
  }

  // ───────────────────────── free robots (outside teams) ─────────────────────────

  private driveFree(a: TalosRobotAgent, dt: number): void {
    const duty = this.duty.get(a.id);
    // leaving robot: lower first (position lock released, controlled descent), then drive
    if (duty === 'TO_CHARGER') {
      if (a.mode === 'LOWER') {
        a.setTwistCommand({ vx: 0, vy: 0, omega: 0 });
        a.setLiftCommand(-0.08);
        if (a.lift.h <= a.liftParams.hMin + 0.001) a.setMode('READY');
        return;
      }
      const ch = this.chargers.find(c => c.occupiedBy === a.id);
      if (ch) {
        if (dist(a.pose, ch.pos) < 0.03) {
          this.duty.set(a.id, 'CHARGING');
          a.setTwistCommand({ vx: 0, vy: 0, omega: 0 });
          return;
        }
        this.driveTo(a, { pos: ch.pos });
      }
      return;
    }
    if (duty === 'CHARGING') {
      a.setTwistCommand({ vx: 0, vy: 0, omega: 0 });
      a.setBattery(a.battery + this.o.chargeRate * dt);
      if (a.battery >= 0.98) {
        const ch = this.chargers.find(c => c.occupiedBy === a.id);
        if (ch) ch.occupiedBy = null;
        this.duty.set(a.id, 'RESERVE');
        const park = this.o.reserveParking?.[a.id];
        if (park) this.goals.set(a.id, { pos: { ...park } });
        this.emit({ kind: 'charged', agentId: a.id, detail: `agent ${a.id} charged → reserve` });
      }
      return;
    }
    const g = this.goals.get(a.id);
    if (g) this.driveTo(a, g); else { a.setTwistCommand({ vx: 0, vy: 0, omega: 0 }); a.setLiftCommand(0); }
  }

  private driveTo(a: TalosRobotAgent, g: NavGoal): void {
    const ex = g.pos.x - a.pose.x, ey = g.pos.y - a.pose.y;
    let vx = 1.5 * ex, vy = 1.5 * ey;
    const sp = Math.hypot(vx, vy);
    if (sp > this.o.driveSpeed) { vx *= this.o.driveSpeed / sp; vy *= this.o.driveSpeed / sp; }
    const eth = g.theta === undefined ? 0 : wrapAngle(g.theta - a.pose.theta);
    const b = worldToBody(vx, vy, a.pose.theta);
    a.setWheelRates(inverseKinematics({ vx: b.x, vy: b.y, omega: Math.max(-1.2, Math.min(1.2, 2 * eth)) }, a.geometry));
    a.setLiftCommand(0);
  }

  // ───────────────────────── main step ─────────────────────────

  step(dt: number, world: FleetWorldState = { time: this.t, contacts: [] }): FleetStepOutput {
    this.events = [];
    this.t += dt;

    // fleet-level supervision at the agents' control rate
    this.ctrlAcc += dt;
    while (this.ctrlAcc >= DT_CTRL - 1e-12) {
      this.ctrlAcc -= DT_CTRL;
      for (const t of this.teams.values()) this.swapTick(t, world);
      this.dockTick(world);
    }

    const teamOut = new Map<string, ReturnType<SwarmManager['step']>>();
    for (const [id, t] of this.teams) {
      const ids = new Set(t.mgr.ids);
      const w: WorldState = {
        time: world.time,
        contacts: world.contacts.filter(c => ids.has(c.agentId)),
        payload: t.a.payloadId ? world.payloads?.[t.a.payloadId] : undefined,
        faults: world.faults,
      };
      const out = t.mgr.step(dt, w);
      teamOut.set(id, out);
      this.updatePhase(t);
    }

    const inTeam = new Set<number>();
    for (const t of this.teams.values()) for (const id of t.mgr.ids) inTeam.add(id);
    for (const a of this.agentsById.values()) {
      if (inTeam.has(a.id)) continue;
      const b = world.faults?.batteryOverride?.[a.id];
      if (b !== undefined) a.setBattery(b);
      this.driveFree(a, dt);
      a.step(dt, this.o.constrainPose);
    }

    return {
      time: this.t,
      teams: [...this.teams.entries()].map(([id, t]) => this.teamTelemetry(id, t, teamOut.get(id)!)),
      docking: this.dockingTelemetry(),
      duties: Object.fromEntries(this.duty),
      states: [...this.agentsById.values()].map(a => a.getState()),
      chargers: this.chargers.map(c => ({ ...c, pos: { ...c.pos } })),
      events: this.events,
    };
  }

  private updatePhase(t: Team): void {
    const modes = t.mgr.agents.map(a => a.mode);
    const all = (m: OperationMode) => modes.length > 0 && modes.every(x => x === m);
    let p: TeamPhase;
    if (modes.includes('HOLD')) p = 'HOLD';
    else if (t.special) p = t.special;
    else if (modes.includes('LOWER')) p = 'LOWERING';
    else if (all('TRANSPORT')) p = 'CARRYING';
    else if (modes.includes('LIFT') || modes.includes('TRANSPORT')) p = 'LIFTING';
    else if (all('READY') && t.lifted) p = 'DONE';
    else p = 'FORMING';
    if (p === 'CARRYING' || p === 'LIFTING') t.lifted = true;
    if (p !== t.phase) this.emit({ kind: 'phase', teamId: t.a.teamId, detail: `${t.phase} → ${p}` });
    t.phase = p;
  }

  private teamTelemetry(id: string, t: Team, out: ReturnType<SwarmManager['step']>): TeamTelemetry {
    const hs = t.mgr.agents.map(a => a.lift.h);
    return {
      teamId: id, role: t.a.role, phase: t.phase, epoch: t.mgr.currentEpoch, agentIds: t.mgr.ids,
      controller: t.mgr.config.controller, targetHeight: t.mgr.targetHeight,
      meanHeight: hs.reduce((s, v) => s + v, 0) / Math.max(1, hs.length),
      heightSpread: out.heightSpread, payloadRef: t.mgr.payloadReference, groupReady: out.groupReady,
      holdReasons: out.holdReasons, activeEdges: out.activeEdges,
    };
  }

  private emit(e: Omit<FleetEvent, 't'>): void { this.events.push({ t: this.t, ...e }); }
}

const DEFAULT_NET = { topology: 'ring' as const, lossP: 0, delay: 0.05, maxAge: 0.5 };

function dist(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
