/**
 * Seeded PRNG (analogue of numpy default_rng(seed)): xoshiro128** seeded through splitmix32.
 * Deterministic across platforms — the same seed gives the same experiment for controllers A/B/C.
 * Not bit-compatible with numpy's PCG64; reproducibility is within this code base.
 */
export class Rng {
  private s = new Uint32Array(4);

  constructor(seed: number) {
    let x = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      // splitmix32
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
    if (!(this.s[0] | this.s[1] | this.s[2] | this.s[3])) this.s[0] = 1;
  }

  /** Uniform 32-bit unsigned integer. */
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Uniform in [0, 1). */
  random(): number {
    return this.nextU32() / 4294967296;
  }

  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.random();
  }

  /** True with probability p. */
  bernoulli(p: number): boolean {
    return this.random() < p;
  }

  /** Standard normal (Box–Muller). */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.random();
    const v = this.random();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Independent child stream (for per-subsystem determinism). */
  fork(): Rng {
    return new Rng(this.nextU32());
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
