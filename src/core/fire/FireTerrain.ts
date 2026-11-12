/**
 * Procedural mountain-forest heightmap for /rescue (140 × 140 m, 1 m samples, Z-up). One sampled,
 * bilinear field owns rendering, navigation (k_slope), radio line of sight and the fire spread.
 *
 * A river runs west → east across the south; the only ford is near x ≈ 0. The base camp sits on the
 * north bank next to the ford, the forest and the hills rise to the north.
 */
import type { TerrainField, Vec2 } from '../../contracts/types';
import { Rng } from '../../swarm/rng';

export const FIRE_MAP = { half: 70, size: 140, n: 141 } as const;
export const BASE_CAMP: Vec2 = { x: -8, y: -24 };
/** Ford across the river (centre and half-width along x). */
export const FORD = { x: 0, half: 5 } as const;

/** k_slope = clamp(1 − |∇h|·c1, 0.35, 1). */
export const SLOPE_C1 = 0.6;

export class FireTerrain implements TerrainField {
  readonly heights = new Float32Array(FIRE_MAP.n * FIRE_MAP.n);
  readonly forest = new Float32Array(FIRE_MAP.n * FIRE_MAP.n);
  readonly hills: Vec2[] = [];
  private readonly phase: number;

  constructor(readonly seed = 0) {
    const rng = new Rng(seed + 101);
    this.phase = rng.random() * 6;
    const n = FIRE_MAP.n, h = FIRE_MAP.half;
    const peaks = [
      [-34, 22, 14, 260], [22, 34, 16, 300], [44, -8, 11, 220], [-48, -14, 9, 180], [2, 8, 8, 160], [-14, 46, 10, 200], [52, 44, 9, 240],
    ].map(([x, y, a, s]) => [x + rng.uniform(-3, 3), y + rng.uniform(-3, 3), a * rng.uniform(0.85, 1.1), s]);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i - h, y = j - h;
      let z = 1.2 + 0.9 * Math.sin(x * 0.07 + this.phase) * Math.cos(y * 0.06 - this.phase * 0.5) + 0.35 * Math.sin(x * 0.21 + y * 0.17);
      for (const [px, py, a, s] of peaks) z += a * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / s);
      // River valley: carve towards the bed, flatten the ford.
      const d = Math.abs(y - this.riverY(x));
      const valley = Math.exp(-(d * d) / 120);
      z = z * (1 - 0.85 * valley) + (d < 4 ? -0.6 : 0.2) * valley;
      if (Math.abs(x - FORD.x) < FORD.half + 4 && d < 8) z = z * 0.4 + 0.05;
      // Base camp pad.
      const db = Math.hypot(x - BASE_CAMP.x, y - BASE_CAMP.y);
      if (db < 12) z = z * (db / 12) + 0.6 * (1 - db / 12);
      this.heights[j * n + i] = z;
      // Forest density: patchy conifer stands on slopes and valleys north of the river.
      const patch = 0.55 + 0.45 * Math.sin(x * 0.09 + this.phase) * Math.cos(y * 0.11) + 0.25 * Math.sin(x * 0.27 - y * 0.19);
      const north = y > this.riverY(x) + 6 ? 1 : y < this.riverY(x) - 7 ? 0.35 : 0;
      this.forest[j * n + i] = Math.max(0, Math.min(1, patch)) * north * (db < 15 ? 0 : 1);
    }
    // Hilltops (relay candidates): local maxima on a 6 m lattice.
    for (let y = -64; y <= 64; y += 6) for (let x = -64; x <= 64; x += 6) {
      const z = this.heightAt(x, y);
      if (z < 4) continue;
      let top = true;
      for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6], [6, 6], [-6, -6], [6, -6], [-6, 6]]) if (this.heightAt(x + dx, y + dy) > z) top = false;
      if (top) this.hills.push(this.climb(x, y));
    }
  }

  /** River centre line y(x). */
  riverY(x: number): number { return -38 + 5 * Math.sin(x * 0.045 + 0.6); }

  /** Distance north (+) / south (−) of the river centre. */
  riverOffset(x: number, y: number): number { return y - this.riverY(x); }

  isWater(x: number, y: number): boolean { return Math.abs(this.riverOffset(x, y)) < 3.2; }

  isFord(x: number, y: number): boolean { return Math.abs(x - FORD.x) < FORD.half && Math.abs(this.riverOffset(x, y)) < 6; }

  passable(x: number, y: number): boolean {
    return Math.abs(x) < FIRE_MAP.half - 1 && Math.abs(y) < FIRE_MAP.half - 1 && (!this.isWater(x, y) || this.isFord(x, y));
  }

  heightAt(x: number, y: number): number {
    const n = FIRE_MAP.n, h = FIRE_MAP.half;
    const u = Math.max(0, Math.min(n - 1.001, x + h)), v = Math.max(0, Math.min(n - 1.001, y + h));
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * n + i, H = this.heights;
    return (H[k] * (1 - a) + H[k + 1] * a) * (1 - b) + (H[k + n] * (1 - a) + H[k + n + 1] * a) * b;
  }

  gradientAt(x: number, y: number): Vec2 {
    return { x: (this.heightAt(x + 0.5, y) - this.heightAt(x - 0.5, y)), y: (this.heightAt(x, y + 0.5) - this.heightAt(x, y - 0.5)) };
  }

  /** |∇h| without allocation. */
  slopeAt(x: number, y: number): number {
    const gx = this.heightAt(x + 0.5, y) - this.heightAt(x - 0.5, y), gy = this.heightAt(x, y + 0.5) - this.heightAt(x, y - 0.5);
    return Math.hypot(gx, gy);
  }

  /** k_slope = clamp(1 − |∇h|·c1, 0.35, 1); the ford slows robots further (water, gravel). */
  speedAt(x: number, y: number): number {
    const k = Math.min(1, Math.max(0.35, 1 - this.slopeAt(x, y) * SLOPE_C1));
    return this.isFord(x, y) && this.isWater(x, y) ? k * 0.55 : k;
  }

  forestAt(x: number, y: number): number {
    const n = FIRE_MAP.n, h = FIRE_MAP.half;
    const i = Math.round(Math.max(0, Math.min(n - 1, x + h))), j = Math.round(Math.max(0, Math.min(n - 1, y + h)));
    return this.forest[j * n + i];
  }

  private climb(x: number, y: number): Vec2 {
    let bx = x, by = y, bz = this.heightAt(x, y);
    for (let it = 0; it < 12; it++) {
      let moved = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const z = this.heightAt(bx + dx, by + dy); if (z > bz) { bz = z; bx += dx; by += dy; moved = true; } }
      if (!moved) break;
    }
    return { x: bx, y: by };
  }
}
