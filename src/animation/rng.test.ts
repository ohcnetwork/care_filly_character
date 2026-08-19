import { describe, expect, it } from "vitest";
import { Rng, mulberry32 } from "./rng";

describe("Rng (mulberry32)", () => {
  it("is deterministic for the same seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("differs across seeds and stays in [0, 1)", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      const x = a.next();
      const y = b.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === y) same++;
    }
    expect(same).toBeLessThan(5);
  });

  it("range / symmetric / chance respect their bounds", () => {
    const r = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const v = r.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
      const s = r.symmetric(0.3);
      expect(Math.abs(s)).toBeLessThanOrEqual(0.3);
    }
    expect(r.chance(1)).toBe(true);
    expect(r.chance(0)).toBe(false);
  });

  it("reset restarts the sequence; reset(seed) adopts a new seed", () => {
    const r = new Rng(9);
    const first = [r.next(), r.next(), r.next()];
    r.reset();
    expect([r.next(), r.next(), r.next()]).toEqual(first);
    r.reset(10);
    expect(r.seed).toBe(10);
    const other = [r.next(), r.next(), r.next()];
    expect(other).not.toEqual(first);
    r.reset();
    expect([r.next(), r.next(), r.next()]).toEqual(other);
  });

  it("normalises odd seeds (0, negative, fractional, NaN)", () => {
    expect(new Rng(0).seed).toBe(1);
    expect(new Rng(Number.NaN).seed).toBe(1);
    expect(new Rng(3.7).seed).toBe(3);
    expect(Number.isFinite(new Rng(-5).next())).toBe(true);
  });

  it("mulberry32 helper matches the class", () => {
    const f = mulberry32(123);
    const r = new Rng(123);
    expect(f()).toBe(r.next());
  });
});
