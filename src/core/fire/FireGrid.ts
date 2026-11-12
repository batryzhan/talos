/**
 * Wildfire cellular automaton (CLAUDE.md §4.2): the map is split into 2 × 2 m cells. A burning cell
 * has flame intensity I ∈ [0, 1], consumes its fuel and ignites neighbours with a probability that
 * grows with I, the neighbour's fuel, the wind component towards it and the uphill slope, and drops
 * with the neighbour's wetness. A mineral firebreak has no fuel and never ignites. Water from the
 * firefighters lowers I and wets the cell until the flame dies (EXTINGUISHED); a cell that runs out
 * of fuel ends BURNT.
 *
 * Deterministic for a seed; typed arrays only, no allocation per update.
 */
import { Rng } from '../../swarm/rng';
import { FIRE_MAP, type FireTerrain } from './FireTerrain';

export const CELL = 2;
export const GRID = FIRE_MAP.size / CELL; // 70

export const CellState = { UNBURNT: 0, BURNING: 1, BURNT: 2, EXTINGUISHED: 3, FIREBREAK: 4, WATER: 5 } as const;
export type CellState = (typeof CellState)[keyof typeof CellState];

const NB_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NB_DY = [0, 0, 1, -1, 1, -1, 1, -1];

export interface FireCluster { id: number; cells: number; x: number; y: number; radius: number; maxI: number; detected: boolean; front: { x: number; y: number } }

export class FireGrid {
  readonly fuel = new Float32Array(GRID * GRID);
  readonly intensity = new Float32Array(GRID * GRID);
  readonly wet = new Float32Array(GRID * GRID);
  readonly state = new Uint8Array(GRID * GRID);
  /** Heat signature detected by a thermal camera (cluster becomes known to the swarm). */
  readonly detected = new Uint8Array(GRID * GRID);
  readonly height = new Float32Array(GRID * GRID);
  /** Water deposited on the cell during the current tick (L), reset by `update`. */
  readonly water = new Float32Array(GRID * GRID);
  /** Burning cell indices (dense list, rebuilt each update). */
  burning = new Int32Array(GRID * GRID);
  burningCount = 0;
  private next = new Int32Array(GRID * GRID);
  /** Version counter: renderers refresh colours when it changes. */
  version = 0;
  windSpeed = 5;
  /** Unit vector the wind blows towards. */
  windX = Math.cos(1.05);
  windY = Math.sin(1.05);
  everBurned = 0;
  private readonly rng: Rng;

