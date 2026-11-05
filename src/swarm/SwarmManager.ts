/**
 * SwarmManager — group operation of N TalosRobotAgents (CLAUDE.md §4).
 *
 * Integration protocol (AGENTS.md §1.2): the platform calls `step(dt, world)` at its fixed physics
 * rate. Internally the manager runs the agents' 50 Hz control loop and the 20 Hz radio, applies the
 * commands to the agents and (unless `integrateAgents: false`) advances their kinematics. The
 * platform's physics computes contacts F_i from `getSupportContactInputs()` and returns them in
 * `world.contacts` on the next step.
 *
 * Contents:
 *  - M0 scalar consensus lives in ./consensus (runM0); the lift law below is its physical form.
 *  - M1 coupling: contact δ_i / F_i from src/physics drive the CONTACT phase, load-aware
 *    saturation, overload and contact-loss HOLD triggers.
 *  - Controllers A / B / C (formula 17), FSM with HOLD (§4.6), virtual platform (formula 16).
 */
import type {
  AgentCommand, AgentMessage, ControllerKind, NetworkParams, PayloadMotionCommand, Pose2D, SafetyLimits,
  SupportAssignment, SupportContactInput, SwarmConfig, SwarmStepOutput, Vec2, WheelRates, WorldState,
} from '../contracts/types';
import { CONTROL_HZ, RADIO_HZ } from '../contracts/types';
import type { TalosRobotAgent } from '../robot/TalosRobotAgent';
import { estimateLoadFromCurrent } from '../robot/liftDrive';
import { inverseKinematics } from '../robot/mecanum';
import { liftControl, type NeighborHeight } from './controllers';
import { AgentFsm, groupReady, isActive, readinessFailures, type ReadinessReport } from './fsm';
import { NeighborTable, RadioNetwork } from './network';
import { Rng } from './rng';
import { integratePayloadRef, supportPointWorld, supportTwist, wrapAngle, type TrackingGains } from './virtualPlatform';

export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  seed: 0,
  task: 'T0',
  controller: 'C',
  network: { topology: 'ring', lossP: 0, delay: 0.05, maxAge: 0.5 },
  gains: { kp: 1.5, kc: 1.0 },
  safety: { maxHeightSkew: 0.02, neighborTimeout: 0.5, minBattery: 0.1, rhoMin: 0.03, posTol: 0.02, headingTol: 0.05 },
  targetHeight: 0.1,
};

export interface SwarmManagerOptions {
  /** Advance agent kinematics inside step() (default true). Set false if the platform does it. */
  integrateAgents?: boolean;
  /** Collision resolver passed to agent.step. */
  constrainPose?: Parameters<TalosRobotAgent['step']>[1];
  /** APPROACH / TRANSPORT tracking gains and approach speed limits. */
  tracking?: Partial<TrackingGains & { approachSpeed: number; approachTurn: number; contactSpeed: number }>;
}

interface Member {
  agent: TalosRobotAgent;
  fsm: AgentFsm;
  table: NeighborTable;
  epoch: number;
  r: Vec2 | null;
  headingOffset: number;
  arrived: boolean;
  contactConfirmed: boolean;
  liftDone: boolean;
  cmd: AgentCommand;
}

const ZERO: WheelRates = [0, 0, 0, 0];

/** Neighbour height extrapolated to the receiver's clock: h_j + ḣ_j · age (compensates delay d and losses). */
function predictHeight(msg: AgentMessage, now: number): number {
  return msg.height + msg.heightVel * Math.max(0, now - msg.time);
}
const DT_CTRL = 1 / CONTROL_HZ;
const DT_RADIO = 1 / RADIO_HZ;

export class SwarmManager {
  readonly config: SwarmConfig;
  private members: Member[] = [];
  private network!: RadioNetwork;
  private rng: Rng;
  private epoch = 0;
  private t = 0;
  private ctrlAcc = DT_CTRL;  // first step ticks immediately
  private radioAcc = DT_RADIO;
  private readonly opts: Required<Pick<SwarmManagerOptions, 'integrateAgents'>> & SwarmManagerOptions;
  private readonly track: TrackingGains & { approachSpeed: number; approachTurn: number; contactSpeed: number };

