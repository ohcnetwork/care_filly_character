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
 *         ├─ body, ears, side tiles, arms, feet, eyes, mouth
 */
import * as THREE from "three";
import { POSE_BOUNDS, type FillyPose, type PoseKey } from "../core/types";
import { FillyDecorations } from "./decorations";
import {
  applyEyePose,
  buildCheek,
  buildEye,
  ensureEyeTexture,
  MouthDecal,
  type EyeRig,
} from "./face";
import { getBodyGeometry, getPlateSurfaceGeometry } from "./geometry";
import {
  FEET_BOTTOM,
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

/**
 * The body group is lifted so the foot bottoms rest on y = −1 (the ground);
 * the body centre therefore sits at y = BODY_LIFT − 1 in model space.
 */
export const BODY_LIFT = -FEET_BOTTOM;

/** Approximate extents of the rest-posed character, for camera framing. */
export const FILLY_MODEL_BOUNDS = Object.freeze({
  /** Bottom of the contact shadow. */
  minY: -1.02,
  /** Top of the ear tabs. */
  maxY: BODY_LIFT - 1 + 1.18,
  /** Horizontal radius including side tiles and arms (decorations excluded). */
  radius: 1.12,
  /** Vertical centre of the character in model space (for camera targets). */
  centerY: (BODY_LIFT - 1 + 1.18 - 1.02) / 2,
});

export interface FillyModelOptions {
  /** Override any subset of the default materials (caller keeps ownership of overrides). */
  materials?: Partial<FillyMaterials>;
  /** Include the contact shadow plane (default true). */
  shadow?: boolean;
  /** Opt into painted irises on the built-in eye material (default false). */
  irisTexture?: boolean;
}

/** Named parts for external tweaking / debugging. */
export interface FillyParts {
  bodyPivot: THREE.Group;
  bodyGroup: THREE.Group;
  body: THREE.Mesh;
  plateSurface: THREE.Mesh;
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
  /** Legacy blush parts; retained hidden for consumers of the rig API. */
  cheekL: THREE.Mesh;
  cheekR: THREE.Mesh;
  mouth: THREE.Mesh;
  shadow: THREE.Mesh;
  decorations: THREE.Group;
}

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
  private readonly eyeTexture: THREE.CanvasTexture | null;
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
      if (this.materials[key] === defaults[key])
        this.ownsMaterials.add(defaults[key]);
      else defaults[key].dispose();
    }
    const mats = this.materials;

    const bodyPivot = new THREE.Group();
    bodyPivot.name = "bodyPivot";
    bodyPivot.position.y = -1;
    const bodyGroup = new THREE.Group();
    bodyGroup.name = "bodyGroup";
    bodyGroup.position.y = BODY_LIFT;
    bodyPivot.add(bodyGroup);
    this.add(bodyPivot);

    // Body sphere with recessed plate (material per CSG group slot).
    const bodyGeo = getBodyGeometry();
    const body = new THREE.Mesh(
      bodyGeo.geometry,
      bodyGeo.slots.map((slot) =>
        slot === "plate" ? mats.plateShadow : mats[slot],
      ),
    );
    body.name = "body";
    bodyGroup.add(body);
    const plateSurface = new THREE.Mesh(getPlateSurfaceGeometry(), mats.plate);
    plateSurface.name = "plateSurface";
    plateSurface.renderOrder = 1;
    bodyGroup.add(plateSurface);
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

    // Cartoon ink eyes by default. The optional iris only touches materials
    // owned by this model; caller-supplied maps retain their own lifecycle.
    this.eyeTexture = opts.irisTexture === true && this.ownsMaterials.has(mats.eye)
      ? ensureEyeTexture(mats) : null;
    this.eyeL = buildEye(-1, mats);
    this.eyeR = buildEye(1, mats);
    const cheekL = buildCheek(-1, mats);
    const cheekR = buildCheek(1, mats);
    cheekL.visible = cheekR.visible = false;
    this.mouth = new MouthDecal(mats);
    bodyGroup.add(
      this.eyeL.group,
      this.eyeR.group,
      cheekL,
      cheekR,
      this.mouth.mesh,
    );

    // The pads and hands cast a soft seam onto the shell, grounding the
    // separate pieces as a single sculpted toy under the studio key light.
    for (const part of [body, plateSurface, sideL, sideR, footL, footR,
      this.earL.tile, this.earR.tile, this.armL.hand, this.armR.hand]) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
    // The soft ear roots merge into the insert; avoid a dark attachment line.
    this.earL.tile.castShadow = this.earR.tile.castShadow = false;
    this.earL.tile.receiveShadow = this.earR.tile.receiveShadow = false;

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
      plateSurface,
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
    // Decorations are laid out around the body centre.
    this.fx.position.y = bodyY + (BODY_LIFT - 1);

    applyEarPose(this.earL, clampKey("earL", pose.earL));
    applyEarPose(this.earR, clampKey("earR", pose.earR));

    applyArmPose(
      this.armL,
      clampKey("armL", pose.armL),
      clampKey("armLChin", pose.armLChin),
      clampKey("zzz", pose.zzz),
    );
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
      clampKey("eyeWhite", pose.eyeWhite),
      clampKey("browL", pose.browL),
    );
    applyEyePose(
      this.eyeR,
      clampKey("eyeOpenR", pose.eyeOpenR),
      arc,
      lookX,
      lookY,
      eyeScale,
      clampKey("eyeWhite", pose.eyeWhite),
      clampKey("browR", pose.browR),
    );

    // Legacy pose values must not reveal the removed blush in any expression.
    parts.cheekL.visible = parts.cheekR.visible = false;

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
      pose.mouthRound < 0.65 && pose.sparks > 0 && pose.mouthOpen > 0.1,
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
    this.earL.tile.skeleton.dispose();
    this.earR.tile.skeleton.dispose();
    if (this.eyeTexture) {
      // Only detach from materials we own; overrides keep whatever they had.
      if (this.ownsMaterials.has(this.materials.eye))
        this.materials.eye.map = null;
      this.eyeTexture.dispose();
    }
    for (const m of this.ownsMaterials) m.dispose();
    this.ownsMaterials.clear();
    this.removeFromParent();
  }
}
