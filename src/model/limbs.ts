/**
 * Ear tiles, side tiles, arms and feet: layout constants, builders and the
 * per-frame pose appliers for the articulated ones (ears, arms).
 */
import * as THREE from "three";
import {
  BODY_BOTTOM,
  EAR_TILE,
  bodyZ,
  getEarTileGeometry,
  getFootGeometry,
  getHandGeometry,
  getSideTileGeometry,
} from "./geometry";
import { MASCOT_FACE } from "./mascotShape";
import type { FillyMaterials } from "./materials";

// ── layout constants (body units; x = body half-width) ──────────────────────
//
// Everything is measured from the hero illustration: a wide oval body
// (BODY_SCALE), blocky tabs/tiles that face the viewer straight on, chunky
// arms and feet.

/**
 * Ear tabs: inflated slabs that emerge from the upper shell and lean back
 * with its curvature. The pivot remains at the tile's lower edge so listening
 * and sleepy poses still feel organic.
 */
export const EAR_ANCHOR = {
  x: 0.34,
  baseY: MASCOT_FACE.hTop - 0.03,
  orientY: 0.78,
  face: 1,
  splay: 0.035,
  bury: 0.065,
  depthOffset: 0.035,
} as const;
/** Side tiles: rounded cushions butting the bar ends and following the shell. */
export const SIDE_ANCHOR = {
  x: MASCOT_FACE.hHalfWidth + 0.19,
  y: 0.31,
  // Keep the entire canonical square in front of the curved shell. A smaller
  // lift lets the sphere occlude the inner corners and turns the logo pixels
  // into crescent-shaped cushions in front view.
  depthOffset: 0.16,
  face: 1,
} as const;
/** Arms: plump ellipsoids hung low on the sides, tilted gently outward. */
export const SHOULDER = { x: 0.68, y: -0.12, z: 0.57 } as const;
export const HAND_REST = { x: 0.15, y: -0.26, z: 0.04 } as const;
/** Resting tilt of the arm (radians, top toward the body). */
export const ARM_TILT = 0.18;
/** Hand-to-chin position, in body coordinates, beneath the little smile. */
export const HAND_CHIN = { x: -0.1, y: -0.35, z: 0.91 } as const;
/** Sleepy hand rests against the outer cheek, above the thinking chin pose. */
export const HAND_CHEEK = { x: -0.45, y: -0.05, z: 0.82 } as const;
export const HAND_SCALE = { x: 0.125, y: 0.195, z: 0.14 } as const;
/** Feet: small, diagonally placed ovals tucked into the lower shell. */
export const FOOT = {
  x: 0.43,
  y: -0.75,
  z: 0.42,
  sx: 0.19,
  sy: 0.11,
  sz: 0.225,
  tilt: 0.34,
} as const;
/** Lowest rig point: the shell can sit below the tucked-in feet. */
export const FEET_BOTTOM = Math.min(
  BODY_BOTTOM,
  FOOT.y - Math.hypot(
    FOOT.sx * Math.sin(FOOT.tilt),
    FOOT.sy * Math.cos(FOOT.tilt),
  ),
);
/**
 * Ear perk: + tips the tab forward (about local x) with a little outward
 * swing (about local z); − lies it back (droop) with a touch of inward swing
 * so the two ears never collide.
 */
export const EAR_TILT_X = 0.72;
export const EAR_SWING_OUT = 0.12;
export const EAR_SWING_IN = 0.2;

// ── scratch objects ──────────────────────────────────────────────────────────

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qx = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Position `obj` on the body sphere at direction (x, y, z) scaled to `radius`
 * and orient it so local +z is the outward normal (blended toward world +z by
 * `face`) and local +y runs "up" along the surface.
 */
export function placeSurfaceFrame(
  obj: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  face = 0,
): void {
  _z.set(x, y, z).normalize();
  obj.position.copy(_z).multiplyScalar(radius);
  _z.lerp(Z_AXIS, face).normalize();
  _y.copy(UP).addScaledVector(_z, -UP.dot(_z)).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
}

