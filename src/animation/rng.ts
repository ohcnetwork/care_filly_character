/**
 * Tiny seeded PRNG (mulberry32). Every random decision in the animation layer
 * goes through an instance of this so that the same seed + the same sequence
 * of `update(dt)` calls always yields identical poses.
 */
export class Rng {
  private s: number;
  private seed0: number;

  /** @param seed Any integer; fractional / negative values are normalised. */
  constructor(seed = 1) {
    this.seed0 = Rng.normaliseSeed(seed);
    this.s = this.seed0;
  }

  private static normaliseSeed(seed: number): number {
    if (!Number.isFinite(seed)) return 1;
    return (Math.floor(seed) >>> 0) || 1;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Uniform float in [−amp, amp). */
  symmetric(amp: number): number {
    return (this.next() * 2 - 1) * amp;
  }

  /** True with probability `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Restart the sequence from the original seed, or adopt a new seed. */
  reset(seed?: number): void {
    if (seed !== undefined) this.seed0 = Rng.normaliseSeed(seed);
    this.s = this.seed0;
  }

  /** The (normalised) seed this generator restarts from. */
  get seed(): number {
    return this.seed0;
  }
}

/** Module-level helper: a single uniform float for a given seed (mostly for tests). */
export function mulberry32(seed: number): () => number {
  const r = new Rng(seed);
  return () => r.next();
}