  constructor(readonly terrain: FireTerrain, seed = 0) {
    this.rng = new Rng(seed + 4242);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const k = j * GRID + i, { x, y } = this.center(k);
      this.height[k] = terrain.heightAt(x, y);
      if (terrain.isWater(x, y)) { this.state[k] = CellState.WATER; continue; }
      const f = terrain.forestAt(x, y);
      // Forest burns long, meadow grass briefly; rock (steep slopes) barely.
      this.fuel[k] = Math.max(0.12, f) * (terrain.slopeAt(x, y) > 0.9 ? 0.4 : 1);
    }
  }

  index(x: number, y: number): number {
    const i = Math.floor((x + FIRE_MAP.half) / CELL), j = Math.floor((y + FIRE_MAP.half) / CELL);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return -1;
    return j * GRID + i;
  }

  center(k: number): { x: number; y: number } {
    return { x: (k % GRID) * CELL - FIRE_MAP.half + CELL / 2, y: Math.floor(k / GRID) * CELL - FIRE_MAP.half + CELL / 2 };
  }
  cx(k: number): number { return (k % GRID) * CELL - FIRE_MAP.half + CELL / 2; }
  cy(k: number): number { return Math.floor(k / GRID) * CELL - FIRE_MAP.half + CELL / 2; }

  /** Start a fire around (x, y). Hidden smoulders start weak and undetected. */
  ignite(x: number, y: number, intensity = 0.6, radius = 1, detected = true): number {
    let n = 0;
    const c = this.index(x, y);
    if (c < 0) return 0;
    const ci = c % GRID, cj = Math.floor(c / GRID);
    for (let dj = -radius; dj <= radius; dj++) for (let di = -radius; di <= radius; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= GRID || j >= GRID || di * di + dj * dj > radius * radius + 0.5) continue;
      const k = j * GRID + i;
      if (this.state[k] !== CellState.UNBURNT || this.fuel[k] < 0.05) continue;
      this.state[k] = CellState.BURNING;
      this.intensity[k] = intensity;
      this.detected[k] = detected ? 1 : 0;
      this.everBurned++;
      n++;
    }
    this.rebuild();
    return n;
  }

  /** Bulldozed mineral strip: fuel removed, the cell can never ignite. */
  clear(x: number, y: number): boolean {
    const k = this.index(x, y);
    if (k < 0 || this.state[k] === CellState.WATER || this.state[k] === CellState.FIREBREAK) return false;
    if (this.state[k] === CellState.BURNING) return false;
    this.state[k] = CellState.FIREBREAK;
    this.fuel[k] = 0;
    this.version++;
    return true;
  }

  /** Water hitting cell k: lowers intensity, wets the cell. `litres` over this tick. */
  douse(k: number, litres: number): void {
    if (k < 0) return;
    this.water[k] += litres;
  }

  /** Wind blowing towards `angle` (rad) at `speed` m/s. */
  setWind(speed: number, angle?: number): void {
    this.windSpeed = Math.max(0, speed);
    if (angle !== undefined) { this.windX = Math.cos(angle); this.windY = Math.sin(angle); }
  }

  /** One automaton step of `dt` seconds (run at 4 Hz). */
  update(dt: number): void {
    const I = this.intensity, F = this.fuel, W = this.wet, S = this.state, H = this.height;
    // Water: one litre per second on a cell removes ~0.3 of the flame intensity per second.
    for (let n = 0; n < this.burningCount; n++) {
      const k = this.burning[n];
      const q = this.water[k] + 0.35 * this.neighbourWater(k);
      if (q > 0) { I[k] = Math.max(0, I[k] - 0.32 * q * dt); W[k] = Math.min(1, W[k] + 0.25 * q * dt); }
    }
    for (let k = 0; k < this.water.length; k++) if (this.water[k] > 0) {
      if (S[k] === CellState.UNBURNT) W[k] = Math.min(1, W[k] + 0.3 * this.water[k] * dt);
      this.water[k] = 0;
    }
    let count = 0;
    const wind = this.windSpeed;
    for (let n = 0; n < this.burningCount; n++) {
      const k = this.burning[n];
      if (S[k] !== CellState.BURNING) continue;
      // Growth towards the fuel-limited intensity, consumption of fuel.
      const target = Math.min(1, 0.35 + F[k]) * (1 - W[k]);
      I[k] += (target - I[k]) * 0.35 * dt;
      F[k] = Math.max(0, F[k] - (0.018 + 0.03 * I[k]) * dt);
      W[k] = Math.max(0, W[k] - 0.02 * dt);
      if (I[k] < 0.03) { S[k] = W[k] > 0.15 ? CellState.EXTINGUISHED : CellState.BURNT; I[k] = 0; this.version++; continue; }
      if (F[k] <= 0.005) { S[k] = CellState.BURNT; I[k] = 0; this.version++; continue; }
      this.next[count++] = k;
      // Spread to the 8 neighbours.
      const i = k % GRID, j = (k - i) / GRID;
      for (let d = 0; d < 8; d++) {
        const ni = i + NB_DX[d], nj = j + NB_DY[d];
        if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
        const m = nj * GRID + ni;
        if (S[m] !== CellState.UNBURNT || F[m] < 0.05) continue;
        const inv = d < 4 ? 1 : 0.7071;
        const along = (NB_DX[d] * this.windX + NB_DY[d] * this.windY) * inv;
        const windF = Math.exp(0.16 * wind * along);
        const slopeF = Math.exp(0.12 * (H[m] - H[k]) / CELL * (d < 4 ? 1 : 0.7071));
        const p = 0.042 * I[k] * F[m] * windF * slopeF * (1 - W[m]) * (d < 4 ? 1 : 0.6) * dt;
        if (this.rng.random() < p) {
          S[m] = CellState.BURNING;
          I[m] = 0.25 + 0.2 * I[k];
          this.detected[m] = this.detected[k];
          this.everBurned++;
          this.next[count++] = m;
          this.version++;
        }
      }
    }
    // Swap the burning list (new ignitions were appended above).
    const old = this.burning;
    this.burning = this.next;
    this.next = old;
    this.burningCount = count;
    this.version++;
  }

  private neighbourWater(k: number): number {
    const i = k % GRID, j = (k - i) / GRID;
    let q = 0;
    for (let d = 0; d < 4; d++) {
      const ni = i + NB_DX[d], nj = j + NB_DY[d];
      if (ni >= 0 && nj >= 0 && ni < GRID && nj < GRID) q += this.water[nj * GRID + ni];
    }
    return q;
  }

  private rebuild(): void {
    let n = 0;
    for (let k = 0; k < this.state.length; k++) if (this.state[k] === CellState.BURNING) this.burning[n++] = k;
    this.burningCount = n;
    this.version++;
  }

  /** Max intensity within `r` metres of (x, y). */
  maxIntensityNear(x: number, y: number, r: number): number {
    let best = 0;
    for (let n = 0; n < this.burningCount; n++) {
      const k = this.burning[n];
      if (Math.abs(this.cx(k) - x) <= r && Math.abs(this.cy(k) - y) <= r && Math.hypot(this.cx(k) - x, this.cy(k) - y) <= r && this.intensity[k] > best) best = this.intensity[k];
    }
    return best;
  }

  /** Connected components of burning cells (event rate, 1 Hz). */
  clusters(): FireCluster[] {
    const seen = new Uint8Array(GRID * GRID), out: FireCluster[] = [];
    const queue = new Int32Array(GRID * GRID);
    for (let n = 0; n < this.burningCount; n++) {
      const s = this.burning[n];
      if (seen[s]) continue;
      let head = 0, tail = 0;
      queue[tail++] = s; seen[s] = 1;
      let sx = 0, sy = 0, maxI = 0, detected = false, cells = 0;
      const members: number[] = [];
      while (head < tail) {
        const k = queue[head++];
        cells++; members.push(k);
        sx += this.cx(k); sy += this.cy(k);
        if (this.intensity[k] > maxI) maxI = this.intensity[k];
        if (this.detected[k]) detected = true;
        const i = k % GRID, j = (k - i) / GRID;
        // Neighbourhood of 3 cells: spot fires a few metres apart count as one front.
        for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
          const m = nj * GRID + ni;
          if (!seen[m] && this.state[m] === CellState.BURNING) { seen[m] = 1; queue[tail++] = m; }
        }
      }
      const x = sx / cells, y = sy / cells;
      let radius = 0, fx = x, fy = y, best = -Infinity;
      for (const k of members) {
        const dx = this.cx(k) - x, dy = this.cy(k) - y;
        radius = Math.max(radius, Math.hypot(dx, dy));
        // Upwind edge of the fire (where the crews attack from).
        const up = -(dx * this.windX + dy * this.windY);
        if (up > best) { best = up; fx = this.cx(k); fy = this.cy(k); }
      }
      out.push({ id: s, cells, x, y, radius: radius + CELL, maxI, detected, front: { x: fx, y: fy } });
    }
    return out;
  }

  /** Mark every burning cell within `r` of (x, y) as detected; returns how many were new. */
  detect(x: number, y: number, r: number): number {
    let n = 0;
    for (let b = 0; b < this.burningCount; b++) {
      const k = this.burning[b];
      if (this.detected[k]) continue;
      if (Math.hypot(this.cx(k) - x, this.cy(k) - y) <= r) { this.detected[k] = 1; n++; }
    }
    if (n) {
      // Detection spreads through the connected fire.
      for (const c of this.clusters()) if (c.detected) for (let b = 0; b < this.burningCount; b++) {
        const k = this.burning[b];
        if (Math.hypot(this.cx(k) - c.x, this.cy(k) - c.y) <= c.radius + 1) this.detected[k] = 1;
      }
    }
    return n;
  }

  counts(): { burning: number; burnt: number; extinguished: number; firebreak: number } {
    let burnt = 0, extinguished = 0, firebreak = 0;
    for (let k = 0; k < this.state.length; k++) {
      const s = this.state[k];
      if (s === CellState.BURNT) burnt++; else if (s === CellState.EXTINGUISHED) extinguished++; else if (s === CellState.FIREBREAK) firebreak++;
    }
    return { burning: this.burningCount, burnt, extinguished, firebreak };
  }
}