  // operation state
  private payloadRef: Pose2D = { x: 0, y: 0, theta: 0 };
  private transportCmd: PayloadMotionCommand = { vc: { x: 0, y: 0 }, omegaC: 0 };
  private liftRequested = false;
  private transportRequested = false;
  private holdLog: { agentId: number; reason: string }[] = [];
  private lastWorld: WorldState = { time: 0, contacts: [] };

  // metrics: E_h (formula 20) and E_traj (formula 21) accumulators
  private ehSum = 0; private ehCount = 0;
  private etSum = 0; private etCount = 0;

  constructor(agents: TalosRobotAgent[], config: Partial<SwarmConfig> = {}, opts: SwarmManagerOptions = {}) {
    this.config = {
      ...DEFAULT_SWARM_CONFIG, ...config,
      network: { ...DEFAULT_SWARM_CONFIG.network, ...config.network },
      gains: { ...DEFAULT_SWARM_CONFIG.gains, ...config.gains },
      safety: { ...DEFAULT_SWARM_CONFIG.safety, ...config.safety },
    };
    this.opts = { integrateAgents: true, ...opts };
    this.track = { kPos: 1.5, kTheta: 2.0, approachSpeed: 0.35, approachTurn: 1.2, contactSpeed: 0.03, ...opts.tracking };
    this.rng = new Rng(this.config.seed);
    this.setAgents(agents);
  }

  // ───────────────────────── membership ─────────────────────────

  /** Replace the group. Ids must be exactly 1..N. Increments the epoch (formula 1 membership). */
  setAgents(agents: TalosRobotAgent[]): void {
    const sorted = [...agents].sort((a, b) => a.id - b.id);
    sorted.forEach((a, i) => { if (a.id !== i + 1) throw new Error(`SwarmManager: agent ids must be 1..N, got ${a.id} at position ${i + 1}`); });
    this.epoch++;
    this.network = new RadioNetwork(sorted.length, this.config.network, this.rng.fork());
    this.members = sorted.map(agent => {
      const lp = agent.liftParams;
      return {
        agent,
        fsm: new AgentFsm(),
        table: new NeighborTable(agent.id, { hMin: lp.hMin, hMax: lp.hMax, maxAge: this.config.network.maxAge }),
        epoch: this.epoch,
        r: null, headingOffset: 0, arrived: false, contactConfirmed: false, liftDone: false,
        cmd: { agentId: agent.id, mode: 'READY', wheelRates: [...ZERO], liftVelocity: 0, liftLock: false },
      };
    });
    for (const m of this.members) { m.fsm.mode = m.agent.mode; }
  }

  get agents(): TalosRobotAgent[] { return this.members.map(m => m.agent); }
  get currentEpoch(): number { return this.epoch; }
  get time(): number { return this.t; }
  get edges(): [number, number][] { return this.network.edges.map(([a, b]) => [a + 1, b + 1]); }
  modeOf(id: number) { return this.member(id).fsm.mode; }
  fsmHistory(id: number) { return this.member(id).fsm.history; }
  rejectedPackets(id: number) { return { ...this.member(id).table.rejected }; }

  private member(id: number): Member {
    const m = this.members[id - 1];
    if (!m) throw new Error(`SwarmManager: no agent ${id}`);
    return m;
  }

  // ───────────────────────── configuration ─────────────────────────

  setController(kind: ControllerKind): void { this.config.controller = kind; }
  setTargetHeight(h: number): void { this.config.targetHeight = h; for (const m of this.members) m.liftDone = false; }
  setNetwork(p: Partial<NetworkParams>): void {
    Object.assign(this.config.network, p);
    this.network.params = this.config.network;
  }
  setSafety(s: Partial<SafetyLimits>): void { Object.assign(this.config.safety, s); }

  // ───────────────────────── operation API (missions / UI) ─────────────────────────

