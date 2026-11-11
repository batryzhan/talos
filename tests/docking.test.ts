import { describe, expect, it } from 'vitest';
import {
  DOCK_TOLERANCE, DOCK_TRANSITIONS, DockingController, canDockTransition, dockingError, latchLoadRatio,
  latchStress, positionError, stressLevel, withinTolerance,
} from '../src/core/metamorphic/docking';
import { findLatchPairs, validateStructure } from '../src/core/metamorphic/structure';
import { CompositeSolver, DOCK_PITCH } from '../src/core/kinematics/compositeSolver';
import { STRAFER_GEOMETRY } from '../src/robot/TalosRobotAgent';
import { LATCH_STATUS_ORDER, type DockingError6, type LatchStatus, type Pose2D } from '../src/types/metamorphic';

const DT = 1 / 50;

/** Integrate a holonomic mover under the controller at 50 Hz. Returns the visited statuses. */
function drive(c: DockingController, mover: Pose2D, port: Pose2D, seconds: number, t0 = 0): LatchStatus[] {
  const seen: LatchStatus[] = [c.status];
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    const t = t0 + k * DT;
    const status = c.update(mover, port, t, DT);
    if (seen[seen.length - 1] !== status) seen.push(status);
    const cs = Math.cos(mover.theta), sn = Math.sin(mover.theta);
    mover.x += (cs * c.command.vx - sn * c.command.vy) * DT;
    mover.y += (sn * c.command.vx + cs * c.command.vy) * DT;
    mover.theta += c.command.omega * DT;
  }
  return seen;
}

describe('docking error', () => {
  it('is expressed in the port frame with z, roll, pitch ≡ 0', () => {
    const e: DockingError6 = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, theta: 0 };
    dockingError({ x: 1, y: 2, theta: Math.PI / 2 + 0.1 }, { x: 1, y: 1, theta: Math.PI / 2 }, e);
    expect(e.x).toBeCloseTo(1, 12); // 1 m ahead along the port's x axis
    expect(e.y).toBeCloseTo(0, 12);
    expect(e.theta).toBeCloseTo(0.1, 12);
    expect([e.z, e.roll, e.pitch]).toEqual([0, 0, 0]);
    expect(positionError(e)).toBeCloseTo(1, 12);
  });

  it('wraps the heading error across ±π', () => {
    const e: DockingError6 = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, theta: 0 };
    dockingError({ x: 0, y: 0, theta: -3.1 }, { x: 0, y: 0, theta: 3.1 }, e);
    expect(e.theta).toBeCloseTo(2 * Math.PI - 6.2, 12);
  });

  it('tolerance gate is 5 mm and 1°', () => {
    expect(DOCK_TOLERANCE.pos).toBe(0.005);
    expect(DOCK_TOLERANCE.theta).toBeCloseTo(0.0175, 4);
    const e: DockingError6 = { x: 0.003, y: 0.004, z: 0, roll: 0, pitch: 0, theta: 0.017 };
    expect(withinTolerance(e, DOCK_TOLERANCE)).toBe(true);   // exactly 5 mm
    expect(withinTolerance({ ...e, x: 0.0031 }, DOCK_TOLERANCE)).toBe(false);
    expect(withinTolerance({ ...e, theta: -0.018 }, DOCK_TOLERANCE)).toBe(false);
  });
});

describe('state guards', () => {
  it('the chain only moves forward one state at a time, or back / out', () => {
    expect(LATCH_STATUS_ORDER).toEqual(['DISCONNECTED', 'APPROACHING', 'ALIGNING', 'LATCHED', 'STRUCTURAL_LOCK']);
    for (let i = 0; i + 1 < LATCH_STATUS_ORDER.length; i++) {
      expect(canDockTransition(LATCH_STATUS_ORDER[i], LATCH_STATUS_ORDER[i + 1])).toBe(true);
    }
    expect(canDockTransition('DISCONNECTED', 'LATCHED')).toBe(false);
    expect(canDockTransition('APPROACHING', 'STRUCTURAL_LOCK')).toBe(false);
    expect(canDockTransition('ALIGNING', 'STRUCTURAL_LOCK')).toBe(false);
    expect(DOCK_TRANSITIONS.STRUCTURAL_LOCK).toEqual(['DISCONNECTED']);
  });

  it('rejects out-of-order commands and leaves the state untouched', () => {
    const c = new DockingController();
    expect(c.confirmLock(0)).toBe(false);
    expect(c.release(0)).toBe(false);          // already DISCONNECTED
    expect(c.status).toBe('DISCONNECTED');
    expect(c.engage(0)).toBe(true);
    expect(c.engage(0)).toBe(false);           // no double engage
    expect(c.confirmLock(0)).toBe(false);      // not LATCHED yet
    expect(c.status).toBe('APPROACHING');
  });

  it('a disconnected controller commands nothing', () => {
    const c = new DockingController();
    c.update({ x: 1, y: 1, theta: 0 }, { x: 0, y: 0, theta: 0 }, 0, DT);
    expect(c.command).toEqual({ vx: 0, vy: 0, omega: 0 });
  });
});

