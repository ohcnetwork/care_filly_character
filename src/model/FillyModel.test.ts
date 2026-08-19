import * as THREE from "three";
import { afterAll, describe, expect, it } from "vitest";
import { createPose, DEFAULT_POSE, POSE_BOUNDS, POSE_KEYS } from "@/core/types";
import { FillyModel, FILLY_MODEL_BOUNDS } from "./FillyModel";
import { disposeFillyGeometryCache, getBodyGeometry } from "./geometry";

function expectFiniteMatrices(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    for (const e of o.matrixWorld.elements) {
      if (!Number.isFinite(e)) {
        throw new Error(`non-finite matrix on ${o.name || o.type}`);
      }
    }
  });
}

describe("body geometry", () => {
  it("builds the CSG recess with body + plate material slots", () => {
    const body = getBodyGeometry();
    expect(body.csg).toBe(true);
    expect(body.slots).toEqual(["body", "plate"]);
    expect(body.geometry.groups.length).toBe(2);
    const tris = body.geometry.index
      ? body.geometry.index.count / 3
      : body.geometry.getAttribute("position").count / 3;
    expect(tris).toBeGreaterThan(5000);
    expect(tris).toBeLessThan(40000);
    body.geometry.computeBoundingBox();
    // Plate floor is recessed: nothing reaches z = 1 at the front.
    expect(body.geometry.boundingBox!.max.z).toBeLessThan(0.95);
    expect(body.geometry.boundingBox!.min.y).toBeCloseTo(-1, 3);
  });

  it("is cached across calls", () => {
    expect(getBodyGeometry()).toBe(getBodyGeometry());
  });
});