  /** Support point assignment r_i (payload frame) and the payload reference pose. */
  assignSupports(assignments: SupportAssignment[], payloadPose: Pose2D, headingOffsets: Record<number, number> = {}): void {
    this.payloadRef = { ...payloadPose };
    for (const a of assignments) {
      const m = this.member(a.agentId);
      m.r = { ...a.r };
      m.headingOffset = headingOffsets[a.agentId] ?? 0;
      m.arrived = false;
    }
  }

  /** READY → APPROACH for every agent with an assignment. */
  beginApproach(): void {
    for (const m of this.members) if (m.r && m.fsm.go('APPROACH', this.t, 'mission start')) m.agent.setMode('APPROACH');
  }

  /** Allow CONTACT → LIFT once A_ready holds. */
  requestLift(): void { this.liftRequested = true; }

  /** LIFT → TRANSPORT once every agent reached h*. */
  startTransport(cmd?: PayloadMotionCommand): void {
    this.transportRequested = true;
    if (cmd) this.setTransportCommand(cmd);
  }

  setTransportCommand(cmd: PayloadMotionCommand): void {
    this.transportCmd = { vc: { ...cmd.vc }, omegaC: cmd.omegaC };
  }

  /** Controlled synchronous descent (also the HOLD recovery path). */
  requestLower(): void {
    this.liftRequested = false;
    this.transportRequested = false;
    this.transportCmd = { vc: { x: 0, y: 0 }, omegaC: 0 };
    for (const m of this.members) if (m.fsm.go('LOWER', this.t, 'lower requested')) m.agent.setMode('LOWER');
  }

  /** Operator / mission emergency stop. */
  emergencyHold(reason = 'emergency stop'): void {
    for (const m of this.members) this.trip(m, reason);
  }

  /** Back to READY after a mission (only from READY-compatible states). */
  resetOperation(): void {
    this.liftRequested = false;
    this.transportRequested = false;
    this.transportCmd = { vc: { x: 0, y: 0 }, omegaC: 0 };
    for (const m of this.members) {
      m.fsm.reset(); m.agent.setMode('READY');
      m.arrived = false; m.contactConfirmed = false; m.liftDone = false;
    }
    this.ehSum = this.ehCount = this.etSum = this.etCount = 0;
  }

  get payloadReference(): Pose2D { return { ...this.payloadRef }; }

  getSupportContactInputs(): SupportContactInput[] {
    return this.members.map(m => m.agent.getSupportContactInput());
  }

  /** E_h (formula 20) over LIFT/TRANSPORT control ticks, E_traj (formula 21) over TRANSPORT ticks. */
  getMetrics(): { E_h: number | null; E_traj: number | null } {
    return {
      E_h: this.ehCount ? Math.sqrt(this.ehSum / this.ehCount) : null,
      E_traj: this.etCount ? Math.sqrt(this.etSum / this.etCount) : null,
    };
  }

  // ───────────────────────── main step ─────────────────────────

  step(dt: number, world: WorldState = { time: this.t, contacts: [] }): SwarmStepOutput {
    this.lastWorld = world;
    this.holdLog = [];
    this.applyWorld(world);
    this.t += dt;

    // radio (20 Hz) → delivery (respecting delay) → control (50 Hz)
    this.radioAcc += dt;
    while (this.radioAcc >= DT_RADIO - 1e-12) { this.radioAcc -= DT_RADIO; this.radioTick(world); }
    for (const f of this.network.deliver(this.t)) {
      const rx = this.member(f.to);
      rx.table.receive(f.msg, rx.agent.localTime, { epoch: rx.epoch, task: this.config.task });
    }
    this.ctrlAcc += dt;
    while (this.ctrlAcc >= DT_CTRL - 1e-12) { this.ctrlAcc -= DT_CTRL; this.controlTick(world); }

    if (this.opts.integrateAgents) for (const m of this.members) m.agent.step(dt, this.opts.constrainPose);

    const hs = this.members.map(m => m.agent.lift.h);
    return {
      time: this.t,
      commands: this.members.map(m => ({ ...m.cmd, wheelRates: [...m.cmd.wheelRates] as WheelRates })),
      states: this.members.map(m => m.agent.getState()),
      heightSpread: hs.length ? Math.max(...hs) - Math.min(...hs) : 0,
      groupReady: this.isGroupReady(world),
      holdReasons: this.holdLog,
      activeEdges: this.network.lastActiveEdges.map(e => [...e] as [number, number]),
    };
  }

