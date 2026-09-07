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
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type { FillyMaterialKey } from "./materials";
import { buildPlateDecalGeometry } from "./plateFallback";
import { MASCOT_FACE, mascotFaceSdf } from "./mascotShape";

/** Body sphere radius (before {@link BODY_SCALE}). */
export const BODY_RADIUS = 1;
/**
 * The sheet's shell is almost circular, with only a slight front-to-back and
 * vertical squash so it still reads as a soft toy instead of a perfect ball.
 */
export const BODY_SCALE = { x: 1, y: 0.91, z: 0.76 } as const;
/** Lowest point of the body ellipsoid (feet hang slightly below it). */
export const BODY_BOTTOM = -BODY_SCALE.y;
/** Radius of the recessed plate floor (same ellipsoid, scaled down). */
export const PLATE_RADIUS = 0.958;

/** z on the body surface (scaled ellipsoid of radius `r`) at (x, y); 0 outside. */
export function bodyZ(x: number, y: number, r = BODY_RADIUS): number {
  const nx = x / (r * BODY_SCALE.x);
  const ny = y / (r * BODY_SCALE.y);
  return r * BODY_SCALE.z * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
}

/** The soft face insert, including the rolled seam. Shared by every attachment. */
export function plateZ(x: number, y: number): number {
  const inset = Math.max(0, -mascotFaceSdf(x, y));
  return bodyZ(x, y, PLATE_RADIUS + 0.006) + 0.009 * smooth01(0, 0.035, inset);
}

/** The broad CARE-derived character face in the supplied mascot reference. */
export const PLUS_SHAPE = MASCOT_FACE;

/** Body sphere tessellation. */
const BODY_SEGMENTS_W = 96;
const BODY_SEGMENTS_H = 64;

/**
 * Build the reference's rounded face, lower stem and cream crown notch.
 * The four lighter tabs remain separate articulated meshes.
 */
export function buildRoundedPlusShape(p = PLUS_SHAPE): THREE.Shape {
  const {
    vHalfWidth: vw,
    vBottom: vy0,
    hHalfWidth: hw,
    hBottom: hy0,
    hTop: hy1,
    notchHalfWidth: nw,
    notchBottom: ny,
  } = p;
  // Counter-clockwise, starting bottom-right of the stem.
  const pts: Array<[number, number]> = [
    [vw, vy0],
    [vw, hy0],
    [hw, hy0],
    [hw, hy1],
    [nw, hy1],
    [nw, ny],
    [-nw, ny],
    [-nw, hy1],
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
    const r = Math.min(i >= 4 && i <= 7 ? 0.065 : p.cornerRadius, l1 / 2, l2 / 2);
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

// ── baked shading ────────────────────────────────────────────────────────────
//
// The hero illustration is "flat design with soft shading": every shape has a
// gentle top-light → bottom-shade gradient and the recessed plate has a soft
// inner shadow along its top edge. Real-time lights alone can't give flat
// front faces a gradient, so we bake these as vertex colours (materials use
// `vertexColors: true`; the colour multiplies the albedo).

const smooth01 = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Write a vertical brightness gradient into `geometry`'s `color` attribute:
 * `top` at y = yMax, `bottom` at y = yMin (linear in between).
 */
export function bakeVerticalGradient(
  geometry: THREE.BufferGeometry,
  yMin: number,
  yMax: number,
  bottom: number,
  top: number,
): THREE.BufferGeometry {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - yMin) / (yMax - yMin)));
    const f = bottom + (top - bottom) * t;
    colors[i * 3] = f;
    colors[i * 3 + 1] = f;
    colors[i * 3 + 2] = f;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Like {@link bakeVerticalGradient}, but lets stylised shadows shift hue. */