describe("FillyModel", () => {
  afterAll(() => disposeFillyGeometryCache());

  it("constructs headlessly and exposes parts", () => {
    const model = new FillyModel();
    expect(model).toBeInstanceOf(THREE.Group);
    expect(model.parts.body.material).toHaveLength(2);
    expect(model.parts.earL.parent).toBe(model.parts.bodyGroup);
    expect(model.parts.shadow.parent).toBe(model);
    expect(model.parts.bodyPivot.position.y).toBe(-1);
    expect(model.parts.bodyGroup.position.y).toBe(1);
    // No DOM here: the mouth decal hides itself rather than showing a blank plane.
    expect(model.parts.mouth.visible).toBe(false);
    model.dispose();
  });

  it("feet rest at y ≈ −1 and the model fits FILLY_MODEL_BOUNDS", () => {
    const model = new FillyModel();
    model.applyPose(createPose(), 0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    // Exclude decorations and shadow: measure the body group only.
    box.setFromObject(model.parts.bodyGroup);
    expect(box.min.y).toBeGreaterThan(-1.05);
    expect(box.min.y).toBeLessThan(-0.95);
    expect(box.max.y).toBeLessThan(FILLY_MODEL_BOUNDS.maxY + 0.05);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(FILLY_MODEL_BOUNDS.radius + 0.05);
    model.dispose();
  });

  it("applies the default pose and every POSE_BOUNDS extreme without NaNs", () => {
    const model = new FillyModel();
    model.applyPose(DEFAULT_POSE, 0);
    expectFiniteMatrices(model);

    for (const key of POSE_KEYS) {
      for (const v of POSE_BOUNDS[key]) {
        const pose = createPose({ [key]: v });
        model.applyPose(pose, 1.234);
        expectFiniteMatrices(model);
      }
    }
    // Everything at once, both ends.
    const lo = createPose();
    const hi = createPose();
    for (const key of POSE_KEYS) {
      lo[key] = POSE_BOUNDS[key][0];
      hi[key] = POSE_BOUNDS[key][1];
    }
    model.applyPose(lo, 2);
    expectFiniteMatrices(model);
    model.applyPose(hi, 3);
    expectFiniteMatrices(model);
    model.dispose();
  });

  it("drives the body pivot, ears, eyes and decorations from the pose", () => {
    const model = new FillyModel();
    model.applyPose(createPose({ bodyY: 0.5, bodyScaleX: 1.2, bodyScaleY: 0.8 }), 0);
    expect(model.parts.bodyPivot.position.y).toBeCloseTo(-0.5);
    expect(model.parts.bodyPivot.scale.x).toBeCloseTo(1.2);
    expect(model.parts.bodyPivot.scale.z).toBeCloseTo(1.2);
    expect(model.parts.bodyPivot.scale.y).toBeCloseTo(0.8);
    // Shadow shrinks and fades as the body rises.
    expect(model.parts.shadow.scale.y).toBeLessThan(1);
    expect((model.parts.shadow.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(0.35);

    // Closed eyes: lid hidden, arc visible.
    model.applyPose(createPose({ eyeOpenL: 0, eyeOpenR: 1, eyeArc: -1 }), 0);
    const eyeL = model.parts.eyeL;
    const lidL = eyeL.getObjectByName("lid")!;
    const arcL = eyeL.getObjectByName("arc")!;
    expect(lidL.visible).toBe(false);
    expect(arcL.visible).toBe(true);
    expect(arcL.scale.y).toBeCloseTo(-1);
    const arcR = model.parts.eyeR.getObjectByName("arc")!;
    expect(arcR.visible).toBe(false);

    // Gaze only moves the ball, never the highlights.
    model.applyPose(createPose({ eyeLookX: 1, eyeLookY: -1 }), 0);
    const ball = eyeL.getObjectByName("ball")!;
    const hl = eyeL.getObjectByName("highlightBig")!;
    expect(ball.position.x).toBeGreaterThan(0);
    expect(hl.position.x).toBeCloseTo(-0.05);

    // Decorations toggle visibility with their master opacity.
    expect(model.parts.decorations.getObjectByName("zzz")!.visible).toBe(false);
    model.applyPose(createPose({ zzz: 1, waves: 0.5 }), 4);
    expect(model.parts.decorations.getObjectByName("zzz")!.visible).toBe(true);
    expect(model.parts.decorations.getObjectByName("waves")!.visible).toBe(true);
    expect(model.parts.decorations.getObjectByName("bubbles")!.visible).toBe(false);

    // Thinking: left hand moves to the chin (front, lower-left).
    model.applyPose(createPose({ armLChin: 1 }), 0);
    model.updateMatrixWorld(true);
    const handWorld = new THREE.Vector3();
    model.parts.handL.getWorldPosition(handWorld);
    expect(handWorld.x).toBeLessThan(0);
    expect(handWorld.z).toBeGreaterThan(0.8);
    expect(handWorld.y).toBeLessThan(-0.2);
    model.dispose();
  });

  it("does not mutate the input pose", () => {
    const model = new FillyModel();
    const pose = createPose({ bodyY: 99, eyeOpenL: -5 });
    model.applyPose(pose, 0);
    expect(pose.bodyY).toBe(99);
    expect(pose.eyeOpenL).toBe(-5);
    expect(model.parts.bodyPivot.position.y).toBeCloseTo(0); // clamped to bodyY = 1
    model.dispose();
  });

  it("accepts material overrides and leaves them undisposed", () => {
    const custom = new THREE.MeshPhysicalMaterial({ color: "red" });
    const model = new FillyModel({ materials: { body: custom } });
    expect((model.parts.body.material as THREE.Material[])[0]).toBe(custom);
    let disposed = false;
    custom.addEventListener("dispose", () => {
      disposed = true;
    });
    model.dispose();
    expect(disposed).toBe(false);
    // Double dispose is a no-op.
    model.dispose();
  });
});

describe("plate decal fallback", () => {
  it("builds a finite, non-empty geometry hugging the sphere", async () => {
    const { buildPlateDecalGeometry, plusSdf } = await import("./plateFallback");
    const geo = buildPlateDecalGeometry(1.004);
    const pos = geo.getAttribute("position");
    expect(pos.count).toBeGreaterThan(500);
    expect(geo.index!.count / 3).toBeGreaterThan(500);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      expect(r).toBeCloseTo(1.004, 3);
      // Every vertex lies inside (or on) the plus outline.
      expect(plusSdf(pos.getX(i), pos.getY(i))).toBeLessThan(0.01);
    }
    geo.dispose();
  });
});