  private applyWorld(world: WorldState): void {
    const byId = new Map(world.contacts.map(c => [c.agentId, c]));
    const f = world.faults;
    for (const m of this.members) {
      const c = byId.get(m.agent.id);
      if (c || world.payload) m.agent.applySupportContact(c ?? null);
      m.agent.liftFault = !!f?.liftFault?.includes(m.agent.id);
      const b = f?.batteryOverride?.[m.agent.id];
      if (b !== undefined) m.agent.setBattery(b);
    }
  }

  private radioTick(world: WorldState): void {
    const dead = new Set(world.faults?.radioDead ?? []);
    const outbox = new Map<number, ReturnType<TalosRobotAgent['buildMessage']>>();
    for (const m of this.members) if (!dead.has(m.agent.id)) outbox.set(m.agent.id, m.agent.buildMessage(this.config.task, m.epoch));
    this.network.broadcast(this.t, outbox, world.faults?.lossP ?? this.config.network.lossP);
  }

  // ───────────────────────── control (50 Hz) ─────────────────────────

  private controlTick(world: WorldState): void {
    const kind = this.config.controller;

    // 1. local safety triggers
    for (const m of this.members) {
      const reason = this.safetyTrigger(m, world);
      if (reason) this.trip(m, reason);
    }
    // 2. HOLD propagation: B — the coordinator sees everything; C — via neighbours' packets; A — none.
    if (kind === 'B' && this.members.some(m => m.fsm.mode === 'HOLD')) {
      for (const m of this.members) this.trip(m, 'coordinator: group HOLD');
    } else if (kind === 'C') {
      for (const m of this.members) {
        const nb = m.table.fresh(m.agent.localTime, this.config.safety.neighborTimeout).find(e => e.msg.mode === 'HOLD');
        if (nb) this.trip(m, `neighbour ${nb.msg.id} in HOLD`);
      }
    }

    // 3. phase logic
    const ready = this.isGroupReady(world);
    const allAtHeight = this.members.every(m => m.liftDone);
    for (const m of this.members) this.phase(m, world, ready, allAtHeight);

    // 4. group-uniform wheel saturation during TRANSPORT (keeps the rigid-body shape)
    this.saturateTransport();

    // 5. integrate reference trajectory + metrics
    const transporting = this.members.some(m => m.fsm.mode === 'TRANSPORT');
    if (transporting) {
      integratePayloadRef(this.payloadRef, this.transportCmd, DT_CTRL);
      if (world.payload) {
        const e = { x: world.payload.pose.x - this.payloadRef.x, y: world.payload.pose.y - this.payloadRef.y };
        this.etSum += e.x * e.x + e.y * e.y; this.etCount++;
      }
    }
    const lifting = this.members.filter(m => m.fsm.mode === 'LIFT' || m.fsm.mode === 'TRANSPORT');
    if (lifting.length === this.members.length && lifting.length > 0) {
      const hs = lifting.map(m => m.agent.lift.h);
      const hBar = hs.reduce((s, v) => s + v, 0) / hs.length;
      for (const h of hs) this.ehSum += (h - hBar) ** 2;
      this.ehCount += hs.length;
    }

    // 6. push commands to the agents
    for (const m of this.members) {
      m.cmd.mode = m.fsm.mode;
      m.agent.setMode(m.fsm.mode);
      m.agent.setWheelRates(m.cmd.wheelRates);
      m.agent.setLiftCommand(m.cmd.liftVelocity, m.cmd.liftLock);
    }
  }

  private trip(m: Member, reason: string): void {
    if (m.fsm.trip(this.t, reason)) {
      m.agent.setMode('HOLD');
      m.cmd.wheelRates = [...ZERO];
      m.cmd.liftVelocity = 0;
      m.cmd.liftLock = true;
      this.holdLog.push({ agentId: m.agent.id, reason });
    }
  }

