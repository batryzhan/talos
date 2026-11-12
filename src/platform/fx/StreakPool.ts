/**
 * Ballistic particle pool on one InstancedMesh: sparks, water droplets, rock chips. Every particle is
 * a thin box stretched along its velocity (a motion streak). State lives in typed arrays allocated
 * once; `emit` reuses the oldest slot and `update` writes instance matrices directly into the
 * instance buffer — no allocation per frame.
 */
import * as T from 'three';

export interface StreakPoolOptions {
  capacity: number;
  /** Additive glowing particles (sparks) vs. normal translucent ones (water, chips). */
  additive?: boolean;
  opacity?: number;
  gravity?: number;
  /** Streak length per m/s of speed, and thickness (m). */
  stretch?: number;
  thickness?: number;
  /** Air drag (1/s). */
  drag?: number;
  /** Particles die below this height (floor / terrain). */
  floor?: (x: number, y: number) => number;
  toneMapped?: boolean;
}

export class StreakPool {
  readonly mesh: T.InstancedMesh;
  private readonly cap: number;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly col: Float32Array;
  private next = 0;
  alive = 0;
  private readonly o: Required<Omit<StreakPoolOptions, 'floor'>> & { floor?: StreakPoolOptions['floor'] };

  constructor(o: StreakPoolOptions) {
    this.o = { additive: false, opacity: 1, gravity: 9.81, stretch: 0.025, thickness: 0.012, drag: 0.4, toneMapped: false, ...o };
    this.cap = o.capacity;
    this.p = new Float32Array(this.cap * 3);
    this.v = new Float32Array(this.cap * 3);
    this.life = new Float32Array(this.cap);
    this.maxLife = new Float32Array(this.cap);
    this.size = new Float32Array(this.cap);
    this.col = new Float32Array(this.cap * 3);
    const mat = new T.MeshBasicMaterial({
      transparent: true, opacity: this.o.opacity, depthWrite: false, toneMapped: this.o.toneMapped,
      blending: this.o.additive ? T.AdditiveBlending : T.NormalBlending,
    });
    this.mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, this.cap);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.raycast = () => {};
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
  }

  update(dt: number): void {
    const m = this.mesh.instanceMatrix.array as Float32Array, c = this.mesh.instanceColor!.array as Float32Array;
    const g = this.o.gravity, drag = Math.max(0, 1 - this.o.drag * dt), floor = this.o.floor;
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      let vx = this.v[k] * drag, vy = this.v[k + 1] * drag, vz = this.v[k + 2] * drag - g * dt;
      this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
      const x = (this.p[k] += vx * dt), y = (this.p[k + 1] += vy * dt), z = (this.p[k + 2] += vz * dt);
      if (floor && z < floor(x, y)) this.life[i] = 0;
      if (this.life[i] <= 0) continue;
      // Basis: d along velocity, u ⟂ d, w = d × u.
      const sp = Math.hypot(vx, vy, vz) || 1e-6;
      const dx = vx / sp, dy = vy / sp, dz = vz / sp;
      let ux = -dy, uy = dx, uz = 0;
      let ul = Math.hypot(ux, uy);
      if (ul < 1e-4) { ux = 1; uy = 0; uz = 0; ul = 1; }
      ux /= ul; uy /= ul; uz /= ul;
      const wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux;
      const f = this.life[i] / this.maxLife[i], s = this.size[i];
      const len = Math.max(s, sp * this.o.stretch), th = this.o.thickness * s / 0.02;
      const o = n * 16;
      m[o] = dx * len; m[o + 1] = dy * len; m[o + 2] = dz * len; m[o + 3] = 0;
      m[o + 4] = ux * th; m[o + 5] = uy * th; m[o + 6] = uz * th; m[o + 7] = 0;
      m[o + 8] = wx * th; m[o + 9] = wy * th; m[o + 10] = wz * th; m[o + 11] = 0;
      m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
      const fade = this.o.additive ? f * f : Math.min(1, f * 3);
      c[n * 3] = this.col[k] * fade; c[n * 3 + 1] = this.col[k + 1] * fade; c[n * 3 + 2] = this.col[k + 2] * fade;
      n++;
    }
    this.alive = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as T.Material).dispose();
  }
}
