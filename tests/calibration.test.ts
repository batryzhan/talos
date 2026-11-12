import { describe, expect, it } from 'vitest';
import {
  EQ1_ROWS, STRAFER_KINEMATICS, WHEEL_POSITIONS, bodyTwist, saturate, saturationFactor, stoppingDistance, wheelRates,
} from '../src/core/calibration/chassisKinematics';
import { BRAKE_DECEL, BRAKE_TAU, CalibrationProgram, MANEUVERS, SCRIPTS, type ManeuverId } from '../src/core/calibration/CalibrationProgram';
import { calibrationSnapshot } from '../src/core/calibration/snapshot';
import { TalosRobotAgent } from '../src/robot/TalosRobotAgent';
import { inverseKinematics } from '../src/robot/mecanum';

const K = STRAFER_KINEMATICS;
const rates = (vx: number, vy: number, w: number): number[] => wheelRates(vx, vy, w, [0, 0, 0, 0]) as number[];

describe('chassis kinematics — equations 1, 2, 7', () => {
  it('uses the Strafer geometry of CLAUDE.md: a = 0.168, b = 0.208, L = 0.376, r = 0.070 m', () => {
    expect(K.a).toBeCloseTo(0.168, 6);
    expect(K.b).toBeCloseTo(0.208, 6);
    expect(K.L).toBeCloseTo(0.376, 6);
    expect(K.r).toBeCloseTo(0.07, 6);
    expect(EQ1_ROWS).toEqual([[-1, -1], [1, 1], [1, -1], [-1, 1]]);
  });

  it('equation 1: forward, strafe, diagonal and spin wheel patterns', () => {
    const v = 0.7;
    rates(v, 0, 0).forEach(w => expect(w).toBeCloseTo(v / K.r, 9));
    expect(rates(0, v, 0).map(w => Math.sign(w))).toEqual([-1, 1, 1, -1]);
    // Diagonal: only the FR / RL pair turns.
    const d = rates(v, v, 0);
    expect(d[0]).toBeCloseTo(0, 12); expect(d[3]).toBeCloseTo(0, 12);
    expect(d[1]).toBeCloseTo((2 * v) / K.r, 9); expect(d[2]).toBeCloseTo((2 * v) / K.r, 9);
    // Spin: left side backwards, right side forwards, |ω_i| = L·ω / r.
    const s = rates(0, 0, 1);
    expect(s.map(w => Math.sign(w))).toEqual([-1, 1, -1, 1]);
    s.forEach(w => expect(Math.abs(w)).toBeCloseTo(K.L / K.r, 9));
  });

  it('equation 1 matches the robot IK and is inverted by the forward kinematics', () => {
    const geom = { r: K.r, a: K.a, b: K.b, omegaMax: K.omegaLim, alphaMax: 100 };
    for (const [vx, vy, w] of [[0.3, -0.2, 0.5], [-1, 0.4, -1.2], [0, 0, 2], [0.8, 0.8, 0]]) {
      const ours = rates(vx, vy, w), theirs = inverseKinematics({ vx, vy, omega: w }, geom);
      ours.forEach((x, i) => expect(x).toBeCloseTo(theirs[i], 12));
      const back = bodyTwist(ours, [0, 0, 0]);
      expect(back[0]).toBeCloseTo(vx, 12); expect(back[1]).toBeCloseTo(vy, 12); expect(back[2]).toBeCloseTo(w, 12);
    }
  });

  it('equation 2: s = max(1, max|ω|/ω_lim), uniform division keeps the direction and curvature', () => {
    expect(saturationFactor(rates(0.5, 0, 0))).toBe(1);
    const raw = rates(1.25, 0.85, 0.6), out = [0, 0, 0, 0];
    const s = saturate(raw, out);
    expect(s).toBeCloseTo(Math.max(...raw.map(Math.abs)) / K.omegaLim, 12);
    expect(s).toBeGreaterThan(1.3);
    expect(Math.max(...out.map(Math.abs))).toBeCloseTo(K.omegaLim, 9);
    const t = bodyTwist(out, [0, 0, 0]);
    expect(Math.atan2(t[1], t[0])).toBeCloseTo(Math.atan2(0.85, 1.25), 12);
    expect(t[2] / Math.hypot(t[0], t[1])).toBeCloseTo(0.6 / Math.hypot(1.25, 0.85), 12);
  });

  it('equation 7: d_stop = v·τ + v²/(2·a_br)', () => {
    expect(stoppingDistance(0, 0.03, 7)).toBe(0);
    expect(stoppingDistance(1.2, 0.03, 7)).toBeCloseTo(1.2 * 0.03 + 1.44 / 14, 12);
    expect(stoppingDistance(-1.2, 0.03, 7)).toBeCloseTo(stoppingDistance(1.2, 0.03, 7), 12);
  });

  it('wheel positions are FL (+a,+b), FR (+a,−b), RL (−a,+b), RR (−a,−b)', () => {
    expect(WHEEL_POSITIONS.map(([x, y]) => [Math.sign(x), Math.sign(y)])).toEqual([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  });
});

/** Drive a headless Strafer through the program exactly like Engine mode 0 does. */
function drive(id: ManeuverId, cycles = 1): { a: TalosRobotAgent; p: CalibrationProgram; maxS: number; maxClip: number } {
  const a = new TalosRobotAgent({ id: 1, pose: { x: -7, y: -5, theta: 0 } });
  const p = new CalibrationProgram(a);
  p.select(id, a);
  let maxS = 1, maxClip = 0;
  for (let k = 0; k < 8000 && p.cycles < cycles; k++) {
    p.step(0.01, a, false);
    a.setTwistCommand(p.applied);
    a.step(0.01);
    p.observe(a);
    maxS = Math.max(maxS, p.s);
    maxClip = Math.max(maxClip, p.clipDirectionError);
  }
  return { a, p, maxS, maxClip };
}

describe('/calibration — scripted test manoeuvres', () => {
  it.each(MANEUVERS.map(m => [m]))('%s completes a cycle and returns to the home pose', id => {
    const { a, p } = drive(id);
    expect(p.cycles).toBe(1);
    expect(Math.hypot(a.pose.x + 7, a.pose.y + 5)).toBeLessThan(0.02);
    expect(Math.abs(Math.atan2(Math.sin(a.pose.theta), Math.cos(a.pose.theta)))).toBeLessThan(0.02);
  });

  it('pure strafe and straight legs: no heading drift and no cross-track error', () => {
    for (const id of ['forward', 'strafe', 'diagonal'] as const) {
      const { p } = drive(id);
      expect(p.headingDrift).toBeLessThan(1e-6);
      expect(p.crossTrack).toBeLessThan(1e-6);
    }
  });

  it('strafe moves sideways only: the body keeps its heading and x stays put', () => {
    const a = new TalosRobotAgent({ id: 1 }), p = new CalibrationProgram(a);
    p.select('strafe', a);
    for (let k = 0; k < 200; k++) { p.step(0.01, a, false); a.setTwistCommand(p.applied); a.step(0.01); p.observe(a); }
    expect(a.pose.y).toBeGreaterThan(0.9);
    expect(Math.abs(a.pose.x)).toBeLessThan(1e-9);
    expect(Math.abs(a.pose.theta)).toBeLessThan(1e-9);
  });

  it('spin in place keeps the centre fixed', () => {
    const { p } = drive('rotate');
    expect(p.centerDrift).toBeLessThan(1e-6);
  });

  it('saturation manoeuvre: s > 1, the drive keeps the commanded direction, per-wheel clipping would not', () => {
    const { p, maxS, maxClip } = drive('saturation');
    expect(maxS).toBeGreaterThan(1.3);
    expect(p.directionError).toBeLessThan(1e-3);
    expect(maxClip).toBeGreaterThan(0.03); // ≈ 3°
  });

  it('brake test: measured stopping distance agrees with equation 7 within 6 %', () => {
    const { p } = drive('brake');
    const b = p.lastBrake!;
    expect(p.brakeCount).toBe(1);
    expect(b.v).toBeCloseTo(1.2, 3);
    expect(b.predicted).toBeCloseTo(stoppingDistance(1.2, BRAKE_TAU, BRAKE_DECEL), 6);
    expect(Math.abs(b.error)).toBeLessThan(0.06);
  });

  it('applies the actuation latency τ = 30 ms', () => {
    const a = new TalosRobotAgent({ id: 1 }), p = new CalibrationProgram(a);
    p.select('forward', a);
    const applied: number[] = [];
    for (let k = 0; k < 5; k++) { p.step(0.01, a, false); applied.push(p.applied.vx); }
    expect(applied).toEqual([0, 0, 0, 0.6, 0.6]);
  });

  it('manual input suspends the script; releasing it restarts from the current pose', () => {
    const a = new TalosRobotAgent({ id: 1 }), p = new CalibrationProgram(a);
    p.select('forward', a);
    for (let k = 0; k < 100; k++) { p.step(0.01, a, true, 0, 0.3, 0); a.setTwistCommand(p.applied); a.step(0.01); p.observe(a); }
    expect(p.manual).toBe(true);
    expect(a.pose.y).toBeGreaterThan(0.2);
    p.step(0.01, a, false);
    expect(p.manual).toBe(false);
    expect(p.origin.y).toBeCloseTo(a.pose.y, 9);
  });

  it('snapshot exposes all four wheels with equations 1, 2 and the rim speed', () => {
    const { a, p } = drive('saturation');
    p.select('saturation', a);
    for (let k = 0; k < 60; k++) { p.step(0.01, a, false); a.setTwistCommand(p.applied); a.step(0.01); p.observe(a); }
    const s = calibrationSnapshot(p, a);
    expect(s.wheels.map(w => w.id)).toEqual(['FL', 'FR', 'RL', 'RR']);
    expect(s.s).toBeGreaterThan(1);
    s.wheels.forEach(w => {
      expect(w.scaled).toBeCloseTo(w.raw / s.s, 9);
      expect(w.rim).toBeCloseTo(w.actual * K.r, 12);
      expect(w.load).toBeLessThanOrEqual(1);
    });
    expect(s.dStop).toBeCloseTo(stoppingDistance(s.speed, BRAKE_TAU, BRAKE_DECEL), 12);
  });

  it('every script is finite and starts with motion', () => {
    for (const id of MANEUVERS) {
      expect(SCRIPTS[id].length).toBeGreaterThan(1);
      expect(SCRIPTS[id].every(l => Number.isFinite(l.dur) && l.dur > 0)).toBe(true);
    }
  });
});