describe('alignment controller', () => {
  it('walks the full chain and latches inside 5 mm / 1°', () => {
    const c = new DockingController(), port: Pose2D = { x: 2, y: -1, theta: 0.7 };
    const mover: Pose2D = { x: 0.6, y: 0.2, theta: -0.4 };
    c.engage(0);
    const seen = drive(c, mover, port, 20);
    expect(seen).toEqual(['APPROACHING', 'ALIGNING', 'LATCHED']);
    expect(positionError(c.error)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(c.error.theta)).toBeLessThanOrEqual(Math.PI / 180);
    expect(c.command).toEqual({ vx: 0, vy: 0, omega: 0 });
    expect(c.lockReady).toBe(true);
    expect(c.snapshot()).toMatchObject({ status: 'LATCHED', lockReady: true });

    expect(c.confirmLock(20)).toBe(true);
    expect(c.status).toBe('STRUCTURAL_LOCK');
    expect(c.engage(20)).toBe(false);
    // locked: no motion command regardless of the measured error
    c.update({ x: 0, y: 0, theta: 0 }, port, 21, DT);
    expect(c.command).toEqual({ vx: 0, vy: 0, omega: 0 });
    expect(c.release(22)).toBe(true);
    expect(c.snapshot()).toEqual({ status: 'DISCONNECTED', since: 22, reason: 'released' });
  });

  it('respects the approach and micro-adjustment speed caps', () => {
    const c = new DockingController(), port: Pose2D = { x: 3, y: 0, theta: 0 }, mover: Pose2D = { x: 0, y: 0, theta: 1 };
    c.engage(0);
    c.update(mover, port, 0, DT);
    expect(Math.hypot(c.command.vx, c.command.vy)).toBeCloseTo(c.params.vApproach, 12);
    expect(Math.abs(c.command.omega)).toBeCloseTo(c.params.wApproach, 12);
    // straight at the port: the body command points along the world correction
    expect(Math.atan2(c.command.vy, c.command.vx) + mover.theta).toBeCloseTo(0, 12);

    const fine = new DockingController(), near: Pose2D = { x: 2.96, y: 0, theta: 0 };
    fine.engage(0);
    fine.update(near, port, 0, DT);
    expect(fine.status).toBe('ALIGNING');
    expect(Math.hypot(fine.command.vx, fine.command.vy)).toBeLessThanOrEqual(fine.params.vAlign + 1e-12);
  });

  it('never latches outside the tolerance', () => {
    for (const offset of [{ x: 0.006, theta: 0 }, { x: 0, theta: 1.2 * (Math.PI / 180) }]) {
      const c = new DockingController({ timeout: 1e9 }), port: Pose2D = { x: 0, y: 0, theta: 0 };
      const stuck: Pose2D = { x: offset.x, y: 0, theta: offset.theta }; // a mover that cannot move
      c.engage(0);
      for (let k = 0; k < 500; k++) expect(c.update(stuck, port, k * DT, DT)).toBe('ALIGNING');
    }
  });

  it('needs the dwell time inside the tolerance before latching', () => {
    const c = new DockingController(), port: Pose2D = { x: 0, y: 0, theta: 0 }, at: Pose2D = { x: 0.001, y: 0, theta: 0 };
    c.engage(0);
    const steps = Math.ceil(c.params.dwell / DT);
    let k = 0;
    c.update(at, port, k++ * DT, DT); // APPROACHING → ALIGNING
    for (let i = 0; i < steps - 1; i++) expect(c.update(at, port, k++ * DT, DT)).toBe('ALIGNING');
    // leaving the tolerance resets the dwell
    c.update({ x: 0.02, y: 0, theta: 0 }, port, k++ * DT, DT);
    for (let i = 0; i < steps - 1; i++) expect(c.update(at, port, k++ * DT, DT)).toBe('ALIGNING');
    expect(c.update(at, port, k++ * DT, DT)).toBe('LATCHED');
    expect(c.lockReady).toBe(false);
    expect(c.confirmLock(k * DT)).toBe(false); // pawl not seated yet
  });

  it('reopens the latch if pushed out of tolerance before the lock', () => {
    const c = new DockingController(), port: Pose2D = { x: 0, y: 0, theta: 0 }, mover: Pose2D = { x: 0.3, y: 0.1, theta: 0.2 };
    c.engage(0);
    drive(c, mover, port, 10);
    expect(c.status).toBe('LATCHED');
    mover.x += 0.02;
    expect(c.update(mover, port, 10, DT)).toBe('ALIGNING');
    expect(c.lockReady).toBe(false);
  });

  it('falls back to DISCONNECTED on the mechanical timeout', () => {
    const c = new DockingController({ timeout: 2 }), port: Pose2D = { x: 5, y: 0, theta: 0 }, blocked: Pose2D = { x: 0, y: 0, theta: 0 };
    c.engage(1);
    let status: LatchStatus = c.status;
    for (let k = 0; k < 200 && status !== 'DISCONNECTED'; k++) status = c.update(blocked, port, 1 + k * DT, DT);
    expect(c.snapshot()).toMatchObject({ status: 'DISCONNECTED', reason: 'timeout' });
    expect(c.command).toEqual({ vx: 0, vy: 0, omega: 0 });
    expect(c.engage(10)).toBe(true); // a new attempt is allowed
    expect(c.reason).toBeNull();
  });

  it('a fault drops any state to DISCONNECTED', () => {
    const c = new DockingController();
    c.engage(0);
    expect(c.fault(0.5)).toBe(true);
    expect(c.snapshot()).toEqual({ status: 'DISCONNECTED', since: 0.5, reason: 'fault' });
  });
});

