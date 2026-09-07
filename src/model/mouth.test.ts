import { describe, expect, it } from "vitest";
import {
  computeMouthShape,
  createMouthShape,
  mouthParamsChanged,
  MOUTH_BASE_HALF_WIDTH,
  type MouthShape,
} from "./mouthShape";

function allFinite(s: MouthShape): boolean {
  const pts = [
    s.L,
    s.T,
    s.R,
    s.B,
    s.LtoT,
    s.TfromL,
    s.TtoR,
    s.RfromT,
    s.RtoB,
    s.BfromR,
    s.BtoL,
    s.LfromB,
  ];
  return (
    pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
    Number.isFinite(s.width) &&
    Number.isFinite(s.height) &&
    Number.isFinite(s.tongue.alpha)
  );
}

describe("computeMouthShape", () => {
  it("smile > 0 puts the corners above the top-lip centre", () => {
    const s = computeMouthShape({ open: 0.45, wide: 1, smile: 0.8, round: 0 });
    expect(s.L.y).toBeGreaterThan(s.T.y);
    expect(s.R.y).toBeGreaterThan(s.T.y);
    expect(s.L.y).toBeCloseTo(s.R.y);
  });

  it("smile < 0 (frown) puts the corners below the top-lip centre", () => {
    const s = computeMouthShape({ open: 0, wide: 1, smile: -0.6, round: 0 });
    expect(s.closed).toBe(true);
    expect(s.L.y).toBeLessThan(s.T.y);
    expect(s.R.y).toBeLessThan(s.T.y);
  });

  it("open = 0 is closed with zero interior height and no tongue", () => {
    const s = computeMouthShape({ open: 0, wide: 1, smile: 0.5, round: 0 });
    expect(s.closed).toBe(true);
    expect(s.height).toBe(0);
    expect(s.tongue.alpha).toBe(0);
  });

  it("opening the mouth grows the interior and lowers the bottom lip", () => {
    const a = computeMouthShape({ open: 0.3, wide: 1, smile: 0.8, round: 0 });
    const b = computeMouthShape({ open: 0.9, wide: 1, smile: 0.8, round: 0 });
    expect(b.height).toBeGreaterThan(a.height);
    expect(b.B.y).toBeLessThan(a.B.y);
    expect(b.tongue.alpha).toBeGreaterThan(0.9);
  });

  it("wide scales the width linearly", () => {
    const a = computeMouthShape({ open: 0.4, wide: 1, smile: 0.5, round: 0 });
    const b = computeMouthShape({ open: 0.4, wide: 1.5, smile: 0.5, round: 0 });
    expect(a.width).toBeCloseTo(MOUTH_BASE_HALF_WIDTH * 2);
    expect(b.width / a.width).toBeCloseTo(1.5);
  });

  it("round = 1 gives a near-circular bbox, symmetric about the centre, faint tongue", () => {
    const s = computeMouthShape({ open: 0.6, wide: 1, smile: 0.8, round: 1 });
    expect(s.closed).toBe(false);
    expect(s.width / s.height).toBeGreaterThan(0.85);
    expect(s.width / s.height).toBeLessThan(1.15);
    expect(s.T.y).toBeCloseTo(-s.B.y);
    expect(s.L.y).toBeCloseTo(0);
    // Round "o" keeps a hint of tongue (40 % of the D-shape's), like the sheet's surprised face.
    expect(s.tongue.alpha).toBeGreaterThan(0);
    expect(s.tongue.alpha).toBeLessThan(0.5);
    // Corner handles are vertical (round corners, not pointed).
    expect(Math.abs(s.LtoT.y - s.L.y)).toBeGreaterThan(0.005);
  });

  it("sleepy tiny 'o' is small but still open", () => {
    const s = computeMouthShape({ open: 0.2, wide: 0.5, smile: 0, round: 1 });
    expect(s.closed).toBe(false);
    expect(s.width).toBeLessThan(0.07);
    expect(s.height).toBeLessThan(0.07);
    expect(s.height).toBeGreaterThan(0);
  });

  it("rounds open smile corners without changing their anchors", () => {
    const s = computeMouthShape({ open: 0.5, wide: 1, smile: 0.8, round: 0 });
    expect(s.LtoT.x).toBeCloseTo(s.L.x);
    expect(s.LtoT.y).toBeGreaterThan(s.L.y);
    expect(s.RtoB.x).toBeCloseTo(s.R.x);
    expect(s.RtoB.y).toBeLessThan(s.R.y);
  });

  it("clamps out-of-range params and stays finite", () => {
    const s = computeMouthShape({ open: 5, wide: -3, smile: 9, round: -1 });
    expect(allFinite(s)).toBe(true);
    expect(s.width).toBeCloseTo(MOUTH_BASE_HALF_WIDTH * 0.4 * 2);
  });

  it("fills a provided output object without allocating a new one", () => {
    const out = createMouthShape();
    const result = computeMouthShape(
      { open: 0.4, wide: 1, smile: 0.5, round: 0 },
      out,
    );
    expect(result).toBe(out);
    expect(allFinite(out)).toBe(true);
  });
});

describe("mouthParamsChanged", () => {
  it("ignores sub-epsilon jitter and catches real changes", () => {
    const a = { open: 0.4, wide: 1, smile: 0.5, round: 0 };
    expect(mouthParamsChanged(a, { ...a, open: 0.401 })).toBe(false);
    expect(mouthParamsChanged(a, { ...a, open: 0.42 })).toBe(true);
    expect(mouthParamsChanged(a, { ...a, round: 0.01 })).toBe(true);
    // NaN sentinel (first paint) must count as changed.
    expect(
      mouthParamsChanged(a, { open: NaN, wide: NaN, smile: NaN, round: NaN }),
    ).toBe(true);
  });
});
