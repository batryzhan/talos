import { describe, expect, it } from 'vitest';
import { FACE_NODES, LIGHT_RADIUS, MiningMission, SHAFT } from '../src/missions/MiningMission';

describe('/mining — underground swarm', () => {
  it('fields 6 Scanner-Light, 6 Miner-Drill and 6 Hauler-Cart robots', () => {
    const m = new MiningMission();
    const n = (cap: string): number => m.agents.filter(a => a.module.capability === cap).length;
    expect([m.agents.length, n('LIDAR_ILLUMINATOR'), n('ROTARY_EXCAVATOR'), n('ORE_HOPPER_CART')]).toEqual([18, 6, 6, 6]);
  });

  it('Scanner-Light → Miner-Drill → Hauler-Cart: drills work only under a scanner, ore reaches the shaft', () => {
    const m = new MiningMission({ seed: 0 });
    for (let s = 0; s < 240; s++) {
      m.run(1);
      for (const a of m.agents) if (a.task === 'MINING_VEIN') {
        const lit = m.agents.some(s2 => s2.module.capability === 'LIDAR_ILLUMINATOR' && s2.active && Math.hypot(s2.x - a.x, s2.y - a.y) < LIGHT_RADIUS);
        expect(lit).toBe(true);
      }
    }
    expect(m.explored()).toBe(1);
    expect(m.minedKg).toBeGreaterThan(500);
    expect(m.deliveredKg).toBeGreaterThan(300);
  });

  it('removing the light stops the drill', () => {
    const m = new MiningMission({ seed: 0 });
    m.run(110);
    const drill = m.agents.find(a => a.task === 'MINING_VEIN')!;
    expect(drill).toBeDefined();
    for (const s of m.agents) if (s.module.capability === 'LIDAR_ILLUMINATOR') s.active = false;
    m.run(1);
    expect(drill.task).toBe('WAITING_LIGHT');
  });

  it('a collapse closes the drift (S1) and loaded carts reroute around it', () => {
    const m = new MiningMission({ seed: 2, crackEdges: [] });
    for (let s = 0; s < 400 && !m.agents.some(a => a.task === 'HAULING_TO_SHAFT' && a.hasRoute && a.wpEdge.slice(a.wpIndex).some(e => e >= 0 && m.canClose(e))); s++) m.run(0.5);
    const c = m.triggerCollapse()!;
    expect(c).not.toBeNull();
    expect(m.graph.edge(c.edge).state.status).toBe('CLOSED');
    expect(m.network.replans).toBeGreaterThan(0);
    for (let s = 0; s < 60; s++) { m.run(1); for (const a of m.agents) expect(a.wpEdge.slice(a.wpIndex)).not.toContain(c.edge); }
    const d = m.graph.distancesFrom(SHAFT.id);
    for (const f of FACE_NODES) expect(Number.isFinite(d[f])).toBe(true);
  });

  it('hidden roof cracks are found by LiDAR and closed', () => {
    const m = new MiningMission({ seed: 0, crackEdges: [0] });
    m.run(90);
    expect(m.graph.edge(0).state.status).toBe('CLOSED');
    expect(m.events.some(e => e.text.includes('трещину свода'))).toBe(true);
  });
});