describe('latch stress', () => {
  it('maps joint forces to plate stress and a clamped load ratio', () => {
    const s = latchStress(144, 28.8, { sxx: 0, syy: 0, txy: 0 });
    expect(s.sxx).toBeCloseTo(144 / 2.88e-4, 6);
    expect(s.txy).toBeCloseTo(28.8 / 2.88e-4, 6);
    expect(s.syy).toBe(0);
    expect(latchLoadRatio(0, 0)).toBe(0);
    expect(latchLoadRatio(75, 0)).toBeCloseTo(0.5, 12);
    expect(latchLoadRatio(0, 50)).toBeCloseTo((Math.sqrt(3) * 50) / 150, 12);
    expect(latchLoadRatio(1e6, 0)).toBe(1);
  });

  it('classifies green / yellow / red', () => {
    expect(stressLevel(0.2)).toBe('NOMINAL');
    expect(stressLevel(0.5)).toBe('ELEVATED');
    expect(stressLevel(0.85)).toBe('CRITICAL');
  });
});

describe('structural validation before lock', () => {
  const solver = (): CompositeSolver => {
    const s = new CompositeSolver(STRAFER_GEOMETRY, 4);
    s.setFormation('2x2');
    return s;
  };

  it('a 2×2 grid is valid with four latches', () => {
    const s = solver(), pairs = new Uint8Array(16);
    expect(findLatchPairs(s, pairs)).toBe(4);
    expect(validateStructure(s)).toEqual({ status: 'VALID', latches: 4 });
    s.setFormation('1x4');
    expect(validateStructure(s)).toEqual({ status: 'VALID', latches: 3 });
  });

  it('rejects a misaligned heading and a detached member', () => {
    const s = solver();
    s.setChassis(3, s.chassis[9], s.chassis[10], 0.1);
    s.rebuild();
    expect(validateStructure(s)).toEqual({ status: 'INVALID', reason: 'heading-mismatch' });

    const d = solver();
    d.setChassis(3, -DOCK_PITCH.x - 0.2, -DOCK_PITCH.y - 0.2, 0);
    d.rebuild();
    expect(validateStructure(d)).toEqual({ status: 'INVALID', reason: 'not-connected' });
  });
});
