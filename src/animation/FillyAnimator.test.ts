import { describe, expect, it } from "vitest";
import { FILLY_STATES, POSE_BOUNDS, POSE_KEYS, type FillyPose, type FillyState } from "@/core/types";
import { FillyAnimator } from "./FillyAnimator";
import { STATE_TARGETS } from "./states";
import { TALK_MIN_OPEN } from "./talking";

const DT = 1 / 60;

/** Advance `seconds` at 60 Hz, returning the last pose. */
function advance(a: FillyAnimator, seconds: number, dt = DT): FillyPose {
  const n = Math.round(seconds / dt);
  let p = a.pose as FillyPose;
  for (let i = 0; i < n; i++) p = a.update(dt);
  return p;
}

function expectWithinBounds(p: FillyPose): void {
  for (const k of POSE_KEYS) {
    const v = p[k];
    expect(Number.isFinite(v), `${k} finite`).toBe(true);
    const [lo, hi] = POSE_BOUNDS[k];
    expect(v, `${k} >= ${lo}`).toBeGreaterThanOrEqual(lo);
    expect(v, `${k} <= ${hi}`).toBeLessThanOrEqual(hi);
  }
}

function snapshot(p: Readonly<FillyPose>): number[] {
  return POSE_KEYS.map((k) => p[k]);
}

describe("FillyAnimator — basics", () => {
  it("starts in idle on the DEFAULT pose, time 0", () => {
    const a = new FillyAnimator();
    expect(a.state).toBe("idle");
    expect(a.time).toBe(0);
    expect(snapshot(a.pose)).toEqual(snapshot(STATE_TARGETS.idle));
  });

  it("honours initialState and starts settled on its target", () => {
    const a = new FillyAnimator({ initialState: "sleepy", autoBlink: false, seed: 2 });
    expect(a.state).toBe("sleepy");
    expect(a.pose.eyeOpenL).toBe(0);
    expect(a.pose.zzz).toBe(1);
    const p = a.update(DT);
    expect(p.eyeOpenL).toBeCloseTo(0, 3);
    expect(p.zzz).toBeCloseTo(1, 3);
  });

  it("update() returns the same mutable pose object every call and advances time", () => {
    const a = new FillyAnimator();
    const p1 = a.update(DT);
    const p2 = a.update(DT);
    expect(p1).toBe(p2);
    expect(p1).toBe(a.pose);
    expect(a.time).toBeCloseTo(2 * DT, 9);
  });

  it("clamps dt to [0, 0.1] and ignores NaN", () => {
    const a = new FillyAnimator();
    a.update(5);
    expect(a.time).toBe(0.1);
    a.update(-1);
    a.update(Number.NaN);
    expect(a.time).toBe(0.1);
    expectWithinBounds(a.pose as FillyPose);
  });

  it("setState is idempotent", () => {
    const a = new FillyAnimator({ seed: 4 });
    const b = new FillyAnimator({ seed: 4 });
    a.setState("happy");
    b.setState("happy");
    advance(a, 0.5);
    for (let i = 0; i < 30; i++) {
      b.setState("happy"); // repeated calls must not re-fire impulses or reset phase
      b.update(DT);
    }
    expect(snapshot(a.pose)).toEqual(snapshot(b.pose));
    expect(a.state).toBe("happy");
  });

  it("every state yields finite, bounded values after 3 s (with audio + pointer + hints)", () => {
    for (const state of FILLY_STATES) {
      const a = new FillyAnimator({ seed: 99 });
      a.setState(state);
      a.setAudioLevel(0.7);
      a.setPointer(0.9, -0.8);
      a.setInteractionHint("hover");
      for (let i = 0; i < 180; i++) expectWithinBounds(a.update(DT));
      a.setInteractionHint("pressed");
      a.setPointer(null, null);
      a.setAudioLevel(null);
      for (let i = 0; i < 60; i++) expectWithinBounds(a.update(DT));
    }
  });

  it("stays bounded across every state transition", () => {
    const a = new FillyAnimator({ seed: 5 });
    for (const from of FILLY_STATES) {
      for (const to of FILLY_STATES) {
        a.setState(from);
        advance(a, 0.3);
        a.setState(to);
        for (let i = 0; i < 30; i++) expectWithinBounds(a.update(DT));
      }
    }
  });

  it("reset() restores t=0, initial state and identical replay", () => {
    const a = new FillyAnimator({ seed: 8, initialState: "listening" });
    a.setState("talking");
    a.setPointer(0.5, 0.5);
    const first = snapshot(advance(a, 1));
    a.reset();
    expect(a.time).toBe(0);
    expect(a.state).toBe("listening");
    a.setState("talking");
    a.setPointer(0.5, 0.5);
    expect(snapshot(advance(a, 1))).toEqual(first);
  });

  it("stepTo advances deterministically to the requested time", () => {
    const a = new FillyAnimator({ seed: 3 });
    const b = new FillyAnimator({ seed: 3 });
    a.stepTo(2.5);
    expect(a.time).toBeCloseTo(2.5, 6);
    advance(b, 2.5);
    // a took 150 steps of 1/60 like b (plus a negligible remainder step)
    expect(snapshot(a.pose)).toEqual(snapshot(b.pose));
    a.stepTo(2.5); // no-op
    expect(a.time).toBeCloseTo(2.5, 6);
    a.stepTo(1); // never goes backwards
    expect(a.time).toBeCloseTo(2.5, 6);
    a.stepTo(3, 10); // oversized dt is clamped, must terminate
    expect(a.time).toBeCloseTo(3, 6);
  });
});

