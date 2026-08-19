import { describe, it, expect } from "vitest";
import { createPose, clampPose, POSE_KEYS, DEFAULT_POSE } from "./types";

describe("pose", () => {
  it("clamps out-of-range values", () => {
    const p = createPose({ bodyY: 99, eyeOpenL: -1 });
    clampPose(p);
    expect(p.bodyY).toBe(1);
    expect(p.eyeOpenL).toBe(0);
  });
  it("default pose has every key", () => {
    expect(POSE_KEYS.length).toBe(Object.keys(DEFAULT_POSE).length);
  });
});
