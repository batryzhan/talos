import { describe, expect, it } from 'vitest';
import type { WheelRates } from '../src/contracts/types';
import { forwardKinematics, inverseKinematics, saturateUniform, slewUniform, worldToBody } from '../src/robot/mecanum';
import { DEFAULT_LIFT_PARAMS, createLiftState, maxUpSpeed, stepLift, tractionForce, estimateLoadFromCurrent } from '../src/robot/liftDrive';
import { STRAFER_GEOMETRY, TalosRobotAgent } from '../src/robot/TalosRobotAgent';
import { supportVelocityWorld } from '../src/swarm/virtualPlatform';

const g = STRAFER_GEOMETRY;

describe('Mecanum formula 14', () => {
  it('matches the matrix row by row', () => {
    const L = g.a + g.b, t = { vx: 0.3, vy: -0.2, omega: 0.7 };
    const w = inverseKinematics(t, g);
    expect(w[0]).toBeCloseTo((t.vx - t.vy - L * t.omega) / g.r, 12);
    expect(w[1]).toBeCloseTo((t.vx + t.vy + L * t.omega) / g.r, 12);
    expect(w[2]).toBeCloseTo((t.vx + t.vy - L * t.omega) / g.r, 12);
    expect(w[3]).toBeCloseTo((t.vx - t.vy + L * t.omega) / g.r, 12);
  });

  it('FK is the exact left inverse of IK', () => {
    const t = { vx: -0.4, vy: 0.25, omega: -1.1 };
    const back = forwardKinematics(inverseKinematics(t, g), g);
    expect(back.vx).toBeCloseTo(t.vx, 12);
    expect(back.vy).toBeCloseTo(t.vy, 12);
    expect(back.omega).toBeCloseTo(t.omega, 12);
  });

  it('pure strafe left drives FL/RR backward and FR/RL forward', () => {
    const w = inverseKinematics({ vx: 0, vy: 0.5, omega: 0 }, g);
    expect(w[0]).toBeLessThan(0); expect(w[3]).toBeLessThan(0);
    expect(w[1]).toBeGreaterThan(0); expect(w[2]).toBeGreaterThan(0);
  });

  it('uniform saturation preserves direction of motion (no per-wheel clamp)', () => {
    const t = { vx: 2.0, vy: 1.5, omega: 2.0 };
    const raw = inverseKinematics(t, g);
    const { rates, alpha } = saturateUniform(raw, g.omegaMax);
    expect(alpha).toBeLessThan(1);
    expect(Math.max(...rates.map(Math.abs))).toBeCloseTo(g.omegaMax, 10);
    const out = forwardKinematics(rates, g);
    expect(out.vx / t.vx).toBeCloseTo(alpha, 10);
    expect(out.vy / t.vy).toBeCloseTo(alpha, 10);
    expect(out.omega / t.omega).toBeCloseTo(alpha, 10);
  });

  it('slewUniform keeps the transient on the same direction', () => {
    const target: WheelRates = [30, -10, 20, 5];
    const s = slewUniform([0, 0, 0, 0], target, 3);
    const f = s[0] / target[0];
    s.forEach((v, i) => expect(v).toBeCloseTo(target[i] * f, 12));
    expect(Math.max(...s.map(Math.abs))).toBeCloseTo(3, 12);
  });

  it('slewUniform is NaN-safe for dt ≤ 0 (first rAF frame can be negative)', () => {
    expect(slewUniform([0, 0, 0, 0], [0, 0, 0, 0], -0.01)).toEqual([0, 0, 0, 0]);
    expect(slewUniform([1, 2, 3, 4], [5, 5, 5, 5], 0)).toEqual([1, 2, 3, 4]);
    const a = new TalosRobotAgent({ id: 1 });
    a.setTwistCommand({ vx: 1, vy: 0, omega: 0 });
    a.step(-0.004); a.step(0); a.step(0.01);
    expect(Number.isFinite(a.pose.x)).toBe(true);
  });

  it('world→body rotates by −θ', () => {
    const v = worldToBody(0, 1, Math.PI / 2);
    expect(v.x).toBeCloseTo(1, 12); expect(v.y).toBeCloseTo(0, 12);
  });
});

describe('virtual platform formula 16', () => {
  it('pure rotation: v_i ⟂ r_i, |v_i| = ω|r_i|, outer robots faster', () => {
    const cmd = { vc: { x: 0, y: 0 }, omegaC: 0.5 };
    for (const r of [{ x: 0.6, y: 0.2 }, { x: -0.3, y: 0.5 }]) {
      const v = supportVelocityWorld(cmd, r);
      expect(v.x * r.x + v.y * r.y).toBeCloseTo(0, 12);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(0.5 * Math.hypot(r.x, r.y), 12);
    }
    const turn = { vc: { x: 0.3, y: 0 }, omegaC: 0.4 };
    const outer = supportVelocityWorld(turn, { x: 0, y: -0.5 }); // right side on a left turn
    const inner = supportVelocityWorld(turn, { x: 0, y: 0.5 });
    expect(Math.hypot(outer.x, outer.y)).toBeGreaterThan(Math.hypot(inner.x, inner.y));
  });
});