describe("FillyAnimator — determinism", () => {
  it("same seed + same dt sequence ⇒ identical poses after 200 steps (all states)", () => {
    const script: Array<[number, FillyState]> = [
      [0, "idle"],
      [40, "listening"],
      [70, "talking"],
      [100, "happy"],
      [130, "thinking"],
      [160, "surprised"],
      [185, "sleepy"],
    ];
    const a = new FillyAnimator({ seed: 1234 });
    const b = new FillyAnimator({ seed: 1234 });
    for (let i = 0; i < 200; i++) {
      const s = script.find(([at]) => at === i);
      if (s) {
        a.setState(s[1]);
        b.setState(s[1]);
      }
      if (i === 20) {
        a.blink();
        b.blink();
      }
      const dt = i % 7 === 0 ? 0.03 : DT;
      a.update(dt);
      b.update(dt);
      expect(snapshot(a.pose)).toEqual(snapshot(b.pose));
    }
  });

  it("different seeds diverge (idle glance / blink timing)", () => {
    const a = new FillyAnimator({ seed: 1 });
    const b = new FillyAnimator({ seed: 2 });
    let differs = false;
    for (let i = 0; i < 600 && !differs; i++) {
      a.update(DT);
      b.update(DT);
      differs = snapshot(a.pose).some((v, j) => v !== snapshot(b.pose)[j]);
    }
    expect(differs).toBe(true);
  });
});

describe("FillyAnimator — blink", () => {
  it("blink() closes then reopens within 0.4 s", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    advance(a, 0.5);
    a.blink();
    let min = 1;
    let tMin = 0;
    for (let i = 1; i <= 24; i++) {
      const p = a.update(DT);
      if (p.eyeOpenL < min) {
        min = p.eyeOpenL;
        tMin = i * DT;
      }
    }
    expect(min).toBeLessThan(0.05);
    expect(tMin).toBeLessThan(0.2);
    expect(a.pose.eyeOpenL).toBeGreaterThan(0.95);
    expect(a.pose.eyeOpenR).toBeGreaterThan(0.95);
  });

  it("uses a flat-ish '^ ^' arc while shut in an open-eyed state", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false, initialState: "idle" });
    advance(a, 0.5);
    a.blink();
    let arcAtShut = NaN;
    for (let i = 0; i < 24; i++) {
      const p = a.update(DT);
      if (p.eyeOpenL < 0.01) arcAtShut = p.eyeArc;
    }
    expect(arcAtShut).toBeCloseTo(0.7, 1);
  });

  it("auto-blinks within 8 s in idle", () => {
    const a = new FillyAnimator({ seed: 13 });
    let blinked = false;
    for (let i = 0; i < 60 * 8 && !blinked; i++) blinked = a.update(DT).eyeOpenL < 0.5;
    expect(blinked).toBe(true);
  });

  it("never auto-blinks in sleepy (eyes stay at the sleepy arc) and not when autoBlink=false", () => {
    // autoBlink=false: eyes never dip in idle over 30 s
    const a = new FillyAnimator({ seed: 13, autoBlink: false });
    for (let i = 0; i < 60 * 30; i++) expect(a.update(DT).eyeOpenL).toBeGreaterThan(0.9);
    // sleepy: the blink timer is frozen; after leaving sleepy it resumes normally
    const b = new FillyAnimator({ seed: 13, initialState: "sleepy" });
    for (let i = 0; i < 60 * 30; i++) {
      const p = b.update(DT);
      expect(p.eyeArc).toBeCloseTo(-1, 3);
    }
    b.setState("idle");
    let blinked = false;
    for (let i = 0; i < 60 * 8 && !blinked; i++) blinked = b.update(DT).eyeOpenL < 0.5;
    expect(blinked).toBe(true);
  });
});