/** Ear: group pivoting at the tile's bottom edge on the sphere surface. */
export interface EarRig {
  group: THREE.Group;
  tile: THREE.Mesh;
  /** Rest orientation; pose rotations are applied on top. */
  base: THREE.Quaternion;
  side: -1 | 1;
}

export function buildEar(side: -1 | 1, materials: FillyMaterials): EarRig {
  const group = new THREE.Group();
  group.name = side < 0 ? "earL" : "earR";
  const x = side * EAR_ANCHOR.x;
  // Orient from a point around the tile's centre, then move the pivot to its
  // bottom edge. This follows the round shell without making the front face
  // look sharply foreshortened.
  placeSurfaceFrame(
    group,
    x,
    EAR_ANCHOR.orientY,
    bodyZ(x, EAR_ANCHOR.orientY),
    1,
    EAR_ANCHOR.face,
  );
  group.position.set(
    x,
    EAR_ANCHOR.baseY,
    bodyZ(x, EAR_ANCHOR.baseY) + EAR_ANCHOR.depthOffset,
  );
  _qz.setFromAxisAngle(Z_AXIS, -side * EAR_ANCHOR.splay);
  group.quaternion.multiply(_qz);
  const base = group.quaternion.clone();

  group.updateMatrix();
  const restFrame = group.matrix.clone().multiply(
    new THREE.Matrix4().makeTranslation(0, EAR_TILE.h / 2, -EAR_ANCHOR.bury),
  );
  const tile = new THREE.Mesh(getEarTileGeometry(restFrame), materials.tile);
  tile.name = "earTile";
  tile.position.set(0, EAR_TILE.h / 2, -EAR_ANCHOR.bury);
  group.add(tile);
  return { group, tile, base, side };
}

/**
 * Rotate an ear about its base: + perk (tips forward/upright), − droop (lies
 * back). Both lean slightly OUTWARD so the ears never collide and a sleepy
 * droop reads as "softening", not as folding onto the head. Allocation-free.
 */
export function applyEarPose(ear: EarRig, angle: number): void {
  _qx.setFromAxisAngle(X_AXIS, angle * EAR_TILT_X);
  _qz.setFromAxisAngle(
    Z_AXIS,
    -ear.side * Math.abs(angle) * (angle > 0 ? EAR_SWING_OUT : EAR_SWING_IN),
  );
  ear.group.quaternion.copy(ear.base).multiply(_qx).multiply(_qz);
}

/** Static side tile at the end of the plus's horizontal arm. */
export function buildSideTile(
  side: -1 | 1,
  materials: FillyMaterials,
): THREE.Mesh {
  const tile = new THREE.Mesh(getSideTileGeometry(), materials.tile);
  tile.name = side < 0 ? "sideL" : "sideR";
  const x = side * SIDE_ANCHOR.x;
  const z = bodyZ(x, SIDE_ANCHOR.y);
  placeSurfaceFrame(
    tile,
    x,
    SIDE_ANCHOR.y,
    z,
    1 + SIDE_ANCHOR.depthOffset,
    SIDE_ANCHOR.face,
  );
  // `placeSurfaceFrame` normalizes its input for articulated limbs. Restore
  // the exact CARE grid x/y here and use depth only to lift the full square
  // above the shell instead of letting the sphere crop it into a wedge.
  tile.position.set(x, SIDE_ANCHOR.y, z + SIDE_ANCHOR.depthOffset);
  return tile;
}

/** Arm: group at the shoulder, hand ellipsoid hanging below. */
export interface ArmRig {
  group: THREE.Group;
  hand: THREE.Mesh;
  side: -1 | 1;
  /** Hand offset at rest (group-local). */
  rest: THREE.Vector3;
  /** Hand offset at the chin (group-local), used by armLChin. */
  chin: THREE.Vector3;
  /** Hand offset at the cheek (group-local), used by the sleepy blend. */
  cheek: THREE.Vector3;
}

