import * as THREE from "three";
import { afterAll, describe, expect, it } from "vitest";
import { STATE_TARGETS } from "../animation/states";
import { FillyAnimator } from "../animation/FillyAnimator";
import { applyArmPose, buildArm } from "./limbs";
import { buildFillyMaterials } from "./materials";

const materials = buildFillyMaterials();

afterAll(() => {
  for (const material of Object.values(materials)) material.dispose();
});

describe("reference arm poses", () => {
  it("lifts a listening hand beside the shell while keeping the pear upright", () => {
    const arm = buildArm(1, materials);
    const rest = arm.hand.getWorldPosition(new THREE.Vector3());
    applyArmPose(arm, STATE_TARGETS.listening.armR, 0);
    const raised = arm.hand.getWorldPosition(new THREE.Vector3());
    const upright = new THREE.Vector3(0, 1, 0).applyQuaternion(
      arm.hand.getWorldQuaternion(new THREE.Quaternion()),
    );

    expect(raised.y - rest.y).toBeGreaterThan(0.3);
    expect(raised.x).toBeGreaterThan(0.85);
    expect(raised.x).toBeLessThan(1.05);
    expect(upright.y).toBeGreaterThan(0.85);
    expect(upright.x).toBeGreaterThan(0);
  });

  it("places the thinking hand under the mouth and restores its rest pose", () => {
    const arm = buildArm(-1, materials);
    const restPosition = arm.hand.getWorldPosition(new THREE.Vector3());
    const restRotation = arm.hand.getWorldQuaternion(new THREE.Quaternion());
    const restScale = arm.hand.scale.clone();

    applyArmPose(arm, STATE_TARGETS.thinking.armL, 1);
    const thinking = arm.hand.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(thinking.x)).toBeLessThan(0.2);
    expect(thinking.y).toBeGreaterThan(-0.45);
    expect(thinking.y).toBeLessThan(-0.25);
    expect(thinking.z).toBeGreaterThan(0.85);

    applyArmPose(arm, STATE_TARGETS.happy.armL, 0);
    applyArmPose(arm, 0, 0);
    expect(arm.hand.getWorldPosition(new THREE.Vector3()).distanceTo(restPosition))
      .toBeLessThan(1e-10);
    expect(arm.hand.getWorldQuaternion(new THREE.Quaternion()).angleTo(restRotation))
      .toBeLessThan(1e-7);
    expect(arm.hand.scale.equals(restScale)).toBe(true);
  });

  it("holds both happy hands above body center throughout the bounce", () => {
    const animator = new FillyAnimator({ initialState: "happy", autoBlink: false });
    const arms = [buildArm(-1, materials), buildArm(1, materials)];
    const position = new THREE.Vector3();
    for (let i = 0; i < 180; i++) {
      const pose = animator.update(1 / 60);
      for (const arm of arms) {
        applyArmPose(arm, arm.side < 0 ? pose.armL : pose.armR, 0);
        arm.hand.getWorldPosition(position);
        expect(position.y).toBeGreaterThan(0.14);
        expect(position.y).toBeLessThan(0.25);
        expect(Math.abs(position.x)).toBeGreaterThan(0.85);
      }
    }
  });

  it("rests the sleepy hand against the cheek and releases back to idle", () => {
    const arm = buildArm(-1, materials);
    const rest = arm.hand.getWorldPosition(new THREE.Vector3());
    applyArmPose(arm, STATE_TARGETS.sleepy.armL, 0, 1);
    const sleepy = arm.hand.getWorldPosition(new THREE.Vector3());
    expect(sleepy.x).toBeCloseTo(-0.45, 6);
    expect(sleepy.y).toBeCloseTo(-0.05, 6);
    expect(sleepy.z).toBeCloseTo(0.82, 6);
    applyArmPose(arm, 0, 0);
    expect(arm.hand.getWorldPosition(new THREE.Vector3()).distanceTo(rest))
      .toBeLessThan(1e-10);
  });
});
