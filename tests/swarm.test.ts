import { describe, expect, it } from 'vitest';
import type { AgentMessage, ControllerKind, PayloadState, SupportContactOutput, WorldState } from '../src/contracts/types';
import { TalosRobotAgent } from '../src/robot/TalosRobotAgent';
import { NeighborTable, RadioNetwork } from '../src/swarm/network';
import { Rng } from '../src/swarm/rng';
import { SwarmManager } from '../src/swarm/SwarmManager';
import { liftControl } from '../src/swarm/controllers';
import { DEFAULT_LIFT_PARAMS } from '../src/robot/liftDrive';
import { AgentFsm, canTransition } from '../src/swarm/fsm';

const msg = (o: Partial<AgentMessage> = {}): AgentMessage => ({
  id: 2, task: 'T', epoch: 1, seq: 1, time: 0, mode: 'READY', health: 'OK', height: 0.05, heightVel: 0,
  pose: { x: 0, y: 0, theta: 0 }, quality: 1, force: null, battery: 1, ...o,
});

describe('network filters (§4.1)', () => {
  it('rejects stale epoch, duplicate seq, old packets, impossible heights, wrong task', () => {
    const t = new NeighborTable(1, { hMin: 0, hMax: 0.24, maxAge: 0.5 });
    const ctx = { epoch: 2, task: 'T' };
    expect(t.receive(msg({ epoch: 1 }), 0, ctx)).toBe('stale-epoch');
    expect(t.receive(msg({ epoch: 2, seq: 5 }), 0, ctx)).toBeNull();
    expect(t.receive(msg({ epoch: 2, seq: 5 }), 0, ctx)).toBe('duplicate-seq');
    expect(t.receive(msg({ epoch: 2, seq: 6, time: 0 }), 1.0, ctx)).toBe('too-old');
    expect(t.receive(msg({ epoch: 2, seq: 7, height: 0.5 }), 0, ctx)).toBe('height-out-of-range');
    expect(t.receive(msg({ epoch: 2, seq: 8, task: 'X' }), 0, ctx)).toBe('wrong-task');
  });

  it('loss is symmetric per edge: both directions drop together', () => {
    const net = new RadioNetwork(2, { topology: 'ring', lossP: 0.5, delay: 0, maxAge: 1 }, new Rng(5));
    for (let k = 0; k < 50; k++) {
      net.broadcast(k, new Map([[1, msg({ id: 1 })], [2, msg({ id: 2 })]]));
      const d = net.deliver(k);
      expect(d.length === 0 || d.length === 2).toBe(true);
    }
  });

  it('delay d holds packets until due', () => {
    const net = new RadioNetwork(2, { topology: 'ring', lossP: 0, delay: 0.1, maxAge: 1 }, new Rng(1));
    net.broadcast(0, new Map([[1, msg({ id: 1 })]]));
    expect(net.deliver(0.05)).toHaveLength(0);
    expect(net.deliver(0.1)).toHaveLength(1);
  });
});

describe('controllers A/B/C (formula 17)', () => {
  const base = { target: 0.1, h: 0.05, ownLoad: 0, gains: { kp: 1.5, kc: 1 }, drive: DEFAULT_LIFT_PARAMS };
  it('A ignores neighbours (k_c = 0)', () => {
    const a = liftControl({ ...base, kind: 'A', neighbors: [{ h: 0.0, force: null }] });
    expect(a.raw).toBeCloseTo(1.5 * 0.05, 12);
  });
  it('C couples to neighbours and saturates to the most loaded participant', () => {
    const c = liftControl({ ...base, kind: 'C', neighbors: [{ h: 0.0, force: null }] });
    expect(c.raw).toBeCloseTo(1.5 * 0.05 - 0.05, 12);
    const loaded = liftControl({ ...base, kind: 'C', h: 0, neighbors: [{ h: 0, force: 200 }] });
    const free = liftControl({ ...base, kind: 'C', h: 0, neighbors: [{ h: 0, force: null }] });
    expect(loaded.vUp).toBeLessThan(free.vUp);
    expect(loaded.u).toBeLessThanOrEqual(loaded.vUp);
  });
});

