import { describe, expect, it } from "vitest";
import { POSE_KEYS } from "@/core/types";
import { MAX_DT, POSE_SPRING_CONFIG, SPRING_PRESETS, Spring, criticallyDamped, follow } from "./spring";

function run(s: Spring, seconds: number, dt: number): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) s.update(dt);
}

describe("Spring", () => {
  it("converges to its target for every preset", () => {
    for (const cfg of Object.values(SPRING_PRESETS)) {
      const s = new Spring(0, cfg);
      s.target = 1;
      run(s, 3, 1 / 60);
      expect(s.value).toBeCloseTo(1, 3);
      expect(Math.abs(s.velocity)).toBeLessThan(1e-3);
      expect(s.settled(1e-2)).toBe(true);
    }
  });

  it("does not overshoot when critically damped (from rest)", () => {
    const k = 200;
    const s = new Spring(0, { stiffness: k, damping: criticallyDamped(k) });
    s.target = 1;
    let max = -Infinity;
    for (let i = 0; i < 600; i++) max = Math.max(max, s.update(1 / 60));
    expect(max).toBeLessThanOrEqual(1 + 1e-6);
    expect(s.value).toBeCloseTo(1, 3);
  });

  it("overshoots when under-damped (sanity check of the integrator)", () => {
    const s = new Spring(0, { stiffness: 260, damping: 6 });
    s.target = 1;
    let max = -Infinity;
    for (let i = 0; i < 600; i++) max = Math.max(max, s.update(1 / 60));
    expect(max).toBeGreaterThan(1.05);
  });

  it("is stable for large dt (clamped to MAX_DT and sub-stepped)", () => {
    const s = new Spring(0, SPRING_PRESETS.fast);
    s.target = 1;
    for (let i = 0; i < 100; i++) {
      const v = s.update(0.5); // clamped to 0.1
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThan(3);
    }
    expect(s.value).toBeCloseTo(1, 3);
  });

  it("same total time gives near-identical result at 60 Hz vs MAX_DT", () => {
    const a = new Spring(0, SPRING_PRESETS.medium);
    const b = new Spring(0, SPRING_PRESETS.medium);
    a.target = b.target = 1;
    run(a, 0.5, 1 / 60);
    run(b, 0.5, MAX_DT);
    expect(Math.abs(a.value - b.value)).toBeLessThan(0.02);
  });

  it("ignores zero / negative / NaN dt", () => {
    const s = new Spring(0.3, SPRING_PRESETS.fast);
    s.target = 1;
    expect(s.update(0)).toBe(0.3);
    expect(s.update(-1)).toBe(0.3);
    expect(s.update(Number.NaN)).toBe(0.3);
  });

  it("snap teleports and kick adds velocity", () => {
    const s = new Spring(0, SPRING_PRESETS.medium);
    s.snap(0.7);
    expect(s.value).toBe(0.7);
    expect(s.target).toBe(0.7);
    s.kick(2);
    s.update(1 / 60);
    expect(s.value).toBeGreaterThan(0.7);
    run(s, 3, 1 / 60);
    expect(s.value).toBeCloseTo(0.7, 3);
  });

  it("has a tuning for every pose key", () => {
    for (const k of POSE_KEYS) {
      expect(POSE_SPRING_CONFIG[k].stiffness).toBeGreaterThan(0);
      expect(POSE_SPRING_CONFIG[k].damping).toBeGreaterThan(0);
    }
  });
});

describe("follow", () => {
  it("attacks faster than it releases", () => {
    const up = follow(0, 1, 0.02, 0.03, 0.12);
    const down = follow(1, 0, 0.02, 0.03, 0.12);
    expect(up).toBeGreaterThan(1 - down);
    expect(follow(0, 1, 1, 0, 0)).toBe(1);
  });
});