export function buildArm(side: -1 | 1, materials: FillyMaterials): ArmRig {
  const group = new THREE.Group();
  group.name = side < 0 ? "armL" : "armR";
  group.position.set(side * SHOULDER.x, SHOULDER.y, SHOULDER.z);
  const hand = new THREE.Mesh(getHandGeometry(), materials.limb);
  hand.name = side < 0 ? "handL" : "handR";
  hand.scale.set(HAND_SCALE.x, HAND_SCALE.y, HAND_SCALE.z);
  hand.position.set(side * HAND_REST.x, HAND_REST.y, HAND_REST.z);
  // Top of the arm leans into the body, like the hero's tilted ovals.
  hand.rotation.z = side * ARM_TILT;
  group.add(hand);
  const rest = hand.position.clone();
  // Chin target mirrored to this side, expressed relative to the shoulder.
  const chin = new THREE.Vector3(
    side * -HAND_CHIN.x - side * SHOULDER.x,
    HAND_CHIN.y - SHOULDER.y,
    HAND_CHIN.z - SHOULDER.z,
  );
  const cheek = new THREE.Vector3(
    side * -HAND_CHEEK.x - side * SHOULDER.x,
    HAND_CHEEK.y - SHOULDER.y,
    HAND_CHEEK.z - SHOULDER.z,
  );
  return { group, hand, side, rest, chin, cheek };
}

/**
 * Swing the hand outward/up without turning it into a horizontal flipper.
 * The wrist counter-rotates so the soft pear remains upright, then folds
 * diagonally under the chin for thinking or against the cheek for sleep.
 * Above the conversational raise, the shoulder lifts into a happy gesture.
 * Allocation-free.
 */
export function applyArmPose(
  arm: ArmRig,
  raise: number,
  chinBlend: number,
  cheekBlend = 0,
): void {
  const chin = THREE.MathUtils.clamp(chinBlend, 0, 1);
  const cheek = THREE.MathUtils.clamp(cheekBlend, 0, 1);
  const swingWeight = (1 - chin) * (1 - cheek);
  const celebration = THREE.MathUtils.smoothstep(raise, 1.55, 1.9);
  const spread = THREE.MathUtils.clamp(raise - 1.55, 0, 1) * 0.17;
  arm.group.position.x = arm.side * (SHOULDER.x + spread * swingWeight);
  arm.group.position.y = SHOULDER.y + 0.045 * celebration * swingWeight;
  arm.group.rotation.z = arm.side * raise * swingWeight;
  arm.hand.position.copy(arm.rest).lerp(arm.chin, chin).lerp(arm.cheek, cheek);
  const restAngle = arm.side * (ARM_TILT - raise * 0.42);
  const chinAngle = arm.side * 0.8;
  const cheekAngle = arm.side * 1.15;
  arm.hand.rotation.z = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(restAngle, chinAngle, chin), cheekAngle, cheek,
  )
    - arm.group.rotation.z;
  const chinScale = 1 + Math.max(chin, cheek) * 0.04;
  arm.hand.scale.set(
    HAND_SCALE.x * chinScale,
    HAND_SCALE.y * chinScale,
    HAND_SCALE.z * chinScale,
  );
}

/** Flattened foot ellipsoid at the bottom front. */
export function buildFoot(side: -1 | 1, materials: FillyMaterials): THREE.Mesh {
  const foot = new THREE.Mesh(getFootGeometry(), materials.foot);
  foot.name = side < 0 ? "footL" : "footR";
  foot.scale.set(FOOT.sx, FOOT.sy, FOOT.sz);
  foot.position.set(side * FOOT.x, FOOT.y, FOOT.z);
  foot.rotation.z = side * FOOT.tilt;
  return foot;
}
