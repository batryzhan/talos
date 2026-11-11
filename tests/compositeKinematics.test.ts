import { describe, expect, it } from 'vitest';
import { CompositeSolver, DOCK_PITCH, wheelIndexEntry } from '../src/core/kinematics/compositeSolver';
import { inverseKinematics } from '../src/robot/mecanum';
import { STRAFER_GEOMETRY } from '../src/robot/TalosRobotAgent';
import { Rng } from '../src/swarm/rng';
import type { MecanumGeometry } from '../src/contracts/types';

/** CLAUDE.md §5.1 geometry with a round wheel-rate limit. */
const G: MecanumGeometry = { r: 0.07, a: 0.168, b: 0.208, omegaMax: 20, alphaMax: 100 };
const L = G.a + G.b;

function cluster2x2(): CompositeSolver {
  const s = new CompositeSolver(G, 4);
  s.setFormation('2x2');
  return s;
}

describe('geometry invariants', () => {
  it('uses the Strafer constants a = 0.168, b = 0.208, r = 0.070, L = 0.376', () => {
    expect(STRAFER_GEOMETRY.a).toBe(0.168);
    expect(STRAFER_GEOMETRY.b).toBe(0.208);
    expect(STRAFER_GEOMETRY.r).toBe(0.07);
    expect(STRAFER_GEOMETRY.a + STRAFER_GEOMETRY.b).toBeCloseTo(0.376, 12);
  });

  it('wheel table is indexed k = 4·chassis + local in FL, FR, RL, RR order', () => {
    expect(wheelIndexEntry(0)).toEqual({ k: 0, chassis: 0, local: 0, wheel: 'FL' });
    expect(wheelIndexEntry(7)).toEqual({ k: 7, chassis: 1, local: 3, wheel: 'RR' });
    expect(wheelIndexEntry(14)).toEqual({ k: 14, chassis: 3, local: 2, wheel: 'RL' });
  });
});

describe('single chassis reduces to formula 14', () => {
  it('matches the 4×3 inverse-kinematics matrix row by row', () => {
    const s = new CompositeSolver(G, 1);
    const vx = 0.4, vy = -0.25, om = 0.6;
    s.solveIK(vx, vy, om);
    expect(s.rates[0]).toBeCloseTo((vx - vy - L * om) / G.r, 12); // FL
    expect(s.rates[1]).toBeCloseTo((vx + vy + L * om) / G.r, 12); // FR
    expect(s.rates[2]).toBeCloseTo((vx + vy - L * om) / G.r, 12); // RL
    expect(s.rates[3]).toBeCloseTo((vx - vy + L * om) / G.r, 12); // RR
    const ref = inverseKinematics({ vx, vy, omega: om }, G);
    for (let j = 0; j < 4; j++) expect(s.rates[j]).toBeCloseTo(ref[j], 12);
  });
});