function bakeVerticalColorGradient(
  geometry: THREE.BufferGeometry,
  yMin: number,
  yMax: number,
  bottom: readonly [number, number, number],
  top: readonly [number, number, number],
): THREE.BufferGeometry {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - yMin) / (yMax - yMin)));
    colors[i * 3] = bottom[0] + (top[0] - bottom[0]) * t;
    colors[i * 3 + 1] = bottom[1] + (top[1] - bottom[1]) * t;
    colors[i * 3 + 2] = bottom[2] + (top[2] - bottom[2]) * t;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Body shading: slightly brighter crown, slightly deeper bottom. */
const BODY_SHADE = { bottom: 0.86, top: 1.035 } as const;
/** Plate inner shadow: how much darker the floor gets right under the top edge, and how far it reaches. */
const PLATE_INNER_SHADOW = { depth: 0.2, reach: 0.24 } as const;
/** Tiles / limbs: a clear top-light → bottom-shade gradient like the illustration. */
export const TILE_SHADE = {
  bottom: [0.66, 0.80, 0.67],
  top: [1.04, 1.04, 0.98],
} as const;
export const LIMB_SHADE = {
  bottom: [0.78, 0.83, 0.76],
  top: [1.02, 1.015, 1.02],
} as const;
const FOOT_SHADE = {
  bottom: [0.72, 0.8, 0.7],
  top: [0.94, 0.94, 0.94],
} as const;

/**
 * Bake the body gradient plus the plate's inner shadow. Plate-floor vertices
 * are found through the geometry groups (`slots[materialIndex] === "plate"`).
 */
function bakeBodyShading(
  geometry: THREE.BufferGeometry,
  slots: readonly FillyMaterialKey[],
): void {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const isPlate = new Uint8Array(pos.count);
  const index = geometry.index;
  for (const g of geometry.groups) {
    if (slots[g.materialIndex ?? 0] !== "plate") continue;
    for (let i = g.start; i < g.start + g.count; i++) {
      isPlate[index ? index.getX(i) : i] = 1;
    }
  }
  const yMin = -BODY_SCALE.y;
  const yMax = BODY_SCALE.y;
  const edgeTop = PLUS_SHAPE.vTop;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.min(1, Math.max(0, (y - yMin) / (yMax - yMin)));
    let f = BODY_SHADE.bottom + (BODY_SHADE.top - BODY_SHADE.bottom) * t;
    if (isPlate[i]) {
      // Soft shadow cast by the rim onto the floor, strongest at the top edge.
      f *=
        1 -
        PLATE_INNER_SHADOW.depth *
          smooth01(edgeTop - PLATE_INNER_SHADOW.reach, edgeTop - 0.01, y);
    }
    const mintBounce = isPlate[i] ? 0 : smooth01(-0.45, -BODY_SCALE.y, y);
    colors[i * 3] = f * (1 - 0.48 * mintBounce);
    colors[i * 3 + 1] = f * (1 - 0.09 * mintBounce);
    colors[i * 3 + 2] = f * (1 - 0.44 * mintBounce);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
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
  plusGeo.translate(0, 0, 0.3); // spans z 0.3 → 1.1 (through the oval's front)
  const plusBrush = new Brush(plusGeo, bodyMat);
  const innerGeo = new THREE.SphereGeometry(
    PLATE_RADIUS,
    BODY_SEGMENTS_W,
    BODY_SEGMENTS_H,
  );
  innerGeo.scale(BODY_SCALE.x, BODY_SCALE.y, BODY_SCALE.z);
  const innerBrush = new Brush(innerGeo, plateMat);
  const bodyGeo = new THREE.SphereGeometry(
    BODY_RADIUS,
    BODY_SEGMENTS_W,
    BODY_SEGMENTS_H,
  );
  bodyGeo.scale(BODY_SCALE.x, BODY_SCALE.y, BODY_SCALE.z);
  const sphereBrush = new Brush(bodyGeo, bodyMat);
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

  const materials = (
    Array.isArray(result.material) ? result.material : [result.material]
  ) as THREE.Material[];
  const slots = materials.map<FillyMaterialKey>((m) =>
    m === plateMat ? "plate" : "body",
  );

  const geometry = result.geometry;
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  if (!geometry.getAttribute("position") || slots.length === 0) {
    throw new Error("CSG produced an empty geometry");
  }
  bakeBodyShading(geometry, slots);

  plusGeo.dispose();
  innerBrush.geometry.dispose();
  sphereBrush.geometry.dispose();
  pocket.geometry.dispose();
  bodyMat.dispose();
  plateMat.dispose();
  return { geometry, slots, csg: true };
}