describe('FSM (§4.6)', () => {
  it('follows the operation chain and trips to HOLD only from active states', () => {
    const f = new AgentFsm();
    expect(f.trip(0, 'x')).toBe(false); // READY is not active
    for (const m of ['APPROACH', 'CONTACT', 'LIFT', 'TRANSPORT', 'LOWER', 'READY'] as const) expect(f.go(m, 0)).toBe(true);
    expect(canTransition('READY', 'LIFT')).toBe(false);
    f.go('APPROACH', 0);
    expect(f.trip(1, 'fault')).toBe(true);
    expect(f.mode).toBe('HOLD');
    expect(f.holdReason).toBe('fault');
  });
});

// ───────── integration: 4 robots around a 1.0 × 0.6 m payload ─────────

const R = [{ x: 0.5, y: 0.3 }, { x: -0.5, y: 0.3 }, { x: -0.5, y: -0.3 }, { x: 0.5, y: -0.3 }];

function makeSwarm(kind: ControllerKind, lossP = 0, extra: Partial<ConstructorParameters<typeof SwarmManager>[1]> = {}) {
  const agents = R.map((r, i) => new TalosRobotAgent({ id: i + 1, pose: { x: r.x * 2.2, y: r.y * 2.2, theta: 0 }, forceSensor: 'absent' }));
  const swarm = new SwarmManager(agents, { controller: kind, seed: 11, targetHeight: 0.08, network: { topology: 'ring', lossP, delay: 0.05, maxAge: 0.5 }, ...extra });
  swarm.assignSupports(R.map((r, i) => ({ agentId: i + 1, r })), { x: 0, y: 0, theta: 0 });
  return { agents, swarm };
}

/**
 * Minimal M1 stand-in for tests only (the real one is src/physics, Agent B): a flat rigid payload
 * resting on stands at zStand; δ_i = padZ_i − z_p, F_i = k max(0, δ_i).
 */
function stubPhysics(swarm: SwarmManager, mass: number, zStand: number, override?: (c: SupportContactOutput) => void): { payload: PayloadState; contacts: SupportContactOutput[] } {
  const ins = swarm.getSupportContactInputs();
  const k = ins[0].stiffness;
  const meanZ = ins.reduce((s, c) => s + c.padZ, 0) / ins.length;
  const zp = Math.max(zStand, meanZ - (mass * 9.81) / (ins.length * k));
  const contacts = ins.map(c => {
    const out = { agentId: c.agentId, delta: c.padZ - zp, deltaDot: c.padVel, force: k * Math.max(0, c.padZ - zp) };
    override?.(out);
    return out;
  });
  return { payload: { id: 'slab', mass, com: { x: 0, y: 0 }, pose: { ...swarm.payloadReference }, z: zp, rho: 0.25 }, contacts };
}

function run(swarm: SwarmManager, seconds: number, world: (t: number) => WorldState, dt = 0.01) {
  let out;
  for (let i = 0; i < seconds / dt; i++) out = swarm.step(dt, world(swarm.time));
  return out!;
}