describe('2×2 macro-chassis', () => {
  it('C_macro is the mean of the chassis positions', () => {
    const s = cluster2x2();
    expect(s.count).toBe(4);
    expect(s.wheelCount).toBe(16);
    expect(s.centroid.x).toBeCloseTo(-DOCK_PITCH.x / 2, 12);
    expect(s.centroid.y).toBeCloseTo(-DOCK_PITCH.y / 2, 12);
    // a non-grid layout still averages
    s.setChassis(0, 1, 2, 0); s.setChassis(1, 3, 2, 0); s.setChassis(2, 1, -4, 0); s.setChassis(3, 7, 0, 0);
    s.rebuild();
    expect(s.centroid).toEqual({ x: 3, y: 0 });
  });

  it('forward translation: all 16 wheels turn at v_x / r', () => {
    const s = cluster2x2();
    expect(s.solveIK(0.5, 0, 0)).toBe(1);
    for (let k = 0; k < 16; k++) expect(s.rates[k]).toBeCloseTo(0.5 / G.r, 12);
    const t = s.solveFK();
    expect(t.vx).toBeCloseTo(0.5, 12);
    expect(t.vy).toBeCloseTo(0, 12);
    expect(t.omega).toBeCloseTo(0, 12);
  });

  it('strafing: every chassis shows the −,+,+,− Mecanum pattern', () => {
    const s = cluster2x2();
    s.solveIK(0, 0.3, 0);
    const w = 0.3 / G.r;
    for (let i = 0; i < 4; i++) {
      expect(s.rates[i * 4]).toBeCloseTo(-w, 12);
      expect(s.rates[i * 4 + 1]).toBeCloseTo(w, 12);
      expect(s.rates[i * 4 + 2]).toBeCloseTo(w, 12);
      expect(s.rates[i * 4 + 3]).toBeCloseTo(-w, 12);
    }
    const t = s.solveFK();
    expect(t.vx).toBeCloseTo(0, 12);
    expect(t.vy).toBeCloseTo(0.3, 12);
    expect(t.omega).toBeCloseTo(0, 12);
  });

  it('zero-radius rotation about C_macro: v_k = Ω × (r_k − C)', () => {
    const s = cluster2x2();
    const om = 0.4;
    s.solveIK(0, 0, om);
    let sumX = 0, sumY = 0;
    for (let k = 0; k < 16; k++) {
      const dx = s.wheelPos[k * 2] - s.centroid.x, dy = s.wheelPos[k * 2 + 1] - s.centroid.y;
      expect(s.wheelVel[k * 2]).toBeCloseTo(-om * dy, 12);
      expect(s.wheelVel[k * 2 + 1]).toBeCloseTo(om * dx, 12);
      // the velocity is tangential and proportional to the lever arm
      expect(s.wheelVel[k * 2] * dx + s.wheelVel[k * 2 + 1] * dy).toBeCloseTo(0, 12);
      expect(Math.hypot(s.wheelVel[k * 2], s.wheelVel[k * 2 + 1])).toBeCloseTo(om * Math.hypot(dx, dy), 12);
      sumX += s.wheelVel[k * 2]; sumY += s.wheelVel[k * 2 + 1];
    }
    // the centroid itself does not move
    expect(sumX).toBeCloseTo(0, 12);
    expect(sumY).toBeCloseTo(0, 12);
    const t = s.solveFK();
    expect(t.vx).toBeCloseTo(0, 12);
    expect(t.vy).toBeCloseTo(0, 12);
    expect(t.omega).toBeCloseTo(om, 12);
  });

  it('each member chassis gets the rates of its own rigid-body twist', () => {
    const s = cluster2x2();
    const vx = 0.2, vy = -0.1, om = 0.5;
    s.solveIK(vx, vy, om);
    for (let i = 0; i < 4; i++) {
      const dx = s.chassis[i * 3] - s.centroid.x, dy = s.chassis[i * 3 + 1] - s.centroid.y;
      const own = inverseKinematics({ vx: vx - om * dy, vy: vy + om * dx, omega: om }, G);
      for (let j = 0; j < 4; j++) expect(s.rates[i * 4 + j]).toBeCloseTo(own[j], 12);
    }
  });

  it('FK inverts IK for arbitrary twists and rotated members', () => {
    const s = cluster2x2(), rng = new Rng(7);
    for (let i = 0; i < 4; i++) s.setChassis(i, rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-Math.PI, Math.PI));
    s.rebuild();
    expect(s.wellPosed).toBe(true);
    for (let n = 0; n < 20; n++) {
      const vx = rng.uniform(-0.3, 0.3), vy = rng.uniform(-0.3, 0.3), om = rng.uniform(-0.4, 0.4);
      expect(s.solveIK(vx, vy, om)).toBe(1);
      const t = s.solveFK();
      expect(t.vx).toBeCloseTo(vx, 10);
      expect(t.vy).toBeCloseTo(vy, 10);
      expect(t.omega).toBeCloseTo(om, 10);
    }
  });

  it('uniform saturation scales all 16 wheels by one factor and keeps the direction', () => {
    const s = cluster2x2();
    const vx = 2.0, vy = 1.0, om = 3.0;
    s.solveIK(vx, vy, om, Infinity);
    const raw = Float64Array.from(s.rates);
    const peak = Math.max(...Array.from(raw, Math.abs));
    expect(peak).toBeGreaterThan(G.omegaMax);

    const scale = s.solveIK(vx, vy, om);
    expect(scale).toBeCloseTo(peak / G.omegaMax, 12);
    expect(s.saturation).toBe(scale);
    for (let k = 0; k < 16; k++) expect(s.rates[k]).toBeCloseTo(raw[k] / scale, 12);
    expect(Math.max(...Array.from(s.rates, Math.abs))).toBeCloseTo(G.omegaMax, 12);
    // the achieved twist is the commanded one divided by s — same direction, same turn radius
    const t = s.solveFK();
    expect(t.vx).toBeCloseTo(vx / scale, 10);
    expect(t.vy).toBeCloseTo(vy / scale, 10);
    expect(t.omega).toBeCloseTo(om / scale, 10);
  });

  it('no saturation below the limit', () => {
    const s = cluster2x2();
    expect(s.solveIK(0.1, 0.05, 0.1)).toBe(1);
  });
});