function buildBodyFallback(): BodyGeometry {
  const geometry = new THREE.SphereGeometry(
    BODY_RADIUS,
    BODY_SEGMENTS_W,
    BODY_SEGMENTS_H,
  );
  geometry.scale(BODY_SCALE.x, BODY_SCALE.y, BODY_SCALE.z);
  bakeVerticalGradient(
    geometry,
    -BODY_SCALE.y,
    BODY_SCALE.y,
    BODY_SHADE.bottom,
    BODY_SHADE.top,
  );
  return {
    geometry,
    slots: ["body"],
    csg: false,
    plateDecal: buildPlateDecalGeometry(BODY_RADIUS + 0.004, 0.02, BODY_SCALE),
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

function cached<T extends THREE.BufferGeometry>(
  key: string,
  build: () => T,
): T {
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
 * The reference stretches CARE's upper pixels into gently articulated tabs.
 * All four use the same sculpting method and soft surface treatment.
 */
export const EAR_TILE = {
  w: 0.40,
  h: 0.49,
  d: 0.22,
  // Preserve the pixel footprint while giving it the edge softness of clay.
  r: 0.075,
} as const;
/** Side pixels are geometrically identical to the crown pixels. */
export const SIDE_TILE = { w: 0.40, h: 0.44, d: 0.20, r: 0.065 } as const;

/**
 * Inflate the centre of the pixel's front face. The x/y footprint stays on
 * the CARE grid, while the changing normals give the block a soft cushion
 * highlight even in a front-facing view. Shared by all four logo pieces.
 */
function buildPixelCushion(tile: { w: number; h: number; d: number; r: number }): THREE.BufferGeometry {
  // Subdivide the ENTIRE face before sculpting. A rounded box has just two
  // triangles across each flat face, so inflating its centre still leaves a
  // rigid slab. A welded surface grid gives these cushions their broad dome.
  const grid = new THREE.BoxGeometry(tile.w, tile.h, tile.d, 28, 36, 16);
  const positions = grid.getAttribute("position");
  const half = new THREE.Vector3(tile.w / 2, tile.h / 2, tile.d / 2);
  const core = half.clone().addScalar(-tile.r);
  const minCore = core.clone().negate();
  const point = new THREE.Vector3();
  const clamped = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    clamped.copy(point).clamp(minCore, core);
    normal.copy(point).sub(clamped).normalize();
    point.copy(clamped).addScaledVector(normal, tile.r);
    const dx = Math.max(0, 1 - (point.x / half.x) ** 2);
    const dy = Math.max(0, 1 - (point.y / half.y) ** 2);
    const front = smooth01(0, tile.d * 0.35, point.z);
    point.z += 0.035 * dx * dy * front;
    // Subtle outward bow along the long edges makes the tabs feel stuffed.
    point.x *= 1 + 0.024 * dy;
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  grid.deleteAttribute("normal");
  grid.deleteAttribute("uv");
  const geometry = mergeVertices(grid, 0.00001);
  grid.dispose();
  geometry.computeVertexNormals();
  const uv = new Float32Array(geometry.getAttribute("position").count * 2);
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = pos.getX(i) / tile.w + 0.5;
    uv[2 * i + 1] = pos.getY(i) / tile.h + 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return bakeVerticalColorGradient(
    geometry, -tile.h / 2, tile.h / 2,
    TILE_SHADE.bottom, TILE_SHADE.top,
  );
}

export function getEarTileGeometry(): THREE.BufferGeometry {
  return cached("earCushion", () => buildPixelCushion(EAR_TILE));
}

export function getSideTileGeometry(): THREE.BufferGeometry {
  return cached("sideCushion", () => buildPixelCushion(SIDE_TILE));
}

/**
 * Unit sphere shared by all ellipsoid parts (arms, feet, eyes, cheeks…). It
 * carries the limb gradient as vertex colours; materials that don't enable
 * `vertexColors` (eyes, cheeks, highlights) ignore it.
 */
export function getUnitSphereGeometry(): THREE.SphereGeometry {
  return cached(
    "sphere:unit",
    () =>
      bakeVerticalColorGradient(
        new THREE.SphereGeometry(1, 48, 32),
        -1,
        1,
        LIMB_SHADE.bottom,
        LIMB_SHADE.top,
      ) as THREE.SphereGeometry,
  );
}

/** A little pear-shaped paw: fuller at the palm, softer at the shoulder. */
export function getHandGeometry(): THREE.BufferGeometry {
  return cached("hand:pear", () => {
    const geometry = getUnitSphereGeometry().clone();
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const taper = 1 - 0.22 * positions.getY(i);
      positions.setX(i, positions.getX(i) * taper);
      positions.setZ(i, positions.getZ(i) * taper);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  });
}

/** Feet use a softer, darker gradient than the upright arms. */
export function getFootGeometry(): THREE.SphereGeometry {
  return cached(
    "sphere:foot",
    () =>
      bakeVerticalColorGradient(
        new THREE.SphereGeometry(1, 48, 32),
        -1,
        1,
        FOOT_SHADE.bottom,
        FOOT_SHADE.top,
      ) as THREE.SphereGeometry,
  );
}

/** Closed-eye arc: compact, deep curve matching the illustrated blink. */
export function getEyeArcGeometry(): THREE.TubeGeometry {
  return cached("eyeArc", () => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.118, 0, 0),
      new THREE.Vector3(0, 0.18, 0),
      new THREE.Vector3(0.118, 0, 0),
    );
    return new THREE.TubeGeometry(curve, 24, 0.015, 10, false);
  });
}

