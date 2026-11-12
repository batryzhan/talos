import { describe, expect, it } from 'vitest';
import { FireTerrain } from '../src/core/fire/FireTerrain';
import { CellState, FireGrid } from '../src/core/fire/FireGrid';
import { TANK_L, WildfireMission } from '../src/missions/WildfireMission';

const burning = (g: FireGrid): number => g.burningCount;

describe('fire cellular automaton', () => {
  const terrain = new FireTerrain(0);
  const site = { x: 4, y: 20 };

  it('spreads further downwind than upwind', () => {
    const g = new FireGrid(terrain, 1);
    g.setWind(10, 0); // towards +x
    g.ignite(site.x, site.y, 0.8, 1);
    for (let k = 0; k < 160; k++) g.update(0.25);
    let down = 0, up = 0;
    for (let k = 0; k < g.state.length; k++) if (g.state[k] !== CellState.UNBURNT && g.state[k] !== CellState.WATER && g.state[k] !== CellState.FIREBREAK) (g.cx(k) > site.x ? down++ : up++);
    expect(down).toBeGreaterThan(up * 1.5);
  });

  it('a mineral firebreak stops the front', () => {
    const g = new FireGrid(terrain, 2);
    g.setWind(8, 0);
    for (let y = site.y - 30; y <= site.y + 30; y += 1) for (const dx of [8, 9, 10, 11]) g.clear(site.x + dx, y);
    g.ignite(site.x, site.y, 0.8, 1);
    for (let k = 0; k < 400; k++) g.update(0.25);
    for (let k = 0; k < g.state.length; k++) if (g.state[k] === CellState.BURNT || g.state[k] === CellState.BURNING) expect(Math.abs(g.cy(k) - site.y) > 28 || g.cx(k) < site.x + 8).toBe(true);
  });

  it('water lowers the intensity until the flame is extinguished', () => {
    const g = new FireGrid(terrain, 3);
    g.setWind(0);
    g.ignite(site.x, site.y, 0.9, 0);
    const k = g.index(site.x, site.y);
    for (let i = 0; i < 40 && g.state[k] === CellState.BURNING; i++) { g.douse(k, 1.1); g.update(0.25); }
    expect(g.state[k]).toBe(CellState.EXTINGUISHED);
    expect(burning(g)).toBe(0);
  });
});

describe('/rescue — wildfire swarm suppression', () => {
  it('fields 24 robots: 12 water cannons, 4 blades, 6 thermal relays, 2 tankers', () => {
    const m = new WildfireMission();
    const n = (cap: string): number => m.agents.filter(a => a.module.capability === cap).length;
    expect([m.agents.length, n('WATER_CANNON'), n('TRENCH_BLADE'), n('THERMAL_RELAY'), n('TANKER_REFILL')]).toEqual([24, 12, 4, 6, 2]);
  });

  it('suppresses the fire: water is spent, tanks are refilled, relays and firebreaks deploy, area is contained', () => {
    const m = new WildfireMission({ seed: 0 });
    let minWater = Infinity, sectorsAgreed = false;
    for (let s = 0; s < 200; s++) {
      m.run(1);
      const k = m.snapshot().kpi as { waterFleet: number };
      minWater = Math.min(minWater, k.waterFleet);
      if (m.attacks.some(a => a.members.length > 1 && a.converged && a.spread <= 0.01)) sectorsAgreed = true;
    }
    const k = m.snapshot();
    if (k.kind !== 'wildfire') throw new Error('kind');
    expect(minWater).toBeLessThan(12 * TANK_L);
    expect(k.kpi.refills).toBeGreaterThan(0);
    expect(k.kpi.relaysActive + m.events.filter(e => e.text.includes('мачту-ретранслятор')).length).toBeGreaterThan(0);
    expect(k.kpi.firebreakCells).toBeGreaterThan(0);
    expect(k.kpi.contained).toBeGreaterThan(0.9);
    expect(sectorsAgreed).toBe(true);
  });

  it('a hidden smoulder is found by the thermal scouts', () => {
    const m = new WildfireMission({ seed: 0 });
    m.run(1);
    const p = m.igniteRandom()!;
    expect(m.grid.detected[m.grid.index(p.x, p.y)]).toBe(0);
    m.run(150);
    expect(m.events.some(e => /тепловизор обнаружил|замечен с базы/.test(e.text))).toBe(true);
  });

  it('the wind slider changes the automaton wind', () => {
    const m = new WildfireMission();
    m.wind = 11;
    expect(m.grid.windSpeed).toBe(11);
  });
});

describe('/rescue — response dynamics (no long idle waits)', () => {
  it.each([[0], [1], [2]])('seed %i: both initial fronts get water within 30 s, ≥ 70 % contained by 60 s, all out by 150 s', seed => {
    const m = new WildfireMission({ seed });
    const firstWater = new Map<number, number>();
    let contained60 = 0, out = -1;
    for (let s = 0; s < 150; s++) {
      m.run(1);
      for (const at of m.attacks) for (const id of at.members) if (m.agent(id)!.working && !firstWater.has(at.clusterId)) firstWater.set(at.clusterId, m.time);
      if (s === 59) { const k = m.snapshot().kpi as { contained: number }; contained60 = k.contained; }
      if (out < 0 && m.grid.burningCount === 0) out = m.time;
    }
    expect(firstWater.get(1)).toBeLessThan(30);
    expect(firstWater.get(2)).toBeLessThan(30);
    expect(contained60).toBeGreaterThanOrEqual(0.7);
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThanOrEqual(150);
  });

});