  private safetyTrigger(m: Member, world: WorldState): string | null {
    const mode = m.fsm.mode;
    if (!isActive(mode)) return null;
    const a = m.agent, s = this.config.safety, kind = this.config.controller;
    const loaded = mode === 'LIFT' || mode === 'TRANSPORT' || mode === 'LOWER';
    if (a.liftFault) return 'lift drive fault';
    if (a.battery < s.minBattery) return `battery low (${(a.battery * 100).toFixed(0)}%)`;
    if (a.contact && a.contact.force > a.fAllow) return `support overload F=${a.contact.force.toFixed(0)} N > F_allow`;
    if ((mode === 'LIFT' || mode === 'TRANSPORT') && m.contactConfirmed && world.payload && a.contact && a.contact.delta <= 0) return 'support contact lost (δ ≤ 0)';
    if ((mode === 'LIFT' || mode === 'TRANSPORT') && world.payload?.rho !== undefined && world.payload.rho < 0) return 'r_c outside support polygon (ρ < 0)';
    if (loaded && kind === 'B') {
      const hs = this.members.map(x => x.agent.lift.h);
      if (Math.max(...hs) - Math.min(...hs) > s.maxHeightSkew) return 'height skew over limit (global)';
    }
    if (loaded && kind === 'C') {
      const now = a.localTime;
      for (const j of this.network.neighborsOf(a.id)) {
        const e = m.table.entries.get(j);
        if (!e || now - e.msg.time > s.neighborTimeout) return `neighbour ${j} silent > ${s.neighborTimeout}s`;
        if (Math.abs(predictHeight(e.msg, now) - a.lift.h) > s.maxHeightSkew) return `height skew to neighbour ${j} over limit`;
      }
    }
    return null;
  }

  private neighborHeights(m: Member): NeighborHeight[] {
    const kind = this.config.controller;
    if (kind === 'A') return [];
    if (kind === 'B') {
      return this.members.filter(x => x !== m).map(x => ({ h: x.agent.lift.h, force: x.agent.measuredForce() }));
    }
    const now = m.agent.localTime;
    return m.table.fresh(now, this.config.safety.neighborTimeout).map(e => ({ h: predictHeight(e.msg, now), force: e.msg.force }));
  }

  private ownLoad(m: Member): number {
    return m.agent.measuredForce() ?? estimateLoadFromCurrent(m.agent.liftParams, m.agent.lift.current);
  }

  private liftLaw(m: Member, target: number): number {
    return liftControl({
      kind: this.config.controller,
      target,
      h: m.agent.lift.h,
      ownLoad: this.ownLoad(m),
      neighbors: this.neighborHeights(m),
      gains: this.config.gains,
      drive: m.agent.liftParams,
    }).u;
  }