/** Eyebrow: a short, thin "︵" arc (apex ≈ 0.025 above its ends). */
export function getBrowGeometry(): THREE.TubeGeometry {
  return cached("brow", () => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.044, 0, 0),
      new THREE.Vector3(0, 0.038, 0),
      new THREE.Vector3(0.044, 0, 0),
    );
    return new THREE.TubeGeometry(curve, 16, 0.009, 8, false);
  });
}

/** Mouth decal plane (world units), aspect matches the 256×208 canvas. */
export const MOUTH_PLANE = { w: 0.4, h: 0.325 } as const;

export function getMouthPlaneGeometry(): THREE.PlaneGeometry {
  return cached(
    "mouthPlane",
    () => new THREE.PlaneGeometry(MOUTH_PLANE.w, MOUTH_PLANE.h),
  );
}

/**
 * Smooth inset surface, fractionally smaller than the CSG opening. The CSG
 * floor remains visible around it as a dark ambient-occlusion seam, which is
 * the strongest depth cue in the reference render.
 */
export function getPlateSurfaceGeometry(): THREE.BufferGeometry {
  return cached("plateSurface", () => {
    const geometry = buildPlateDecalGeometry(
      PLATE_RADIUS + 0.006,
      0.008,
      BODY_SCALE,
      0.992,
    );
    // A smoothly rolled perimeter gives the green insert real thickness.
    // Its outline remains inside the CARE cross; the centre rises toward
    // the eyes while the edge tucks into the cream shell.
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      positions.setZ(i, plateZ(positions.getX(i), positions.getY(i)));
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return bakeVerticalColorGradient(
      geometry,
      PLUS_SHAPE.vBottom,
      PLUS_SHAPE.vTop,
      [0.85, 0.89, 0.82],
      [0.97, 1.00, 0.93],
    );
  });
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
