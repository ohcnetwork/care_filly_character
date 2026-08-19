/**
 * Fallback face plate used only when the CSG recess fails: a thin plus-shaped
 * decal wrapped onto the body sphere (no recess, but the right colour and
 * silhouette). Built from a regular grid, with boundary vertices snapped to
 * the rounded-plus outline via its signed distance field.
 */
import * as THREE from "three";

const PLUS = {
  vHalfWidth: 0.25,
  vBottom: -0.62,
  vTop: 0.58,
  hHalfWidth: 0.62,
  hBottom: -0.31,
  hTop: 0.3,
  cornerRadius: 0.07,
} as const;

/** Signed distance to an axis-aligned rounded box given by its extents. */
function sdRoundBox(px: number, py: number, x0: number, x1: number, y0: number, y1: number, r: number): number {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r;
  const hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(px - cx) - hx;
  const qy = Math.abs(py - cy) - hy;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

/** Signed distance to the rounded plus (negative inside). */
export function plusSdf(x: number, y: number): number {
  const { vHalfWidth: vw, vBottom, vTop, hHalfWidth: hw, hBottom, hTop, cornerRadius: r } = PLUS;
  return Math.min(
    sdRoundBox(x, y, -vw, vw, vBottom, vTop, r),
    sdRoundBox(x, y, -hw, hw, hBottom, hTop, r),
  );
}

/**
 * Build the decal geometry: grid cells touching the plus are kept; vertices
 * outside the outline are pulled onto it along the SDF gradient; then every
 * vertex is projected onto a sphere of `radius`.
 */
export function buildPlateDecalGeometry(radius: number, cell = 0.02): THREE.BufferGeometry {
  const half = 0.66;
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
    const [x, y] = snap(-half + i * step, -half + j * step);
    const zz = Math.max(radius * radius - x * x - y * y, 0);
    const z = Math.sqrt(zz);
    const len = Math.hypot(x, y, z) || 1;
    const idx = positions.length / 3;
    positions.push((x / len) * radius, (y / len) * radius, (z / len) * radius);
    normals.push(x / len, y / len, z / len);
    uvs.push((x + half) / (2 * half), (y + half) / (2 * half));
    vertexIndex.set(key, idx);
    return idx;
  };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -half + i * step;
      const y0 = -half + j * step;
      const inside =
        plusSdf(x0, y0) <= 0 ||
        plusSdf(x0 + step, y0) <= 0 ||
        plusSdf(x0, y0 + step) <= 0 ||
        plusSdf(x0 + step, y0 + step) <= 0;
      if (!inside) continue;
      const a = vertex(i, j);
      const b = vertex(i + 1, j);
      const c = vertex(i + 1, j + 1);
      const d = vertex(i, j + 1);
      indices.push(a, b, c, a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
