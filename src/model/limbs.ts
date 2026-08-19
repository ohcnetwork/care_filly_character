/**
 * Ear tiles, side tiles, arms and feet: layout constants, builders and the
 * per-frame pose appliers for the articulated ones (ears, arms).
 */
import * as THREE from "three";
import { EAR_TILE, getEarTileGeometry, getSideTileGeometry, getUnitSphereGeometry } from "./geometry";
import type { FillyMaterials } from "./materials";

// ── layout constants (body units) ────────────────────────────────────────────

/**
 * Ear layout (measured from the sheet). The ear is a wide upright slab whose
 * bottom edge sits on the sphere at `base` (y ≈ +0.34, flush against the plus
 * stem) and whose orientation follows the surface normal at the slab's centre
 * (`orient`, y ≈ +0.62) blended toward +z by `face`. `bury` sinks the slab
 * into the sphere so only the front ~0.1 protrudes.
 */
export const EAR_ANCHOR = {
  x: 0.405,
  base: { y: 0.34 },
  orient: { y: 0.62 },
  /** Mostly toward +z: the slabs stand upright in front of the dome (sheet). */
  face: 0.6,
  splay: 0.0,
  bury: 0.11,
} as const;
/** Side tiles: big rounded squares centred at (±0.74, +0.08), abutting the bar ends. */
export const SIDE_ANCHOR = { x: 0.75, y: 0.14, z: 0.65, depthOffset: -0.05, face: 0.8 } as const;
/** Arms hang low on the sides (hand centre ≈ (±0.88, −0.47)). */
export const SHOULDER = { x: 0.8, y: -0.24, z: 0.25 } as const;
export const HAND_REST = { x: 0.08, y: -0.17, z: 0.02 } as const;
/** Hand-to-chin world position for the viewer's-left arm (THINKING): just left of the mouth. */
export const HAND_CHIN = { x: -0.42, y: -0.38, z: 0.88 } as const;
export const HAND_SCALE = { x: 0.18, y: 0.215, z: 0.17 } as const;
export const FOOT = { x: 0.41, y: -0.84, z: 0.5, sx: 0.19, sy: 0.16, sz: 0.22 } as const;
/**
 * Ear perk: + tips the tile upright/forward (about local x) with a little
 * outward swing (about local z); − lies it back (droop) with a touch of
 * inward swing so the two ears never collide.
 */
export const EAR_TILT_X = 0.85;
export const EAR_SWING_OUT = 0.15;
export const EAR_SWING_IN = 0.25;

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

/** z on the unit sphere for a given (x, y) — 0 when outside the silhouette. */
function sphereZ(x: number, y: number): number {
  return Math.sqrt(Math.max(0, 1 - x * x - y * y));
}

export function buildEar(side: -1 | 1, materials: FillyMaterials): EarRig {
  const group = new THREE.Group();
  group.name = side < 0 ? "earL" : "earR";
  const x = side * EAR_ANCHOR.x;
  // Orientation from the surface normal at the slab's centre (leans back with
  // the sphere), position at the slab's bottom edge (the pivot for perk/droop).
  placeSurfaceFrame(group, x, EAR_ANCHOR.orient.y, sphereZ(x, EAR_ANCHOR.orient.y), 1, EAR_ANCHOR.face);
  group.position.set(x, EAR_ANCHOR.base.y, sphereZ(x, EAR_ANCHOR.base.y));
  // Optional "V" splay, baked into the rest orientation.
  if (EAR_ANCHOR.splay !== 0) {
    _qz.setFromAxisAngle(Z_AXIS, -side * EAR_ANCHOR.splay);
    group.quaternion.multiply(_qz);
  }
  const base = group.quaternion.clone();

  const tile = new THREE.Mesh(getEarTileGeometry(), materials.tile);
  tile.name = "earTile";
  // Pivot at the bottom edge; the slab's back is buried in the sphere.
  tile.position.set(0, EAR_TILE.h / 2 - 0.03, -EAR_ANCHOR.bury);
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
  placeSurfaceFrame(
    tile,
    side * SIDE_ANCHOR.x,
    SIDE_ANCHOR.y,
    SIDE_ANCHOR.z,
    1 + SIDE_ANCHOR.depthOffset,
    SIDE_ANCHOR.face,
  );
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
  return foot;
}
