import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { MetamorphicScene } from '../src/simulation/environments/MetamorphicScene';
import { DOCK_PITCH } from '../src/core/kinematics/compositeSolver';
import { DOCK_TOLERANCE } from '../src/core/metamorphic/docking';
import type { GamepadFocus } from '../src/contracts/types';

const MACRO: GamepadFocus = { kind: 'swarm', teamId: 'MACRO' };
const SOLO1: GamepadFocus = { kind: 'agent', agentId: 1 };

function run(s: MetamorphicScene, seconds: number, vx = 0, vy = 0, omega = 0, focus: GamepadFocus = MACRO): void {
  for (let k = 0; k < Math.round(seconds * 100); k++) s.step(vx, vy, omega, focus);
}

function assembled(lossP = 0): MetamorphicScene {
  const s = new MetamorphicScene({ seed: 1, lossP });
  s.assemble();
  run(s, 15);
  return s;
}

describe('MetamorphicScene (headless)', () => {
  it('starts cut off: d = ∞ across the chasm, nothing locked', () => {
    const s = new MetamorphicScene({ seed: 1 });
    expect(s.route).toEqual({ status: 'UNREACHABLE', cost: Infinity });
    expect(s.hud.locked).toBe(false);
    expect(s.orchestrator.idsWithRole('RESERVE')).toEqual([5, 6]);
    run(s, 1);
    expect(s.hud.dockStatus.every(d => d === 'DISCONNECTED')).toBe(true);
  });

  it('assembles the 2×2 macro-chassis and deploys the bridge', () => {
    const s = assembled();
    expect(s.macroFormed).toBe(true);
    expect(s.hud.dockStatus).toEqual(Array.from({ length: 6 }, () => 'STRUCTURAL_LOCK'));
    expect(s.hud.lockedCount).toBe(4);

    // members sit on the dock pitch within the latch tolerance
    const d = (a: number, b: number): number => Math.hypot(s.pose[a * 3] - s.pose[b * 3], s.pose[a * 3 + 1] - s.pose[b * 3 + 1]);
    expect(Math.abs(d(0, 1) - DOCK_PITCH.y)).toBeLessThanOrEqual(2 * DOCK_TOLERANCE.pos);
    expect(Math.abs(d(0, 2) - DOCK_PITCH.x)).toBeLessThanOrEqual(2 * DOCK_TOLERANCE.pos);
    expect(s.macro.centroid.x).toBeCloseTo(0, 12);
    expect(s.macro.centroid.y).toBeCloseTo(0, 12);

    // bridge: brakes on, edge published, route recovered
    expect(s.bridge?.status).toBe('HOLDING');
    expect(s.bridge?.brakesEngaged).toBe(true);
    expect(s.graph.edge(1).state).toMatchObject({ status: 'PASSABLE_STRUCTURE', traversable: true, maxLoadKg: 40, agentIds: [5, 6] });
    expect(s.route).toMatchObject({ status: 'FOUND', nodes: [0, 1, 2, 3] });
    expect(s.hud.routeStatus).toBe('FOUND');
    expect(s.orchestrator.idsWithRole('STRUCTURE_NODE')).toEqual([5, 6]);

    const done = s.dag!.tasks.filter(t => t.status === 'DONE').map(t => t.type);
    expect(done).toEqual(['ROUTE_CHECK', 'DEPLOY_BRIDGE', 'FORM_MACRO']);
  });

  it('M0 torque balancing drives D(k) ≤ 0.01 and the latches from red to green', () => {
    for (const p of [0, 0.1, 0.3]) {
      const s = new MetamorphicScene({ seed: 2, lossP: p });
      s.assemble();
      let peak = 0, residual0 = 0;
      for (let k = 0; k < 1500 && !s.macroFormed; k++) s.step(0, 0, 0, MACRO);
      expect(s.macroFormed).toBe(true);
      run(s, 0.1);
      peak = s.hud.peakStress; residual0 = s.hud.residual;
      expect(residual0).toBeGreaterThan(3);
      expect(peak).toBeGreaterThan(0.85); // CRITICAL right after the lock

      run(s, 40);
      expect(s.hud.residual).toBeLessThanOrEqual(0.01);
      expect(s.hud.consensusSteps).toBeGreaterThan(50);
      for (let n = 0; n < 4; n++) expect(s.stress[n]).toBeLessThan(0.05);
    }
  });

  it('drives as one rigid body: translation, strafe and rotation about C_macro', () => {
    const s = assembled();
    const rel = (): number[] => {
      const out: number[] = [];
      for (let i = 1; i < 4; i++) out.push(Math.hypot(s.pose[i * 3] - s.pose[0], s.pose[i * 3 + 1] - s.pose[1]));
      return out;
    };
    const shape = rel(), x0 = s.macroPose.x, y0 = s.macroPose.y, th0 = s.macroPose.theta;

    run(s, 2, 0.2, 0, 0);
    expect(s.macroPose.x - x0).toBeCloseTo(0.4, 6);
    expect(s.macroPose.y - y0).toBeCloseTo(0, 6);

    run(s, 2, 0, 0.1, 0);
    expect(s.macroPose.y - y0).toBeCloseTo(0.2, 6);

    const cx = s.macroPose.x, cy = s.macroPose.y;
    run(s, 2, 0, 0, 0.3);
    expect(s.macroPose.theta - th0).toBeCloseTo(0.6, 6);
    expect(s.macroPose.x).toBeCloseTo(cx, 9); // zero-radius: the centroid stays put
    expect(s.macroPose.y).toBeCloseTo(cy, 9);
    rel().forEach((d, i) => expect(d).toBeCloseTo(shape[i], 9)); // rigid
    expect(s.hud.saturation).toBe(1);
  });

  it('solo focus cannot move a locked chassis; macro focus ignores solo commands', () => {
    const s = assembled();
    const before = Array.from(s.pose);
    run(s, 1, 0.5, 0.2, 0.4, SOLO1);
    expect(Array.from(s.pose)).toEqual(before);
    expect(s.hud.focus).toBe('solo');
  });

  it('solo focus drives a free chassis and saturates uniformly', () => {
    const s = new MetamorphicScene({ seed: 1 });
    const x0 = s.pose[0], y0 = s.pose[1], th = s.pose[2];
    run(s, 1, 0.3, 0, 0, SOLO1);
    expect(s.pose[0] - x0).toBeCloseTo(0.3 * Math.cos(th), 6);
    expect(s.pose[1] - y0).toBeCloseTo(0.3 * Math.sin(th), 6);
    expect(s.pose[3]).not.toBe(s.pose[0]);

    run(s, 0.2, 3, 0, 2, SOLO1); // far beyond the wheel-rate limit
    expect(s.hud.saturation).toBeGreaterThan(1);
  });

  it('release opens the latches, withdraws the bridge and cuts the route again', () => {
    const s = assembled();
    s.release();
    run(s, 0.1);
    expect(s.macroFormed).toBe(false);
    expect(s.hud.dockStatus.every(d => d === 'DISCONNECTED')).toBe(true);
    expect(s.graph.edge(1).state).toEqual({ status: 'CLOSED', reason: 'CHASM' });
    expect(s.route.status).toBe('UNREACHABLE');
    expect(s.hud.bridgeStatus).toBe('RELEASED');
    expect(s.orchestrator.idsWithRole('RESERVE')).toEqual([5, 6]);

    s.assemble(); // and the mission can be started again
    run(s, 15);
    expect(s.macroFormed).toBe(true);
    expect(s.route.status).toBe('FOUND');
  });

  it('is deterministic for a fixed seed', () => {
    const a = assembled(0.3), b = assembled(0.3);
    expect(Array.from(a.pose)).toEqual(Array.from(b.pose));
    expect(a.hud.residual).toBe(b.hud.residual);
    expect(a.channel.dropped).toBe(b.channel.dropped);
    expect(a.channel.dropped).toBeGreaterThan(0);
    expect(a.hud.delivery).toBeCloseTo(0.7, 1);
  });

  it('radio loss cycles through 0, 0.1, 0.3', () => {
    const s = new MetamorphicScene({ lossP: 0 });
    expect([s.cycleLoss(), s.cycleLoss(), s.cycleLoss()]).toEqual([0.1, 0.3, 0]);
  });

  it('renders through instanced meshes and keeps the stress attribute in sync', () => {
    const s = assembled();
    run(s, 0.1);
    s.sync(1.5);
    const meshes: T.InstancedMesh[] = [];
    s.root.traverse(o => { if (o instanceof T.InstancedMesh) meshes.push(o); });
    expect(meshes.map(m => m.count).sort((x, y) => x - y)).toEqual([5, 6, 24]); // 4 macro latches + 1 bridge latch
    const latch = meshes.find(m => m.count === 5)!;
    const attr = latch.geometry.getAttribute('aStress') as T.InstancedBufferAttribute;
    expect(attr.array).toBe(s.stress);
    expect(attr.usage).toBe(T.DynamicDrawUsage);
    expect((latch.material as T.ShaderMaterial).uniforms.uTime.value).toBe(1.5);
  });
});
