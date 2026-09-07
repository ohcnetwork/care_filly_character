import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FillyModel } from "../model/FillyModel";
import { CAMERA_FOV, CAMERA_POSITION, CAMERA_TARGET } from "../react/FillyScene";
import { FillyAnimator } from "./FillyAnimator";

describe("animated character framing", () => {
  it("keeps the happy bounce inside the frame and the sleepy pose on the floor", () => {
    const model = new FillyModel();
    const bounds = new THREE.Box3();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
    camera.position.set(...CAMERA_POSITION);
    camera.lookAt(...CAMERA_TARGET);
    camera.updateMatrixWorld(true);
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix, camera.matrixWorldInverse,
    );
    const hornProjection = new THREE.Matrix4();
    const horns: THREE.SkinnedMesh[] = [];
    for (const ear of [model.parts.earL, model.parts.earR]) {
      ear.traverse((part) => {
        if (part instanceof THREE.SkinnedMesh) horns.push(part);
      });
    }
    const projectedVertex = new THREE.Vector3();
    try {
      expect(horns).toHaveLength(2);
      for (const state of ["happy", "sleepy"] as const) {
        const animator = new FillyAnimator({ initialState: state, autoBlink: false });
        let minY = Infinity;
        let maxProjectedHornY = -Infinity;
        let maxJump = 0;
        for (let i = 0; i < 300; i++) {
          const pose = animator.update(1 / 30);
          model.applyPose(pose, animator.time);
          model.updateMatrixWorld(true);
          // Exact vertices matter: rotating the shell's AABB exaggerates its
          // lower extent and would make a correctly grounded sleepy pose float.
          bounds.setFromObject(model.parts.bodyGroup, true);
          minY = Math.min(minY, bounds.min.y);
          maxJump = Math.max(maxJump, pose.bodyY);
          // Use the posed mesh vertices: a rest-pose bounding box misses the
          // tip deformation, and world height alone cannot detect clipping.
          for (const horn of horns) {
            hornProjection.multiplyMatrices(viewProjection, horn.matrixWorld);
            for (let vertex = 0; vertex < horn.geometry.attributes.position.count; vertex++) {
              horn.getVertexPosition(vertex, projectedVertex);
              projectedVertex.applyMatrix4(hornProjection);
              maxProjectedHornY = Math.max(maxProjectedHornY, projectedVertex.y);
            }
          }
        }
        expect(minY).toBeGreaterThanOrEqual(-1.1);
        // NDC +1 is the top edge; retain at least 1% of viewport headroom.
        expect(maxProjectedHornY).toBeLessThanOrEqual(0.98);
        if (state === "happy") expect(maxJump).toBeGreaterThanOrEqual(0.14);
        else expect(minY).toBeLessThan(-0.97);
      }
    } finally {
      model.dispose();
    }
  }, 10_000);
});
