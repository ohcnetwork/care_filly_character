import { describe, expect, it } from "vitest";
import { CARE_MARK, carePlusSdf } from "./careMark";

describe("canonical CARE mark lattice", () => {
  it("keeps the official 5 × 4 module proportions", () => {
    const m = CARE_MARK.module;
    const p = CARE_MARK.plus;

    expect(p.hHalfWidth * 2).toBeCloseTo(m * 3);
    expect(p.vTop - p.vBottom).toBeCloseTo(m * 3);
    expect(p.vHalfWidth * 2).toBeCloseTo(m);
    expect(p.hTop - p.hBottom).toBeCloseTo(m);
    expect(CARE_MARK.bounds.maxX - CARE_MARK.bounds.minX).toBeCloseTo(m * 5);
    expect(CARE_MARK.bounds.maxY - CARE_MARK.bounds.minY).toBeCloseTo(m * 4);
  });

  it("locks the four light pixels to the plus grid", () => {
    const p = CARE_MARK.plus;
    const top = CARE_MARK.topPixel;
    const side = CARE_MARK.sidePixel;

    expect(top.bottom).toBeCloseTo(p.vTop);
    expect(side.innerX).toBeCloseTo(p.hHalfWidth);
    expect(side.bottom).toBeCloseTo(p.hTop);
    expect(side.top).toBeCloseTo(p.vTop);
    expect(top.size).toBeCloseTo(side.size);
  });

  it("preserves the two interlocking cream cells", () => {
    const m = CARE_MARK.module;
    const y = CARE_MARK.centerY + m;

    expect(carePlusSdf(-m, y)).toBeGreaterThan(0);
    expect(carePlusSdf(m, y)).toBeGreaterThan(0);
    expect(carePlusSdf(0, y)).toBeLessThan(0);
    expect(carePlusSdf(m, CARE_MARK.centerY)).toBeLessThan(0);
  });
});