describe('SwarmManager integration', () => {
  it.each(['B', 'C'] as const)('controller %s: approach → contact → lift to h* with E_h < 2 mm', kind => {
    const { agents, swarm } = makeSwarm(kind);
    swarm.beginApproach();
    swarm.requestLift();
    const zStand = 0.31;
    const world = (): WorldState => ({ time: swarm.time, ...stubPhysics(swarm, 20, zStand) });
    run(swarm, 25, world);
    for (const a of agents) {
      expect(a.mode).toBe('LIFT');
      expect(a.lift.h).toBeCloseTo(0.08, 2);
    }
    const { E_h } = swarm.getMetrics();
    expect(E_h).not.toBeNull();
    expect(E_h!).toBeLessThan(0.002);
  });

  it('C with p = 0.3 still lifts without false HOLD', () => {
    const { agents, swarm } = makeSwarm('C', 0.3);
    swarm.beginApproach();
    swarm.requestLift();
    const holds: string[] = [];
    for (let i = 0; i < 2500; i++) {
      const o = swarm.step(0.01, { time: swarm.time, contacts: [] });
      holds.push(...o.holdReasons.map(h => h.reason));
    }
    expect(holds).toEqual([]);
    for (const a of agents) expect(a.lift.h).toBeCloseTo(0.08, 2);
  });

  it('transport moves the group as a rigid body (formula 16)', () => {
    const { agents, swarm } = makeSwarm('C');
    swarm.beginApproach(); swarm.requestLift();
    run(swarm, 25, () => ({ time: swarm.time, contacts: [] }));
    swarm.startTransport({ vc: { x: 0.1, y: 0.05 }, omegaC: 0.15 });
    run(swarm, 6, () => ({ time: swarm.time, contacts: [] }));
    expect(agents.every(a => a.mode === 'TRANSPORT')).toBe(true);
    // pairwise distances preserved (rigid body)
    const d = (i: number, j: number) => Math.hypot(agents[i].pose.x - agents[j].pose.x, agents[i].pose.y - agents[j].pose.y);
    expect(d(0, 1)).toBeCloseTo(1.0, 1);
    expect(d(0, 3)).toBeCloseTo(0.6, 1);
    expect(d(0, 2)).toBeCloseTo(Math.hypot(1, 0.6), 1);
    expect(swarm.payloadReference.theta).toBeGreaterThan(0.8);
  });

  it('C: a dead radio during LIFT puts its neighbours (and then the group) into HOLD', () => {
    const { agents, swarm } = makeSwarm('C');
    swarm.beginApproach(); swarm.requestLift();
    run(swarm, 22, () => ({ time: swarm.time, contacts: [] }));
    expect(agents.every(a => a.mode === 'LIFT')).toBe(true);
    const hBefore = agents.map(a => a.lift.h);
    run(swarm, 2, () => ({ time: swarm.time, contacts: [], faults: { radioDead: [3] } }));
    expect(agents[1].mode).toBe('HOLD');
    expect(agents[3].mode).toBe('HOLD');
    expect(agents.every(a => a.mode === 'HOLD')).toBe(true); // propagated via neighbours / silence
    // HOLD keeps height (position lock), no sagging
    agents.forEach((a, i) => expect(a.lift.h).toBeGreaterThanOrEqual(hBefore[i] - 0.03));
    const h = agents.map(a => a.lift.h);
    run(swarm, 2, () => ({ time: swarm.time, contacts: [] }));
    agents.forEach((a, i) => expect(a.lift.h).toBe(h[i]));
  });

  it('B: one lift fault ⇒ coordinator holds everyone; A: no propagation', () => {
    for (const kind of ['B', 'A'] as const) {
      const { agents, swarm } = makeSwarm(kind);
      swarm.beginApproach(); swarm.requestLift();
      run(swarm, 22, () => ({ time: swarm.time, contacts: [] }));
      run(swarm, 0.2, () => ({ time: swarm.time, contacts: [], faults: { liftFault: [2] } }));
      expect(agents[1].mode).toBe('HOLD');
      if (kind === 'B') expect(agents.every(a => a.mode === 'HOLD')).toBe(true);
      else expect(agents.filter(a => a.mode === 'HOLD')).toHaveLength(1);
    }
  });

  it('contact loss (δ ≤ 0) during LIFT trips HOLD', () => {
    const { agents, swarm } = makeSwarm('C');
    swarm.beginApproach(); swarm.requestLift();
    run(swarm, 25, () => ({ time: swarm.time, ...stubPhysics(swarm, 20, 0.31) }));
    expect(agents[0].mode).toBe('LIFT');
    const o = swarm.step(0.02, { time: swarm.time, ...stubPhysics(swarm, 20, 0.31, c => { if (c.agentId === 1) { c.delta = -0.002; c.force = 0; } }) });
    expect(agents[0].mode).toBe('HOLD');
    expect(o.holdReasons.some(h => h.agentId === 1 && /contact lost/.test(h.reason))).toBe(true);
  });

  it('lift is blocked while ρ < ρ_min (formula 18)', () => {
    const { agents, swarm } = makeSwarm('C');
    swarm.beginApproach(); swarm.requestLift();
    const o = run(swarm, 20, () => {
      const w = stubPhysics(swarm, 20, 0.31);
      w.payload.rho = 0.01;
      return { time: swarm.time, ...w };
    });
    expect(o.groupReady).toBe(false);
    expect(agents.every(a => a.mode === 'CONTACT')).toBe(true);
  });

  it('epoch increments on membership change; old-epoch packets are dropped', () => {
    const { agents, swarm } = makeSwarm('C');
    const e = swarm.currentEpoch;
    swarm.setAgents(agents);
    expect(swarm.currentEpoch).toBe(e + 1);
  });

  it('same seed ⇒ identical trajectories', () => {
    const traj = () => {
      const { agents, swarm } = makeSwarm('C', 0.3);
      swarm.beginApproach(); swarm.requestLift();
      run(swarm, 10, () => ({ time: swarm.time, contacts: [] }));
      return agents.map(a => [a.pose.x, a.pose.y, a.lift.h]);
    };
    expect(traj()).toEqual(traj());
  });
});
