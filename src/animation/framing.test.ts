import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FillyModel } from "../model/FillyModel";
import { FillyAnimator } from "./FillyAnimator";

describe("animated character framing", () => {
  it("keeps the happy bounce inside the frame and the sleepy pose on the floor", () => {
    const model = new FillyModel();
    const bounds = new THREE.Box3();
    try {
      for (const state of ["happy", "sleepy"] as const) {
        const animator = new FillyAnimator({ initialState: state, autoBlink: false });
        let minY = Infinity;
        let maxY = -Infinity;
        let maxJump = 0;
        for (let i = 0; i < 300; i++) {
          const pose = animator.update(1 / 30);
          model.applyPose(pose, animator.time);
          model.updateMatrixWorld(true);
          // Exact vertices matter: rotating the shell's AABB exaggerates its
          // lower extent and would make a correctly grounded sleepy pose float.
          bounds.setFromObject(model.parts.bodyGroup, true);
          minY = Math.min(minY, bounds.min.y);
          maxY = Math.max(maxY, bounds.max.y);
          maxJump = Math.max(maxJump, pose.bodyY);
        }
        expect(minY).toBeGreaterThanOrEqual(-1.1);
        expect(maxY).toBeLessThanOrEqual(1.27);
        if (state === "happy") expect(maxJump).toBeGreaterThanOrEqual(0.14);
        else expect(minY).toBeLessThan(-0.97);
      }
    } finally {
      model.dispose();
    }
  });
});
