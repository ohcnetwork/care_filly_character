/**
 * FillyModel — the plain three.js rig for the CARE mascot. No React, no
 * animation logic: feed it a {@link FillyPose} every frame via applyPose().
 *
 * Hierarchy (body units, sphere radius 1, +z toward viewer, feet on y = −1):
 *
 *   FillyModel (Group)
 *   ├─ shadow            contact shadow plane at y ≈ −1.02
 *   ├─ fx                decorations, follows bodyY only
 *   └─ bodyPivot         y = −1 + bodyY, squash/stretch scale (pivot at the feet)
 *      └─ bodyGroup      y = +1, pitch/yaw/roll about the body centre
 *         ├─ body, ears, side tiles, arms, feet, eyes, cheeks, mouth
 */
import * as THREE from "three";
import { POSE_BOUNDS, type FillyPose, type PoseKey } from "../core/types";
import { FillyDecorations } from "./decorations";
import { applyEyePose, buildCheek, buildEye, MouthDecal, type EyeRig } from "./face";
import { getBodyGeometry } from "./geometry";
import {
  applyArmPose,
  applyEarPose,
  buildArm,
  buildEar,
  buildFoot,
  buildSideTile,
  type ArmRig,
  type EarRig,
} from "./limbs";
import { buildFillyMaterials, type FillyMaterials } from "./materials";
import { ContactShadow } from "./shadow";

/** Approximate extents of the rest-posed character, for camera framing. */
export const FILLY_MODEL_BOUNDS = Object.freeze({
  /** Bottom of the contact shadow. */
  minY: -1.02,
  /** Top of the ear tiles. */
  maxY: 1.2,
  /** Horizontal radius including side tiles and arms (decorations excluded). */
  radius: 1.15,
});

export interface FillyModelOptions {
  /** Override any subset of the default materials (caller keeps ownership of overrides). */
  materials?: Partial<FillyMaterials>;
  /** Include the contact shadow plane (default true). */
  shadow?: boolean;
}

/** Named parts for external tweaking / debugging. */
export interface FillyParts {
  bodyPivot: THREE.Group;
  bodyGroup: THREE.Group;
  body: THREE.Mesh;
  /** Present only when the CSG recess failed (fallback decal). */
  plateDecal?: THREE.Mesh;
  earL: THREE.Group;
  earR: THREE.Group;
  sideL: THREE.Mesh;
  sideR: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  handL: THREE.Mesh;
  handR: THREE.Mesh;
  footL: THREE.Mesh;
  footR: THREE.Mesh;
  eyeL: THREE.Group;
  eyeR: THREE.Group;
  cheekL: THREE.Mesh;
  cheekR: THREE.Mesh;
  mouth: THREE.Mesh;
  shadow: THREE.Mesh;
  decorations: THREE.Group;
}

const CHEEK_MAX_OPACITY = 1;

function clampKey(key: PoseKey, v: number): number {
  const b = POSE_BOUNDS[key];
  return v < b[0] ? b[0] : v > b[1] ? b[1] : v;
}

/** Filly as a three.js Group. Construct once, call applyPose() per frame. */
export class FillyModel extends THREE.Group {
  readonly parts: FillyParts;
  /** Materials in use (defaults merged with any overrides). */
  readonly materials: FillyMaterials;

  private readonly ownsMaterials: Set<THREE.Material>;
  private readonly earL: EarRig;
  private readonly earR: EarRig;
  private readonly armL: ArmRig;
  private readonly armR: ArmRig;
  private readonly eyeL: EyeRig;
  private readonly eyeR: EyeRig;
  private readonly mouth: MouthDecal;
  private readonly shadow: ContactShadow;
  private readonly decorations: FillyDecorations;
  private readonly fx: THREE.Group;
  private disposed = false;

