/**
 * Fallback face plate used only when the CSG recess fails: a thin plus-shaped
 * decal wrapped onto the body sphere (no recess, but the right colour and
 * silhouette). Built from a regular grid, with boundary vertices snapped to
 * the rounded-plus outline via its signed distance field.
 */
import * as THREE from "three";
import { mascotFaceSdf } from "./mascotShape";

/** Backward-compatible name for the shared canonical CARE plus SDF. */
export const plusSdf = mascotFaceSdf;

export interface PlateProjectionScale {
  x: number;
  y: number;
  z: number;
}

/**
 * Build the decal geometry: grid cells touching the plus are kept; vertices
 * outside the outline are pulled onto it along the SDF gradient; then every
 * vertex is projected onto a sphere of `radius`.
 */
export function buildPlateDecalGeometry(
  radius: number,
  cell = 0.02,
  bodyScale: PlateProjectionScale = { x: 1, y: 1, z: 1 },
  outlineScale = 1,
): THREE.BufferGeometry {
  const half = 0.72;
  const n = Math.ceil((half * 2) / cell);
  const step = (half * 2) / n;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertexIndex = new Map<string, number>();

  const eps = 1e-3;
  const snap = (x: number, y: number): [number, number] => {
    let d = plusSdf(x, y);
    if (d <= 0) return [x, y];
    // Two Newton-ish steps along the SDF gradient.
    for (let k = 0; k < 2 && d > 0; k++) {
      const gx = (plusSdf(x + eps, y) - plusSdf(x - eps, y)) / (2 * eps);
      const gy = (plusSdf(x, y + eps) - plusSdf(x, y - eps)) / (2 * eps);
      const len = Math.hypot(gx, gy) || 1;
      x -= (gx / len) * d;
      y -= (gy / len) * d;
      d = plusSdf(x, y);
    }
    return [x, y];
  };

  const vertex = (i: number, j: number): number => {
    const key = `${i},${j}`;
    const existing = vertexIndex.get(key);
    if (existing !== undefined) return existing;
    const snapped = snap(
      (-half + i * step) / outlineScale,
      (-half + j * step) / outlineScale,
    );
    const x = snapped[0] * outlineScale;
    const y = snapped[1] * outlineScale;
    const nx = x / (radius * bodyScale.x);
    const ny = y / (radius * bodyScale.y);
    const z =
      radius * bodyScale.z * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const normalX = x / (bodyScale.x * bodyScale.x);
    const normalY = y / (bodyScale.y * bodyScale.y);
    const normalZ = z / (bodyScale.z * bodyScale.z);
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
    const idx = positions.length / 3;
    positions.push(x, y, z);
    normals.push(
      normalX / normalLength,
      normalY / normalLength,
      normalZ / normalLength,
    );
    uvs.push((x + half) / (2 * half), (y + half) / (2 * half));
    vertexIndex.set(key, idx);
    return idx;
  };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = (-half + i * step) / outlineScale;
      const y0 = (-half + j * step) / outlineScale;
      const scaledStep = step / outlineScale;
      const inside =
        plusSdf(x0, y0) <= 0 ||
        plusSdf(x0 + scaledStep, y0) <= 0 ||
        plusSdf(x0, y0 + scaledStep) <= 0 ||
        plusSdf(x0 + scaledStep, y0 + scaledStep) <= 0;
      if (!inside) continue;
      const a = vertex(i, j);
      const b = vertex(i + 1, j);
      const c = vertex(i + 1, j + 1);
      const d = vertex(i, j + 1);
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
