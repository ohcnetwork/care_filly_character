/**
 * Cached geometry builders for the Filly rig. Everything here is built once
 * per module and shared by every FillyModel instance (geometries are static;
 * all animation happens through object transforms and materials).
 *
 * Coordinate frame: body sphere centre at origin, radius 1, +z toward the
 * viewer, +y up.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { FillyMaterialKey } from "./materials";
import { buildPlateDecalGeometry } from "./plateFallback";

/** Body sphere radius. */
export const BODY_RADIUS = 1;
/** Radius of the recessed plate floor (sphere centred at the origin). */
export const PLATE_RADIUS = 0.93;

/** Rounded plus ("cross") outline of the face plate, in the XY plane. */
export const PLUS_SHAPE = {
  /** Vertical bar half-width (sheet v2: stem ≈ ±0.2). */
  vHalfWidth: 0.2,
  /** Stem runs down to the lower third… */
  vBottom: -0.62,
  /** …and up between the ear tiles to about their mid-height (dark notch). */
  vTop: 0.82,
  /** Horizontal bar half-width (ends where the side tiles start). */
  hHalfWidth: 0.54,
  /** Bar sits high: eyes in its upper half, mouth near the centre line. */
  hBottom: -0.22,
  hTop: 0.52,
  cornerRadius: 0.06,
} as const;

/** Body sphere tessellation. */
const BODY_SEGMENTS_W = 96;
const BODY_SEGMENTS_H = 64;

/**
 * Build a THREE.Shape for the rounded plus. Corners (convex and concave) are
 * rounded with quadratic curves so the silhouette matches the reference.
 */
export function buildRoundedPlusShape(p = PLUS_SHAPE): THREE.Shape {
  const { vHalfWidth: vw, vBottom: vy0, vTop: vy1, hHalfWidth: hw, hBottom: hy0, hTop: hy1 } = p;
  // 12 polygon vertices, counter-clockwise, starting bottom-right of the vertical bar.
  const pts: Array<[number, number]> = [
    [vw, vy0],
    [vw, hy0],
    [hw, hy0],
    [hw, hy1],
    [vw, hy1],
    [vw, vy1],
    [-vw, vy1],
    [-vw, hy1],
    [-hw, hy1],
    [-hw, hy0],
    [-vw, hy0],
    [-vw, vy0],
  ];
  const shape = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const d1x = cur[0] - prev[0];
    const d1y = cur[1] - prev[1];
    const l1 = Math.hypot(d1x, d1y);
    const d2x = next[0] - cur[0];
    const d2y = next[1] - cur[1];
    const l2 = Math.hypot(d2x, d2y);
    const r = Math.min(p.cornerRadius, l1 / 2, l2 / 2);
    const ax = cur[0] - (d1x / l1) * r;
    const ay = cur[1] - (d1y / l1) * r;
    const bx = cur[0] + (d2x / l2) * r;
    const by = cur[1] + (d2y / l2) * r;
    if (i === 0) shape.moveTo(ax, ay);
    else shape.lineTo(ax, ay);
    shape.quadraticCurveTo(cur[0], cur[1], bx, by);
  }
  shape.closePath();
  return shape;
}

/** Result of {@link getBodyGeometry}. */
export interface BodyGeometry {
  /** Sphere with the plus recess (or a plain sphere when CSG failed). */
  geometry: THREE.BufferGeometry;
  /** Material key for each geometry group index. */
  slots: readonly FillyMaterialKey[];
  /** True when the CSG recess succeeded. */
  csg: boolean;
  /**
   * Only present in fallback mode: a thin plus-shaped decal hugging the
   * sphere so the face plate still reads (no recess).
   */
  plateDecal?: THREE.BufferGeometry;
}

let bodyCache: BodyGeometry | null = null;

/** Silence three-mesh-bvh's deprecation warning emitted during CSG. */
function withQuietBvhWarning<T>(fn: () => T): T {
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("maxLeafSize")) return;
    original.apply(console, args);
  };
  try {
    return fn();
  } finally {
    console.warn = original;
  }
}

function buildBodyCSG(): BodyGeometry {
  // Sentinel materials: three-bvh-csg assigns groups by material identity, so
  // we use two placeholders and remap them to material slots afterwards.
  const bodyMat = new THREE.MeshBasicMaterial({ name: "slot:body" });
  const plateMat = new THREE.MeshBasicMaterial({ name: "slot:plate" });

  const shape = buildRoundedPlusShape();
  const plusGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.8,
    bevelEnabled: false,
    curveSegments: 6,
  });
  plusGeo.translate(0, 0, 0.5); // spans z 0.5 → 1.3
  const plusBrush = new Brush(plusGeo, bodyMat);
  const innerBrush = new Brush(
    new THREE.SphereGeometry(PLATE_RADIUS, BODY_SEGMENTS_W, BODY_SEGMENTS_H),
    plateMat,
  );
  const sphereBrush = new Brush(
    new THREE.SphereGeometry(BODY_RADIUS, BODY_SEGMENTS_W, BODY_SEGMENTS_H),
    bodyMat,
  );
  plusBrush.updateMatrixWorld();
  innerBrush.updateMatrixWorld();
  sphereBrush.updateMatrixWorld();

  const evaluator = new Evaluator();
  evaluator.useGroups = true;
  // pocket = plus − innerSphere: walls keep the body material, floor gets plate.
  const pocket = evaluator.evaluate(plusBrush, innerBrush, SUBTRACTION);
  pocket.updateMatrixWorld();
  // body = sphere − pocket.
  const result = evaluator.evaluate(sphereBrush, pocket, SUBTRACTION);

  const materials = (Array.isArray(result.material) ? result.material : [result.material]) as THREE.Material[];
  const slots = materials.map<FillyMaterialKey>((m) => (m === plateMat ? "plate" : "body"));

  const geometry = result.geometry;
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  if (!geometry.getAttribute("position") || slots.length === 0) {
    throw new Error("CSG produced an empty geometry");
  }

  plusGeo.dispose();
  innerBrush.geometry.dispose();
  sphereBrush.geometry.dispose();
  pocket.geometry.dispose();
  bodyMat.dispose();
  plateMat.dispose();
  return { geometry, slots, csg: true };
}