describe('other formations', () => {
  it('2×1 and 1×4 build 8 and 16 wheels with the right extents', () => {
    const s = new CompositeSolver(G, 4);
    s.setFormation('2x1');
    expect(s.wheelCount).toBe(8);
    expect(s.chassis[3] - s.chassis[0]).toBeCloseTo(-DOCK_PITCH.x, 12);
    s.setFormation('1x4');
    expect(s.wheelCount).toBe(16);
    expect(s.chassis[9 + 1] - s.chassis[1]).toBeCloseTo(-3 * DOCK_PITCH.y, 12);
    expect(s.centroid.y).toBeCloseTo(-1.5 * DOCK_PITCH.y, 12);
    s.solveIK(0, 0, 0.3);
    expect(s.solveFK().omega).toBeCloseTo(0.3, 12);
  });

  it('rejects grids beyond capacity', () => {
    expect(() => new CompositeSolver(G, 2).setFormation('2x2')).toThrow(RangeError);
  });

  it('cluster inertia follows the parallel-axis theorem', () => {
    const s = cluster2x2(), out = { mass: 0, izz: 0 };
    s.inertia(10, out);
    const own = (10 * (0.476 ** 2 + 0.454 ** 2)) / 12;
    const arm2 = (DOCK_PITCH.x / 2) ** 2 + (DOCK_PITCH.y / 2) ** 2;
    expect(out.mass).toBe(40);
    expect(out.izz).toBeCloseTo(4 * (own + 10 * arm2), 10);
  });
});

describe('M0 torque balancing (anti-fighting)', () => {
  it('converges to D(k) ≤ 0.01 while conserving the shared load', () => {
    const s = cluster2x2(), rng = new Rng(42);
    const x0 = Float64Array.from({ length: 16 }, () => rng.uniform(-1.5, 1.5));
    const mean0 = x0.reduce((a, v) => a + v, 0) / 16;
    s.loadCurrents(x0);
    expect(s.residual).toBeGreaterThan(1);

    const steps = s.balanceTorque(0.2, 0.01);
    expect(steps).toBeGreaterThan(0);
    expect(s.residual).toBeLessThanOrEqual(0.01);
    let sum = 0, trimSum = 0;
    for (let k = 0; k < 16; k++) {
      sum += s.current[k];
      trimSum += s.trim[k];
      expect(Math.abs(s.current[k] - mean0)).toBeLessThanOrEqual(0.01);
      expect(s.trim[k]).toBeCloseTo(s.current[k] - x0[k], 12);
    }
    expect(sum / 16).toBeCloseTo(mean0, 12); // the real load is untouched
    expect(trimSum).toBeCloseTo(0, 10);      // the trim only redistributes
  });

  it('D(k) never grows, with or without link loss', () => {
    for (const p of [0, 0.1, 0.3]) {
      const s = cluster2x2(), rng = new Rng(3);
      s.loadCurrents(Float64Array.from({ length: 16 }, () => rng.uniform(-2, 2)));
      const mask = new Uint8Array(16);
      let prev = s.residual;
      for (let k = 0; k < 600; k++) {
        for (let e = 0; e < 16; e++) mask[e] = rng.bernoulli(p) ? 0 : 1;
        const D = s.balanceStep(0.2, mask);
        expect(D).toBeLessThanOrEqual(prev + 1e-12);
        prev = D;
      }
      expect(prev).toBeLessThanOrEqual(0.01);
    }
  });

  it('rejects an unstable gain and reports an exhausted horizon', () => {
    const s = cluster2x2();
    s.loadCurrents(Float64Array.from({ length: 16 }, (_, k) => k));
    expect(() => s.balanceTorque(0.5)).toThrow(RangeError);
    expect(s.balanceTorque(0.2, 0.01, 3)).toBe(-1);
  });
});
