import { describe, expect, it } from "vitest";
import { type FillyPose } from "@/core/types";
import { FillyAnimator } from "./FillyAnimator";
import { BOUNCE_HEIGHT, BOUNCE_PERIOD } from "./modulators";
import { TALK_MIN_OPEN } from "./talking";

const DT = 1 / 60;

/** Advance `seconds` at 60 Hz, returning the last pose. */
function advance(a: FillyAnimator, seconds: number, dt = DT): FillyPose {
  const n = Math.round(seconds / dt);
  let p = a.pose as FillyPose;
  for (let i = 0; i < n; i++) p = a.update(dt);
  return p;
}

describe("FillyAnimator — idle", () => {
  it("breathes around scale 1 and bobs", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 300; i++) {
      const p = a.update(DT);
      minY = Math.min(minY, p.bodyScaleY);
      maxY = Math.max(maxY, p.bodyScaleY);
    }
    expect(maxY - minY).toBeGreaterThan(0.02);
    expect(maxY).toBeLessThan(1.02);
    expect(minY).toBeGreaterThan(0.98);
  });

  it("occasionally glances away and returns", () => {
    const a = new FillyAnimator({ seed: 21, autoBlink: false });
    let moved = false;
    for (let i = 0; i < 60 * 12; i++) {
      const p = a.update(DT);
      if (Math.abs(p.eyeLookX) > 0.1 || Math.abs(p.eyeLookY) > 0.1) moved = true;
    }
    expect(moved).toBe(true);
  });
});

describe("FillyAnimator — listening", () => {
  it("perks ears, leans in, closes the mouth and shows waves", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    a.setState("listening");
    const p = advance(a, 3);
    expect(p.earL).toBeGreaterThan(0.15);
    expect(p.earR).toBeGreaterThan(0.15);
    expect(p.bodyPitch).toBeGreaterThan(0.03);
    expect(p.mouthOpen).toBeLessThan(0.05);
    expect(p.mouthSmile).toBeGreaterThan(0.8);
    expect(p.waves).toBeCloseTo(1, 2);
  });

  it("ear wiggle grows with audio level", () => {
    const amp = (level: number | null): number => {
      const a = new FillyAnimator({ seed: 1, autoBlink: false, initialState: "listening" });
      a.setAudioLevel(level);
      advance(a, 1);
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 60; i++) {
        const p = a.update(DT);
        lo = Math.min(lo, p.earL);
        hi = Math.max(hi, p.earL);
      }
      return hi - lo;
    };
    expect(amp(1)).toBeGreaterThan(amp(0) * 2);
    expect(amp(0)).toBeGreaterThan(0.01);
  });
});

describe("FillyAnimator — talking", () => {
  it("audioLevel 0 → mouthOpen ≈ 0.15, audioLevel 1 → ≈ 1 after settling", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    a.setState("talking");
    a.setAudioLevel(0);
    expect(advance(a, 2).mouthOpen).toBeCloseTo(TALK_MIN_OPEN, 2);
    a.setAudioLevel(1);
    expect(advance(a, 2).mouthOpen).toBeCloseTo(1, 2);
    a.setAudioLevel(0.5);
    expect(advance(a, 2).mouthOpen).toBeCloseTo(TALK_MIN_OPEN + 0.85 * 0.5, 2);
  });

  it("attack is faster than release", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    a.setState("talking");
    a.setAudioLevel(0);
    advance(a, 1);
    a.setAudioLevel(1);
    const afterUp = advance(a, 0.06).mouthOpen;
    advance(a, 1);
    a.setAudioLevel(0);
    const afterDown = advance(a, 0.06).mouthOpen;
    expect(afterUp - TALK_MIN_OPEN).toBeGreaterThan(1 - afterDown);
  });

  it("synthetic speech (no audio) varies over time and stays within 0.1..1", () => {
    const a = new FillyAnimator({ seed: 77, autoBlink: false });
    a.setState("talking");
    advance(a, 0.5);
    const vals: number[] = [];
    for (let i = 0; i < 180; i++) vals.push(a.update(DT).mouthOpen);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    expect(hi - lo).toBeGreaterThan(0.25);
    expect(lo).toBeGreaterThan(0.1);
    expect(hi).toBeLessThanOrEqual(1);
    // and the wide multiplier follows the opening
    expect(a.pose.mouthWide).toBeGreaterThan(1);
  });

  it("mouth relaxes back when leaving talking", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    a.setState("talking");
    a.setAudioLevel(1);
    advance(a, 1);
    a.setState("listening");
    expect(advance(a, 1.5).mouthOpen).toBeLessThan(0.05);
  });
});

