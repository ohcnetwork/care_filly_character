import * as THREE from "three";
import { afterAll, describe, expect, it } from "vitest";
import { applyEarPose, buildEar, type EarRig } from "./limbs";
import { buildFillyMaterials } from "./materials";
import { getBodyGeometry, getSideTileGeometry } from "./geometry";

const materials = buildFillyMaterials();
const rigs: EarRig[] = [];
function horn(side: -1 | 1): EarRig {
  const rig = buildEar(side, materials);
  rigs.push(rig);
  return rig;
}

afterAll(() => {
  for (const rig of rigs) rig.tile.skeleton.dispose();
  for (const material of Object.values(materials)) material.dispose();
});

it("keeps the shell behind both side ears at their inner edges", () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const shell = new THREE.Mesh(getBodyGeometry().geometry, material);
  const ray = new THREE.Raycaster();
  shell.updateMatrixWorld(true);
  try {
    for (const side of [-1, 1] as const) {
      const ear = new THREE.Mesh(getSideTileGeometry(side), material);
      ear.updateMatrixWorld(true);
      for (const y of [0.17, 0.31, 0.46]) {
        ray.set(new THREE.Vector3(side * 0.56, y, 2), new THREE.Vector3(0, 0, -1));
        const shellHit = ray.intersectObject(shell)[0];
        const earHit = ray.intersectObject(ear)[0];
        expect(shellHit).toBeDefined();
        expect(earHit).toBeDefined();
        expect(earHit.point.z - shellHit.point.z).toBeGreaterThan(0.01);
      }
    }
  } finally {
    material.dispose();
  }
});

describe("horn articulation", () => {
  it("keeps the border fixed while the tip bends in either direction", () => {
    const rig = horn(-1);
    const positions = rig.tile.geometry.getAttribute("position");
    const weights = rig.tile.geometry.getAttribute("skinWeight");
    const before = new THREE.Vector3();
    const after = new THREE.Vector3();
    for (const angle of [-0.6, 0.6]) {
      applyEarPose(rig, angle);
      rig.group.updateMatrixWorld(true);
      let tipMovement = 0;
      let fixedVertices = 0;
      for (let i = 0; i < positions.count; i++) {
        before.fromBufferAttribute(positions, i);
        rig.tile.getVertexPosition(i, after);
        if (weights.getX(i) === 1) {
          expect(after.distanceTo(before)).toBeLessThan(1e-6);
          fixedVertices++;
        }
        if (weights.getY(i) === 1) {
          tipMovement = Math.max(tipMovement, after.distanceTo(before));
        }
      }
      expect(fixedVertices).toBeGreaterThan(0);
      expect(tipMovement).toBeGreaterThan(0.03);
    }
  });

  it("shares geometry without sharing animated skeletons", () => {
    const first = horn(1);
    const second = horn(1);
    expect(first.tile.geometry).toBe(second.tile.geometry);
    expect(first.tile.skeleton).not.toBe(second.tile.skeleton);
    applyEarPose(first, 0.5);
    expect(first.tip.quaternion.angleTo(second.tip.quaternion)).toBeGreaterThan(0.1);
    expect(second.tip.quaternion.equals(second.base)).toBe(true);
  });
});
