/**
 * Ear tiles, side tiles, arms and feet: layout constants, builders and the
 * per-frame pose appliers for the articulated ones (ears, arms).
 */
import * as THREE from "three";
import { EAR_TILE, getEarTileGeometry, getSideTileGeometry, getUnitSphereGeometry } from "./geometry";
import type { FillyMaterials } from "./materials";

// ── layout constants (body units; x = body half-width) ──────────────────────
//
// Everything is measured from the hero illustration: a wide oval body
// (BODY_SCALE), blocky tabs/tiles that face the viewer straight on, chunky
// arms and feet.

/**
 * Ear tabs: flat slabs standing straight up from the bar's top edge (hTop),
 * flanking the pale notch. `z` is the slab's centre depth: the front face sits
 * just proud of the plate rim, the back is inside the body at the base.
 */
export const EAR_ANCHOR = { x: 0.37, baseY: 0.56, z: 0.66, face: 1.0, splay: 0.0 } as const;
/** Side tiles: squares butting the bar ends (inner edge = hHalfWidth). */
export const SIDE_ANCHOR = { x: 0.75, y: 0.31, z: 0.58, face: 1.0 } as const;
/** Arms: big ellipsoids on the lower sides, tops tucked into the body, tilted outward. */
export const SHOULDER = { x: 0.78, y: -0.1, z: 0.3 } as const;
export const HAND_REST = { x: 0.12, y: -0.2, z: 0.02 } as const;
/** Resting tilt of the arm (radians, top toward the body). */
export const ARM_TILT = 0.3;
/** Hand-to-chin world position for the viewer's-left arm (THINKING): just left of the mouth. */
export const HAND_CHIN = { x: -0.36, y: -0.1, z: 0.86 } as const;
export const HAND_SCALE = { x: 0.15, y: 0.2, z: 0.14 } as const;
/** Feet: big flat ovals under the front, hanging a little below the body. */
export const FOOT = { x: 0.45, y: -0.74, z: 0.42, sx: 0.16, sy: 0.115, sz: 0.16, tilt: 0.12 } as const;
/** Lowest point of the character (foot bottoms) — the model is lifted so this sits on y = −1. */
export const FEET_BOTTOM = FOOT.y - FOOT.sy;
/**
 * Ear perk: + tips the tab forward (about local x) with a little outward
 * swing (about local z); − lies it back (droop) with a touch of inward swing
 * so the two ears never collide.
 */
export const EAR_TILT_X = 0.3;
export const EAR_SWING_OUT = 0.08;
export const EAR_SWING_IN = 0.12;

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
  // Orientation: straight up, facing the viewer (face = 1 → local +z = world +z).
  placeSurfaceFrame(group, x, EAR_ANCHOR.baseY, EAR_ANCHOR.z, 1, EAR_ANCHOR.face);
  // Pivot at the slab's bottom edge, on the bar's top line.
  group.position.set(x, EAR_ANCHOR.baseY, EAR_ANCHOR.z);
  if (EAR_ANCHOR.splay !== 0) {
    _qz.setFromAxisAngle(Z_AXIS, -side * EAR_ANCHOR.splay);
    group.quaternion.multiply(_qz);
  }
  const base = group.quaternion.clone();

  const tile = new THREE.Mesh(getEarTileGeometry(), materials.tile);
  tile.name = "earTile";
  tile.position.set(0, EAR_TILE.h / 2 - 0.02, 0);
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
  _qz.setFromAxisAngle(Z_AXIS, -ear.side * Math.abs(angle) * (angle > 0 ? EAR_SWING_OUT : EAR_SWING_IN));
  ear.group.quaternion.copy(ear.base).multiply(_qx).multiply(_qz);
}

/** Static side tile at the end of the plus's horizontal arm. */
export function buildSideTile(side: -1 | 1, materials: FillyMaterials): THREE.Mesh {
  const tile = new THREE.Mesh(getSideTileGeometry(), materials.tile);
  tile.name = side < 0 ? "sideL" : "sideR";
  const x = side * SIDE_ANCHOR.x;
  // Faces the viewer straight on; position is the raw anchor point.
  placeSurfaceFrame(tile, x, SIDE_ANCHOR.y, SIDE_ANCHOR.z, 1, SIDE_ANCHOR.face);
  tile.position.set(x, SIDE_ANCHOR.y, SIDE_ANCHOR.z);
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
}

export function buildArm(side: -1 | 1, materials: FillyMaterials): ArmRig {
  const group = new THREE.Group();
  group.name = side < 0 ? "armL" : "armR";
  group.position.set(side * SHOULDER.x, SHOULDER.y, SHOULDER.z);
  const hand = new THREE.Mesh(getUnitSphereGeometry(), materials.limb);
  hand.name = side < 0 ? "handL" : "handR";
  hand.scale.set(HAND_SCALE.x, HAND_SCALE.y, HAND_SCALE.z);
  hand.position.set(side * HAND_REST.x, HAND_REST.y, HAND_REST.z);
  // Top of the arm leans into the body, like the hero's tilted ovals.
  hand.rotation.z = -side * ARM_TILT;
  group.add(hand);
  const rest = hand.position.clone();
  // Chin target mirrored to this side, expressed relative to the shoulder.
  const chin = new THREE.Vector3(
    side * -HAND_CHIN.x - side * SHOULDER.x,
    HAND_CHIN.y - SHOULDER.y,
    HAND_CHIN.z - SHOULDER.z,
  );
  return { group, hand, side, rest, chin };
}

/**
 * Raise the arm (rotation about z, hand swings outward/up) and blend the hand
 * toward the chin. Allocation-free.
 */
export function applyArmPose(arm: ArmRig, raise: number, chinBlend: number): void {
  arm.group.rotation.z = arm.side * raise * (1 - chinBlend);
  arm.hand.position.copy(arm.rest).lerp(arm.chin, chinBlend);
}

/** Flattened foot ellipsoid at the bottom front. */
export function buildFoot(side: -1 | 1, materials: FillyMaterials): THREE.Mesh {
  const foot = new THREE.Mesh(getUnitSphereGeometry(), materials.limb);
  foot.name = side < 0 ? "footL" : "footR";
  foot.scale.set(FOOT.sx, FOOT.sy, FOOT.sz);
  foot.position.set(side * FOOT.x, FOOT.y, FOOT.z);
  foot.rotation.z = -side * FOOT.tilt;
  return foot;
}