describe("FillyAnimator — happy", () => {
  it("bounces: bodyY ≥ 0 with periodic peaks > 0.1, squash at contact", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    a.setState("happy");
    advance(a, 3); // let the enter impulse and cross-fade settle
    const ys: number[] = [];
    let maxScaleX = 0;
    let minScaleX = 9;
    for (let i = 0; i < 120; i++) {
      const p = a.update(DT);
      ys.push(p.bodyY);
      expect(p.bodyY).toBeGreaterThanOrEqual(-1e-6);
      maxScaleX = Math.max(maxScaleX, p.bodyScaleX);
      minScaleX = Math.min(minScaleX, p.bodyScaleX);
    }
    expect(Math.max(...ys)).toBeGreaterThan(0.1);
    expect(Math.min(...ys)).toBeLessThan(0.03);
    expect(maxScaleX).toBeGreaterThan(1.05); // squash at contact
    expect(minScaleX).toBeLessThan(0.98); // stretch in the air
    // peaks roughly BOUNCE_PERIOD apart
    const peaks: number[] = [];
    for (let i = 1; i < ys.length - 1; i++) if (ys[i] > ys[i - 1] && ys[i] >= ys[i + 1] && ys[i] > 0.1) peaks.push(i);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    expect((peaks[1] - peaks[0]) * DT).toBeCloseTo(BOUNCE_PERIOD, 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(BOUNCE_HEIGHT + 0.02);
  });

  it("enter impulse lifts the body immediately", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    advance(a, 1);
    a.setState("happy");
    const p = advance(a, 0.1);
    expect(p.bodyY).toBeGreaterThan(0.03);
  });

  it("has a wide open smile, eyes open, full cheeks", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    a.setState("happy");
    const p = advance(a, 2);
    expect(p.mouthOpen).toBeGreaterThan(0.7);
    expect(p.mouthSmile).toBeCloseTo(1, 1);
    expect(p.eyeOpenL).toBeCloseTo(1, 1);
    expect(p.cheek).toBeCloseTo(1, 1);
  });
});

describe("FillyAnimator — thinking", () => {
  it("looks up-right, frowns, hand to chin, bubbles", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    a.setState("thinking");
    const p = advance(a, 3);
    expect(p.eyeLookX).toBeGreaterThan(0.5);
    expect(p.eyeLookY).toBeGreaterThan(0.4);
    expect(p.mouthSmile).toBeLessThan(-0.4);
    expect(p.browL).toBeLessThan(-0.2);
    expect(p.armLChin).toBeCloseTo(1, 2);
    expect(p.bubbles).toBeCloseTo(1, 2);
    expect(p.bodyRoll).toBeLessThan(0);
  });
});

describe("FillyAnimator — surprised", () => {
  it("jumps and stretches on enter, then settles with wide eyes and round mouth", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    advance(a, 1);
    a.setState("surprised");
    let peakY = 0;
    let peakScaleY = 0;
    for (let i = 0; i < 36; i++) {
      const p = a.update(DT);
      peakY = Math.max(peakY, p.bodyY);
      peakScaleY = Math.max(peakScaleY, p.bodyScaleY);
    }
    expect(peakY).toBeGreaterThan(0.08);
    expect(peakScaleY).toBeGreaterThan(1.05);
    const p = advance(a, 2);
    expect(Math.abs(p.bodyY)).toBeLessThan(0.02);
    expect(p.eyeScale).toBeGreaterThan(1.2);
    expect(p.mouthRound).toBeCloseTo(1, 1);
    expect(p.earL).toBeGreaterThan(0.2);
    expect(p.sparks).toBeCloseTo(1, 1);
  });
});

describe("FillyAnimator — sleepy", () => {
  it("closes eyes with sleepy arcs, shows zzz, droops ears", () => {
    const a = new FillyAnimator({ seed: 1 });
    a.setState("sleepy");
    const p = advance(a, 3);
    expect(p.eyeOpenL).toBeCloseTo(0, 2);
    expect(p.eyeOpenR).toBeCloseTo(0, 2);
    expect(p.eyeArc).toBeCloseTo(-1, 2);
    expect(p.zzz).toBeCloseTo(1, 2);
    expect(p.earL).toBeLessThan(-0.1);
    expect(p.bodyPitch).toBeGreaterThan(0.02);
    expect(p.mouthRound).toBeGreaterThan(0.9);
  });

  it("breathes slowly and deeply", () => {
    const a = new FillyAnimator({ seed: 1, initialState: "sleepy" });
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 60 * 9; i++) {
      const p = a.update(DT);
      lo = Math.min(lo, p.bodyScaleY);
      hi = Math.max(hi, p.bodyScaleY);
    }
    expect(hi - lo).toBeGreaterThan(0.05);
  });

  it("ignores the pointer", () => {
    const a = new FillyAnimator({ seed: 1, initialState: "sleepy" });
    a.setPointer(1, 1);
    const p = advance(a, 3);
    expect(Math.abs(p.eyeLookX)).toBeLessThan(0.01);
    expect(Math.abs(p.bodyYaw)).toBeLessThan(0.01);
  });
});