function buildBodyFallback(): BodyGeometry {
  const geometry = new THREE.SphereGeometry(BODY_RADIUS, BODY_SEGMENTS_W, BODY_SEGMENTS_H);
  return {
    geometry,
    slots: ["body"],
    csg: false,
    plateDecal: buildPlateDecalGeometry(BODY_RADIUS + 0.004),
  };
}

/**
 * Body sphere with the recessed plus face plate, built once with
 * three-bvh-csg and cached module-wide. Falls back to a plain sphere plus a
 * decal if CSG throws, so the character always renders.
 */
export function getBodyGeometry(): BodyGeometry {
  if (bodyCache) return bodyCache;
  try {
    bodyCache = withQuietBvhWarning(buildBodyCSG);
  } catch (err) {
    console.warn("[filly] body CSG failed, using fallback sphere", err);
    bodyCache = buildBodyFallback();
  }
  return bodyCache;
}

// ── small shared primitives ──────────────────────────────────────────────────

const geometryCache = new Map<string, THREE.BufferGeometry>();

function cached<T extends THREE.BufferGeometry>(key: string, build: () => T): T {
  let g = geometryCache.get(key) as T | undefined;
  if (!g) {
    g = build();
    geometryCache.set(key, g);
  }
  return g;
}

/** Rounded box, centred at the origin. */
export function getRoundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments = 5,
): RoundedBoxGeometry {
  return cached(
    `rbox:${width}:${height}:${depth}:${radius}:${segments}`,
    () => new RoundedBoxGeometry(width, height, depth, segments, radius),
  );
}

/**
 * Ear tile dimensions (width, height, depth, corner radius). Wide upright
 * slabs that sit flush against the plus stem (inner edge ≈ ±0.18, outer ≈ ±0.64).
 */
export const EAR_TILE = { w: 0.37, h: 0.54, d: 0.26, r: 0.14 } as const;
/** Side tile dimensions — large rounded squares butting the bar ends. */
export const SIDE_TILE = { w: 0.42, h: 0.52, d: 0.3, r: 0.15 } as const;

export function getEarTileGeometry(): RoundedBoxGeometry {
  return getRoundedBoxGeometry(EAR_TILE.w, EAR_TILE.h, EAR_TILE.d, EAR_TILE.r);
}

export function getSideTileGeometry(): RoundedBoxGeometry {
  return getRoundedBoxGeometry(SIDE_TILE.w, SIDE_TILE.h, SIDE_TILE.d, SIDE_TILE.r);
}

/** Unit sphere shared by all ellipsoid parts (arms, feet, eyes, cheeks…). */
export function getUnitSphereGeometry(): THREE.SphereGeometry {
  return cached("sphere:unit", () => new THREE.SphereGeometry(1, 48, 32));
}

/** Closed-eye arc: tube along a quadratic bezier, apex at y ≈ 0.065. */
export function getEyeArcGeometry(): THREE.TubeGeometry {
  return cached("eyeArc", () => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.12, 0, 0),
      new THREE.Vector3(0, 0.13, 0),
      new THREE.Vector3(0.12, 0, 0),
    );
    return new THREE.TubeGeometry(curve, 24, 0.024, 10, false);
  });
}

/** Eyebrow: a short, thin "︵" arc (apex ≈ 0.025 above its ends). */
export function getBrowGeometry(): THREE.TubeGeometry {
  return cached("brow", () => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.07, 0, 0),
      new THREE.Vector3(0, 0.045, 0),
      new THREE.Vector3(0.07, 0, 0),
    );
    return new THREE.TubeGeometry(curve, 16, 0.011, 8, false);
  });
}

/** Mouth decal plane (world units), aspect matches the 256×208 canvas. */
export const MOUTH_PLANE = { w: 0.4, h: 0.325 } as const;

export function getMouthPlaneGeometry(): THREE.PlaneGeometry {
  return cached("mouthPlane", () => new THREE.PlaneGeometry(MOUTH_PLANE.w, MOUTH_PLANE.h));
}

/** Dispose every cached geometry (body CSG result included). */
export function disposeFillyGeometryCache(): void {
  for (const g of geometryCache.values()) g.dispose();
  geometryCache.clear();
  if (bodyCache) {
    bodyCache.geometry.dispose();
    bodyCache.plateDecal?.dispose();
    bodyCache = null;
  }
}