describe('Viper Slide drive formula 15 & HOLD', () => {
  const p = DEFAULT_LIFT_PARAMS;

  it('F = n·η·G·τ/r_s', () => {
    expect(tractionForce(p)).toBeCloseTo(p.motors * p.efficiency * p.gearRatio * p.motorStallTorque / p.spoolRadius, 10);
  });

  it('heavier load ⇒ slower max up speed; overload ⇒ 0', () => {
    expect(maxUpSpeed(p, 150)).toBeLessThanOrEqual(maxUpSpeed(p, 0));
    expect(maxUpSpeed(p, 1e4)).toBe(0);
  });

  it('HOLD (position lock) keeps height under load and keeps drawing current', () => {
    const s = createLiftState(0.1);
    for (let i = 0; i < 500; i++) stepLift(s, p, { u: -0.1, loadForce: 1.5 * tractionForce(p), lock: true }, 0.01);
    expect(s.h).toBe(0.1);
    expect(s.current).toBeGreaterThan(0);
  });

  it('overloaded slide WITHOUT lock is back-driven (why HOLD must not cut power)', () => {
    const s = createLiftState(0.1);
    for (let i = 0; i < 100; i++) stepLift(s, p, { u: 0, loadForce: 1.5 * tractionForce(p), lock: false }, 0.01);
    expect(s.h).toBeLessThan(0.1);
  });

  it('respects stroke limits and load estimate from current round-trips', () => {
    const s = createLiftState(0);
    for (let i = 0; i < 1000; i++) stepLift(s, p, { u: 1, loadForce: 50, lock: false }, 0.01);
    expect(s.h).toBe(p.hMax);
    const lock = createLiftState(0.1);
    stepLift(lock, p, { u: 0, loadForce: 80, lock: true }, 0.01);
    expect(estimateLoadFromCurrent(p, lock.current)).toBeCloseTo(80, 6);
  });
});

describe('TalosRobotAgent (headless)', () => {
  it('force is null (NA) without a calibrated sensor, never 0', () => {
    const a = new TalosRobotAgent({ id: 1 });
    a.applySupportContact({ agentId: 1, delta: 0.001, deltaDot: 0, force: 0 });
    expect(a.buildMessage('T', 1).force).toBeNull();
    const b = new TalosRobotAgent({ id: 2, forceSensor: 'calibrated' });
    b.applySupportContact({ agentId: 2, delta: 0.001, deltaDot: 0, force: 42 });
    expect(b.buildMessage('T', 1).force).toBe(42);
  });

  it('HOLD zeroes wheels and locks the lift', () => {
    const a = new TalosRobotAgent({ id: 1 });
    a.setTwistCommand({ vx: 1, vy: 0, omega: 0 });
    a.setLiftCommand(0.1);
    for (let i = 0; i < 50; i++) a.step(0.01);
    const h = a.lift.h;
    a.setMode('APPROACH');
    a.setMode('HOLD');
    for (let i = 0; i < 100; i++) a.step(0.01);
    expect(a.wheelRates.every(w => w === 0)).toBe(true);
    expect(a.lift.h).toBe(h);
    expect(a.lift.locked).toBe(true);
  });

  it('seq increases monotonically', () => {
    const a = new TalosRobotAgent({ id: 3 });
    expect(a.buildMessage('T', 1).seq).toBe(1);
    expect(a.buildMessage('T', 1).seq).toBe(2);
  });
});

describe('TalosRobotAgent — 140 mm wheels & corner load cells', () => {
  it('load cells: all four null when uncalibrated or before contact; F/4 each when calibrated', () => {
    const a = new TalosRobotAgent({ id: 1, forceSensor: 'uncalibrated' });
    a.applySupportContact({ agentId: 1, delta: 0.002, deltaDot: 0, force: 120 });
    expect(a.loadCells().map(c => c.force)).toEqual([null, null, null, null]);
    expect(a.measuredForce()).toBeNull();
    const b = new TalosRobotAgent({ id: 2, forceSensor: 'calibrated' });
    expect(b.loadCells().every(c => c.force === null)).toBe(true); // no physics report yet
    b.applySupportContact({ agentId: 2, delta: 0.002, deltaDot: 0, force: 120 });
    expect(b.loadCells().map(c => c.corner)).toEqual(['FL', 'FR', 'RL', 'RR']);
    expect(b.loadCells().map(c => c.force)).toEqual([30, 30, 30, 30]);
    expect(b.measuredForce()).toBe(120);
  });

  it('replaces the 96 mm CAD wheels with 140 mm wheels and lifts the frame by 22 mm', async () => {
    const THREE = await import('three');
    const model = new THREE.Group();
    const frame = new THREE.Group(); frame.name = 'chassis'; model.add(frame);
    for (const id of ['FL', 'FR', 'RL', 'RR']) { const w = new THREE.Group(); w.name = `wheel_${id}`; model.add(w); }
    const warn = console.warn; const warnings: unknown[] = []; console.warn = (...m: unknown[]) => { warnings.push(m); };
    try {
      const agent = new TalosRobotAgent({ id: 7, model });
      const names: string[] = [];
      agent.root.traverse(o => { if (o.name.startsWith('wheel_')) names.push(o.name); });
      expect(names.sort()).toEqual(['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR']); // CAD wheels removed
      const cadClone = agent.root.children.find(c => c.getObjectByName('chassis'))!;
      expect(cadClone.position.z).toBeCloseTo(0.022, 12);
      expect(warnings).toEqual([]); // roller slopes match formula 14
      expect(STRAFER_GEOMETRY.r).toBe(0.07);
      expect(STRAFER_GEOMETRY.omegaMax * 60 / (2 * Math.PI)).toBeCloseTo(223, 9);
      // driving forward spins every wheel forward and the floor rollers stay still (pure +x)
      agent.setTwistCommand({ vx: 0.5, vy: 0, omega: 0 });
      for (let i = 0; i < 100; i++) agent.step(0.01);
      expect(agent.twist.vx).toBeCloseTo(0.5, 6);
      agent.dispose();
    } finally { console.warn = warn; }
  });
});