  constructor(opts: FillyModelOptions = {}) {
    super();
    this.name = "FillyModel";

    const defaults = buildFillyMaterials();
    this.materials = { ...defaults, ...opts.materials };
    this.ownsMaterials = new Set<THREE.Material>();
    for (const key of Object.keys(defaults) as Array<keyof FillyMaterials>) {
      // Defaults replaced by overrides are never used: drop them now.
      if (this.materials[key] === defaults[key]) this.ownsMaterials.add(defaults[key]);
      else defaults[key].dispose();
    }
    const mats = this.materials;

    const bodyPivot = new THREE.Group();
    bodyPivot.name = "bodyPivot";
    bodyPivot.position.y = -1;
    const bodyGroup = new THREE.Group();
    bodyGroup.name = "bodyGroup";
    bodyGroup.position.y = 1;
    bodyPivot.add(bodyGroup);
    this.add(bodyPivot);

    // Body sphere with recessed plate (material per CSG group slot).
    const bodyGeo = getBodyGeometry();
    const body = new THREE.Mesh(
      bodyGeo.geometry,
      bodyGeo.slots.map((slot) => mats[slot]),
    );
    body.name = "body";
    bodyGroup.add(body);
    let plateDecal: THREE.Mesh | undefined;
    if (bodyGeo.plateDecal) {
      plateDecal = new THREE.Mesh(bodyGeo.plateDecal, mats.plate);
      plateDecal.name = "plateDecal";
      bodyGroup.add(plateDecal);
    }

    this.earL = buildEar(-1, mats);
    this.earR = buildEar(1, mats);
    const sideL = buildSideTile(-1, mats);
    const sideR = buildSideTile(1, mats);
    this.armL = buildArm(-1, mats);
    this.armR = buildArm(1, mats);
    const footL = buildFoot(-1, mats);
    const footR = buildFoot(1, mats);
    bodyGroup.add(
      this.earL.group,
      this.earR.group,
      sideL,
      sideR,
      this.armL.group,
      this.armR.group,
      footL,
      footR,
    );

    // Face.
    this.eyeL = buildEye(-1, mats);
    this.eyeR = buildEye(1, mats);
    const cheekL = buildCheek(-1, mats);
    const cheekR = buildCheek(1, mats);
    this.mouth = new MouthDecal(mats);
    bodyGroup.add(this.eyeL.group, this.eyeR.group, cheekL, cheekR, this.mouth.mesh);

    // Shadow + decorations live outside the squash pivot.
    this.shadow = new ContactShadow(mats);
    this.shadow.mesh.visible = opts.shadow !== false;
    this.add(this.shadow.mesh);
    this.fx = new THREE.Group();
    this.fx.name = "fx";
    this.decorations = new FillyDecorations(mats);
    this.fx.add(this.decorations.group);
    this.add(this.fx);

    this.parts = {
      bodyPivot,
      bodyGroup,
      body,
      plateDecal,
      earL: this.earL.group,
      earR: this.earR.group,
      sideL,
      sideR,
      armL: this.armL.group,
      armR: this.armR.group,
      handL: this.armL.hand,
      handR: this.armR.hand,
      footL,
      footR,
      eyeL: this.eyeL.group,
      eyeR: this.eyeR.group,
      cheekL,
      cheekR,
      mouth: this.mouth.mesh,
      shadow: this.shadow.mesh,
      decorations: this.decorations.group,
    };
  }

  /**
   * Drive every part from a pose. Values are clamped to POSE_BOUNDS (the
   * input object is not mutated). Allocation-free.
   * @param pose the pose to show
   * @param time seconds, used only by the looping decorations
   */
  applyPose(pose: FillyPose, time = 0): void {
    const { parts } = this;
    const bodyY = clampKey("bodyY", pose.bodyY);
    const sx = clampKey("bodyScaleX", pose.bodyScaleX);
    const sy = clampKey("bodyScaleY", pose.bodyScaleY);

    parts.bodyPivot.position.y = -1 + bodyY;
    parts.bodyPivot.scale.set(sx, sy, sx);
    parts.bodyGroup.rotation.set(
      clampKey("bodyPitch", pose.bodyPitch),
      clampKey("bodyYaw", pose.bodyYaw),
      clampKey("bodyRoll", pose.bodyRoll),
    );
    this.fx.position.y = bodyY;

    applyEarPose(this.earL, clampKey("earL", pose.earL));
    applyEarPose(this.earR, clampKey("earR", pose.earR));

    applyArmPose(this.armL, clampKey("armL", pose.armL), clampKey("armLChin", pose.armLChin));
    applyArmPose(this.armR, clampKey("armR", pose.armR), 0);

    const arc = clampKey("eyeArc", pose.eyeArc);
    const lookX = clampKey("eyeLookX", pose.eyeLookX);
    const lookY = clampKey("eyeLookY", pose.eyeLookY);
    const eyeScale = clampKey("eyeScale", pose.eyeScale);
    applyEyePose(
      this.eyeL,
      clampKey("eyeOpenL", pose.eyeOpenL),
      arc,
      lookX,
      lookY,
      eyeScale,
      clampKey("browL", pose.browL),
    );
    applyEyePose(
      this.eyeR,
      clampKey("eyeOpenR", pose.eyeOpenR),
      arc,
      lookX,
      lookY,
      eyeScale,
      clampKey("browR", pose.browR),
    );

    const cheek = clampKey("cheek", pose.cheek);
    // Blush never fully disappears below the idle level; it reads as solid pink at 1.
    this.materials.cheek.opacity = (0.25 + 0.75 * cheek) * CHEEK_MAX_OPACITY;
    parts.cheekL.visible = parts.cheekR.visible = cheek > 0.01;

    this.mouth.update(
      clampKey("mouthOpen", pose.mouthOpen),
      clampKey("mouthWide", pose.mouthWide),
      clampKey("mouthSmile", pose.mouthSmile),
      clampKey("mouthRound", pose.mouthRound),
    );

    this.decorations.update(
      clampKey("zzz", pose.zzz),
      clampKey("bubbles", pose.bubbles),
      clampKey("waves", pose.waves),
      clampKey("sparks", pose.sparks),
      time,
    );
    this.shadow.update(bodyY, sx);
  }

  /**
   * Release per-instance GPU resources (canvas textures, cloned materials,
   * decoration geometries and the default materials this model built).
   * Shared cached geometries are kept; call disposeFillyGeometryCache() to
   * drop those too. Material overrides passed in are left alone.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mouth.dispose();
    this.shadow.dispose();
    this.decorations.dispose();
    this.eyeL.arcMaterial.dispose();
    this.eyeR.arcMaterial.dispose();
    for (const m of this.ownsMaterials) m.dispose();
    this.ownsMaterials.clear();
    this.removeFromParent();
  }
}