describe("FillyAnimator — pointer & hints", () => {
  it("pointer follow moves eyeLook / yaw / pitch and clamps", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false });
    a.setPointer(1, 1);
    const p = advance(a, 2);
    expect(p.eyeLookX).toBeGreaterThan(0.25);
    expect(p.eyeLookY).toBeGreaterThan(0.25);
    expect(p.bodyYaw).toBeGreaterThan(0.08);
    expect(p.bodyPitch).toBeLessThan(-0.05); // looks up when pointer above
    a.setPointer(50, -50); // out of range is clamped
    const q = advance(a, 2);
    expect(q.eyeLookX).toBeLessThanOrEqual(1);
    expect(q.eyeLookY).toBeGreaterThanOrEqual(-1);
    expect(q.eyeLookY).toBeLessThan(-0.25);
    a.setPointer(null, null);
    const r = advance(a, 2);
    expect(Math.abs(r.eyeLookX)).toBeLessThan(0.05);
    expect(Math.abs(r.bodyYaw)).toBeLessThan(0.06);
  });

  it("pointer follow is damped in happy / surprised", () => {
    const follow = (state: FillyState): number => {
      const a = new FillyAnimator({ seed: 1, autoBlink: false, initialState: state });
      a.setPointer(1, 0);
      return advance(a, 2).bodyYaw;
    };
    expect(follow("happy")).toBeLessThan(follow("idle") * 0.6);
    expect(follow("surprised")).toBeLessThan(follow("idle") * 0.6);
    expect(follow("happy")).toBeGreaterThan(0.01);
  });

  it("hover perks ears and boosts cheeks; pressed squashes", () => {
    const base = new FillyAnimator({ seed: 1, autoBlink: false });
    const hover = new FillyAnimator({ seed: 1, autoBlink: false });
    const pressed = new FillyAnimator({ seed: 1, autoBlink: false });
    hover.setInteractionHint("hover");
    pressed.setInteractionHint("pressed");
    advance(base, 2);
    advance(hover, 2);
    advance(pressed, 2);
    expect(hover.pose.earL - base.pose.earL).toBeCloseTo(0.1, 1);
    expect(hover.pose.cheek - base.pose.cheek).toBeCloseTo(0.1, 1);
    expect(pressed.pose.bodyScaleY - base.pose.bodyScaleY).toBeCloseTo(-0.06, 1);
    expect(pressed.pose.bodyScaleX - base.pose.bodyScaleX).toBeCloseTo(0.04, 1);
  });

  it("setAudioLevel sanitises input", () => {
    const a = new FillyAnimator({ seed: 1, autoBlink: false, initialState: "talking" });
    a.setAudioLevel(7);
    expect(advance(a, 1).mouthOpen).toBeCloseTo(1, 2);
    a.setAudioLevel(-3);
    expect(advance(a, 1).mouthOpen).toBeCloseTo(TALK_MIN_OPEN, 2);
    a.setAudioLevel(Number.NaN); // → synthetic
    advance(a, 0.5);
    const vals = new Set<number>();
    for (let i = 0; i < 120; i++) vals.add(Math.round(a.update(DT).mouthOpen * 100));
    expect(vals.size).toBeGreaterThan(3);
  });
});