  private phase(m: Member, world: WorldState, ready: boolean, allAtHeight: boolean): void {
    const a = m.agent, s = this.config.safety, cmd = m.cmd;
    cmd.wheelRates = [...ZERO];
    cmd.liftVelocity = 0;
    cmd.liftLock = false;

    switch (m.fsm.mode) {
      case 'READY':
        break;

      case 'APPROACH': {
        if (!m.r) break;
        const goal = supportPointWorld(this.payloadRef, m.r);
        const ex = goal.x - a.pose.x, ey = goal.y - a.pose.y;
        const eTheta = wrapAngle(this.payloadRef.theta + m.headingOffset - a.pose.theta);
        const dist = Math.hypot(ex, ey);
        if (dist < s.posTol && Math.abs(eTheta) < s.headingTol) {
          m.arrived = true;
          if (m.fsm.go('CONTACT', this.t, 'at support point')) a.setMode('CONTACT');
          break;
        }
        let vx = this.track.kPos * ex, vy = this.track.kPos * ey;
        const sp = Math.hypot(vx, vy);
        if (sp > this.track.approachSpeed) { vx *= this.track.approachSpeed / sp; vy *= this.track.approachSpeed / sp; }
        const om = Math.max(-this.track.approachTurn, Math.min(this.track.approachTurn, this.track.kTheta * eTheta));
        const c = Math.cos(a.pose.theta), sn = Math.sin(a.pose.theta);
        cmd.wheelRates = inverseKinematics({ vx: c * vx + sn * vy, vy: -sn * vx + c * vy, omega: om }, a.geometry);
        break;
      }

      case 'CONTACT': {
        if (!world.payload) {
          m.contactConfirmed = true; // no physical payload in the scene: nothing to touch
        } else if (a.contact && a.contact.delta > 0) {
          m.contactConfirmed = true;
        } else if (a.lift.h >= a.liftParams.hMax - 1e-4) {
          this.trip(m, 'no contact within the lift stroke');
          return;
        } else {
          m.contactConfirmed = false;
          cmd.liftVelocity = this.track.contactSpeed; // raise slowly until δ > 0
        }
        if (ready && this.liftRequested && m.fsm.go('LIFT', this.t, 'A_ready')) a.setMode('LIFT');
        break;
      }

      case 'LIFT': {
        const h0 = this.config.targetHeight;
        cmd.liftVelocity = this.liftLaw(m, h0);
        m.liftDone = Math.abs(a.lift.h - h0) < 0.002 && Math.abs(a.lift.hDot) < 0.002;
        if (allAtHeight && this.transportRequested && m.fsm.go('TRANSPORT', this.t, 'at h*')) a.setMode('TRANSPORT');
        break;
      }

      case 'TRANSPORT': {
        cmd.liftVelocity = this.liftLaw(m, this.config.targetHeight);
        if (m.r) {
          const tw = supportTwist(this.transportCmd, this.payloadRef, m.r, a.pose, m.headingOffset, this.track);
          cmd.wheelRates = inverseKinematics(tw, a.geometry);
        }
        break;
      }

      case 'LOWER': {
        const hMin = a.liftParams.hMin;
        cmd.liftVelocity = this.liftLaw(m, hMin);
        if (a.lift.h <= hMin + 0.001) {
          m.contactConfirmed = false; m.liftDone = false; m.arrived = false;
          if (m.fsm.go('READY', this.t, 'lowered')) a.setMode('READY');
        }
        break;
      }

      case 'HOLD':
        cmd.liftLock = true;
        break;
    }
  }

  /** One α for the whole group: min over agents of ω_max / max|ω|, applied to every TRANSPORT agent. */
  private saturateTransport(): void {
    let alpha = 1;
    const tr = this.members.filter(m => m.fsm.mode === 'TRANSPORT');
    for (const m of tr) {
      const peak = Math.max(...m.cmd.wheelRates.map(Math.abs));
      if (peak > m.agent.geometry.omegaMax) alpha = Math.min(alpha, m.agent.geometry.omegaMax / peak);
    }
    if (alpha < 1) for (const m of tr) m.cmd.wheelRates = m.cmd.wheelRates.map(w => w * alpha) as WheelRates;
  }

  /** Formula 18 readiness over all members (+ ρ ≥ ρ_min when the physics reports ρ). */
  private isGroupReady(world: WorldState): boolean {
    return groupReady(this.readinessReports(), world.payload?.rho, this.config.safety.rhoMin);
  }

  readinessReports(): ReadinessReport[] {
    return this.members.map(m => ({
      agentId: m.agent.id,
      epochOk: m.epoch === this.epoch,
      taskOk: true,
      // an absent force sensor is fine (contact comes from δ); a present but uncalibrated one blocks LIFT
      calibrated: m.agent.forceSensor !== 'uncalibrated',
      batteryOk: m.agent.battery >= this.config.safety.minBattery,
      atSupportPoint: m.arrived && (m.fsm.mode === 'CONTACT' || m.fsm.mode === 'LIFT' || m.fsm.mode === 'TRANSPORT'),
      contactOk: m.contactConfirmed,
    }));
  }

  /** Human-readable readiness blockers per agent (for HUD). */
  readinessBlockers(): Record<number, string[]> {
    const out: Record<number, string[]> = {};
    for (const r of this.readinessReports()) out[r.agentId] = readinessFailures(r);
    return out;
  }
}
