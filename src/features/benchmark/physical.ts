import { TalosRobotAgent } from '@/robot/TalosRobotAgent';
import { SwarmManager } from '@/swarm/SwarmManager';
import { PayloadPhysics, equilibrium } from '@/physics/M1';
import { supports } from '@/missions/cases';
import type { ControllerKind } from '@/contracts/types';

export interface PhysicalResult {
  controller: ControllerKind;
  seed: number;
  /** Support height spread (m) and trajectory error (m) at the end of the run. */
  E_h: number | null;
  E_traj: number | null;
  /** Every robot ended in HOLD with the payload stable (ρ ≥ 0) and all supports in contact. */
  safeHold: boolean;
}

/**
 * Paired physical comparison: the same 4-robot / 24 kg lift with each controller, same seed,
 * same fault (radio of agent 1 dies at 8 s, p = 0.3). 1500 fixed 10 ms steps per controller.
 */
export async function physicalBenchmark(seed: number): Promise<PhysicalResult[]> {
  const results: PhysicalResult[] = [];
  for (const controller of ['A', 'B', 'C'] as ControllerKind[]) {
    const points = supports(4, { x: 2.6, y: 1.7 });
    const agents = points.map((p, i) => new TalosRobotAgent({ id: i + 1, pose: { ...p, theta: 0 }, forceSensor: 'calibrated', stiffness: 20000 * (1 + 0.02 * Math.sin(seed + i)), damping: 200 }));
    const mgr = new SwarmManager(agents, { seed, controller });
    mgr.assignSupports(points.map((r, i) => ({ agentId: i + 1, r })), { x: 0, y: 0, theta: 0 });
    const eq = equilibrium(mgr.getSupportContactInputs(), 24, { x: 0.15, y: 0 });
    const physics = new PayloadPhysics({ id: 'bench', mass: 24, com: { x: 0.15, y: 0 }, pose: { x: 0, y: 0, theta: 0 }, z: eq.plane.a + eq.plane.b * 0.15, rho: 0.3 });
    physics.pitch = eq.plane.b;
    physics.roll = eq.plane.c;
    let contacts = eq.contacts;
    mgr.beginApproach();
    mgr.requestLift();
    mgr.startTransport();
    for (let i = 0; i < 1500; i++) {
      mgr.step(0.01, { time: i * 0.01, contacts, payload: physics.state, faults: i >= 800 ? { lossP: 0.3, radioDead: [1] } : {} });
      contacts = physics.step(0.01, mgr.getSupportContactInputs()).contacts;
    }
    const m = mgr.getMetrics();
    results.push({
      controller, seed, E_h: m.E_h, E_traj: m.E_traj,
      safeHold: agents.every(a => a.mode === 'HOLD') && (physics.state.rho ?? -1) >= 0 && contacts.every(c => c.delta > 0),
    });
    await new Promise(r => setTimeout(r, 0));
  }
  return results;
}
