/** Compact side ears sharing the forehead's clean, seated border. */
import * as THREE from "three";

const INNER_X = 0.54;
const OUTER_X = 0.94;
const CENTER_X = (INNER_X + OUTER_X) / 2;
const BOTTOM_Y = 0.06;
const TOP_Y = 0.48;
const CENTER_Y = (BOTTOM_Y + TOP_Y) / 2;
const INNER_RADIUS = 0.065;
const OUTER_TOP_RADIUS = 0.075;
const OUTER_BOTTOM_RADIUS = 0.075;

export const SIDE_EAR = Object.freeze({
  innerX: INNER_X,
  outerX: OUTER_X,
  minY: BOTTOM_Y,
  maxY: TOP_Y,
  innerRadius: INNER_RADIUS,
});

function smooth01(start: number, end: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

function cornerInset(distance: number, radius: number): number {
  const turn = Math.max(0, radius - distance);
  return radius - Math.sqrt(Math.max(0, radius * radius - turn * turn));
}

/** A slightly inset copy of the ear outline for its pocket in the shell. */
export function buildSideEarCutoutShape(side: -1 | 1): THREE.Shape {
  const inset = 0.001;
  const left = (side < 0 ? -OUTER_X : INNER_X) + inset;
  const right = (side < 0 ? -INNER_X : OUTER_X) - inset;
  const bottom = BOTTOM_Y + inset;
  const top = TOP_Y - inset;
  const bottomLeft = (side < 0 ? OUTER_BOTTOM_RADIUS : INNER_RADIUS) - inset;
  const bottomRight = (side < 0 ? INNER_RADIUS : OUTER_BOTTOM_RADIUS) - inset;
  const topLeft = (side < 0 ? OUTER_TOP_RADIUS : INNER_RADIUS) - inset;
  const topRight = (side < 0 ? INNER_RADIUS : OUTER_TOP_RADIUS) - inset;
  const shape = new THREE.Shape();
  shape.moveTo(left + bottomLeft, bottom);
  shape.lineTo(right - bottomRight, bottom);
  shape.absarc(right - bottomRight, bottom + bottomRight, bottomRight, -Math.PI / 2, 0, false);
  shape.lineTo(right, top - topRight);
  shape.absarc(right - topRight, top - topRight, topRight, 0, Math.PI / 2, false);
  shape.lineTo(left + topLeft, top);
  shape.absarc(left + topLeft, top - topLeft, topLeft, Math.PI / 2, Math.PI, false);
  shape.lineTo(left, bottom + bottomLeft);
  shape.absarc(left + bottomLeft, bottom + bottomLeft, bottomLeft, Math.PI, Math.PI * 1.5, false);
  shape.closePath();
  return shape;
}

/**
 * Return a closed rounded ear in body coordinates. Its inner front border
 * meets the face exactly; all sidewall thickness extends behind that border.
 * The caller owns the geometry. No model geometry imports or skinning needed.
 */
export function buildSideEarGeometry(
  side: -1 | 1,
  faceZ: (x: number, y: number) => number,
  shellZ: (x: number, y: number) => number,
): THREE.BufferGeometry {
  const columns = 40;
  const rows = 48;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const front: number[][] = [];
  const back: number[][] = [];

  const frontZ = (x: number, y: number): number => {
    const distance = Math.abs(x) - INNER_X;
    const seam = faceZ(side * INNER_X, y) + 0.004;
    // Keep only the attachment on the face's contour. The little cushion
    // has its own soft dome instead of repeating the forehead's bend.
    const cushion = faceZ(side * INNER_X, CENTER_Y) + 0.004
      - 0.18 * (y - CENTER_Y) - 0.28 * distance;
    return THREE.MathUtils.lerp(seam, cushion, smooth01(0, 0.075, distance));
  };
  // Size one continuous root profile to intersect the shell. Per-vertex
  // projection would create a ridge where the pad emerges from the body.
  let rootDepth = 0.18;
  const rootX = side * (INNER_X + 0.05);
  for (const y of [CENTER_Y - 0.14, CENTER_Y, CENTER_Y + 0.14]) {
    rootDepth = Math.max(rootDepth, frontZ(rootX, y) - shellZ(rootX, y) + 0.045);
  }

  const addVertex = (x: number, y: number, z: number, u: number, v: number): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    const shade = THREE.MathUtils.clamp((y - BOTTOM_Y) / (TOP_Y - BOTTOM_Y), 0, 1);
    colors.push(
      THREE.MathUtils.lerp(0.80, 1.04, shade),
      THREE.MathUtils.lerp(0.89, 1.04, shade),
      THREE.MathUtils.lerp(0.80, 0.98, shade),
    );
    uvs.push(u, v);
    return index;
  };

  for (let i = 0; i <= columns; i++) {
    front[i] = [];
    back[i] = [];
    const sample = 0.5 + 0.5 * Math.sin(Math.PI * (i / columns - 0.5));
    // World x always increases, keeping triangle winding identical on both ears.
    const outward = side < 0 ? 1 - sample : sample;
    const absoluteX = THREE.MathUtils.lerp(INNER_X, OUTER_X, outward);
    const x = side * absoluteX;
    const innerInset = cornerInset(absoluteX - INNER_X, INNER_RADIUS);
    const bottom = BOTTOM_Y + Math.max(innerInset, cornerInset(OUTER_X - absoluteX, OUTER_BOTTOM_RADIUS));
    const top = TOP_Y - Math.max(innerInset, cornerInset(OUTER_X - absoluteX, OUTER_TOP_RADIUS));
    for (let j = 0; j <= rows; j++) {
      const v = 0.5 - 0.5 * Math.cos(Math.PI * j / rows);
      const y = THREE.MathUtils.lerp(bottom, top, v);
      const boundary = i === 0 || i === columns || j === 0 || j === rows;
      const profile = boundary ? 0 : Math.sqrt(4 * outward * (1 - outward) * 4 * v * (1 - v));
      front[i][j] = addVertex(x, y, frontZ(x, y) + 0.075 * profile, outward, v);
      const rearX = side * (CENTER_X + (absoluteX - CENTER_X) * 0.925);
      const rearY = CENTER_Y + (y - CENTER_Y) * 0.90;
      const depth = THREE.MathUtils.lerp(rootDepth, 0.14, smooth01(0, 1, outward));
      back[i][j] = addVertex(rearX, rearY, frontZ(rearX, rearY) - depth - 0.03 * profile, outward, v);
    }
  }

  const addCell = (grid: number[][], i: number, j: number, reverse: boolean): void => {
    const a = grid[i][j];
    const b = grid[i + 1][j];
    const c = grid[i + 1][j + 1];
    const d = grid[i][j + 1];
    const alternate = (i === columns - 1 && j === 0) || (i === 0 && j === rows - 1);
    const triangles = alternate ? [a, b, d, b, c, d] : [a, b, c, a, c, d];
    for (let k = 0; k < triangles.length; k += 3) {
      indices.push(triangles[k], triangles[k + (reverse ? 2 : 1)], triangles[k + (reverse ? 1 : 2)]);
    }
  };
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      addCell(front, i, j, false);
      addCell(back, i, j, true);
    }
  }

  const perimeter: Array<[number, number]> = [];
  for (let i = 0; i <= columns; i++) perimeter.push([front[i][0], back[i][0]]);
  for (let j = 1; j <= rows; j++) perimeter.push([front[columns][j], back[columns][j]]);
  for (let i = columns - 1; i >= 0; i--) perimeter.push([front[i][rows], back[i][rows]]);
  for (let j = rows - 1; j > 0; j--) perimeter.push([front[0][j], back[0][j]]);
  const rings: number[][] = [perimeter.map(([index]) => index)];
  const wallSegments = 8;
  for (let ring = 1; ring < wallSegments; ring++) {
    const t = ring / wallSegments;
    const inset = smooth01(0, 1, t);
    rings.push(perimeter.map(([frontIndex, backIndex]) => addVertex(
      THREE.MathUtils.lerp(positions[frontIndex * 3], positions[backIndex * 3], inset),
      THREE.MathUtils.lerp(positions[frontIndex * 3 + 1], positions[backIndex * 3 + 1], inset),
      THREE.MathUtils.lerp(positions[frontIndex * 3 + 2], positions[backIndex * 3 + 2], t),
      uvs[frontIndex * 2],
      uvs[frontIndex * 2 + 1],
    )));
  }
  rings.push(perimeter.map(([, index]) => index));
  for (let ring = 0; ring < wallSegments; ring++) {
    for (let edge = 0; edge < perimeter.length; edge++) {
      const next = (edge + 1) % perimeter.length;
      const a = rings[ring][edge];
      const b = rings[ring][next];
      const c = rings[ring + 1][next];
      const d = rings[ring + 1][edge];
      indices.push(a, d, c, a, c, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
