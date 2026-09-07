/** Shared horn outline and seam used by the mint crown and green forehead. */
import * as THREE from "three";

export const CROWN = Object.freeze({
  centerX: 0.34,
  halfWidth: 0.20,
  baseY: 0.55,
  seamRise: 0.10,
  topY: 1.07,
  topRadius: 0.095,
});

function smooth01(start: number, end: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Flat centre with quarter-circle turns down into the two vertical sides. */
export function crownBaseY(localX: number): number {
  const flatHalfWidth = CROWN.halfWidth - CROWN.seamRise;
  const turn = THREE.MathUtils.clamp(
    (Math.abs(localX) - flatHalfWidth) / CROWN.seamRise,
    0,
    1,
  );
  return CROWN.baseY + CROWN.seamRise * Math.sqrt(Math.max(0, 1 - turn * turn));
}

/** The shared front seam follows the forehead's gentle backward slope. */
export function crownSurfaceZ(worldX: number, y: number): number {
  return 0.535 - 0.36 * (y - 0.62) - 0.18 * (Math.abs(worldX) - CROWN.centerX);
}

function crownTopY(localX: number): number {
  const turn = Math.max(0, Math.abs(localX) - (CROWN.halfWidth - CROWN.topRadius));
  return CROWN.topY - CROWN.topRadius
    + Math.sqrt(Math.max(0, CROWN.topRadius * CROWN.topRadius - turn * turn));
}

/**
 * Build a closed, cushioned horn directly in body coordinates. The front
 * outline stays on the shared seam; rounded sidewalls carry the horn's real
 * thickness behind it. The caller owns the returned geometry.
 */
export function buildCrownHornGeometry(
  side: -1 | 1,
  shellZ: (x: number, y: number) => number,
): THREE.BufferGeometry {
  const columns = 48;
  const rows = 64;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];
  const front: number[][] = [];
  const back: number[][] = [];
  // A single smooth rear profile intersects the crown without a local tuck
  // that would leave a knuckle where the horn emerges from the shell.
  const rootY = 0.69;
  let rootDepth = 0.22;
  for (const localX of [-0.175, 0, 0.175]) {
    const x = side * CROWN.centerX + localX;
    rootDepth = Math.max(rootDepth, crownSurfaceZ(x, rootY) + 0.004 - shellZ(x, rootY) + 0.05);
  }

  const addVertex = (x: number, y: number, z: number, u: number, v: number): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    const shade = THREE.MathUtils.clamp(
      (y - CROWN.baseY) / (CROWN.topY - CROWN.baseY), 0, 1,
    );
    colors.push(
      THREE.MathUtils.lerp(0.80, 1.04, shade),
      THREE.MathUtils.lerp(0.89, 1.04, shade),
      THREE.MathUtils.lerp(0.80, 0.98, shade),
    );
    uvs.push(u, v);
    const tipWeight = smooth01(0.70, CROWN.topY - 0.035, y);
    skinIndices.push(0, 1, 0, 0);
    skinWeights.push(1 - tipWeight, tipWeight, 0, 0);
    return index;
  };

  for (let i = 0; i <= columns; i++) {
    front[i] = [];
    back[i] = [];
    // Extra samples along the outline resolve its small corner radii.
    const localX = CROWN.halfWidth * Math.sin(Math.PI * (i / columns - 0.5));
    const x = side * CROWN.centerX + localX;
    const bottom = crownBaseY(localX);
    const top = crownTopY(localX);
    const across = Math.max(0, 1 - (localX / CROWN.halfWidth) ** 2);
    for (let j = 0; j <= rows; j++) {
      const v = 0.5 - 0.5 * Math.cos(Math.PI * j / rows);
      const y = THREE.MathUtils.lerp(bottom, top, v);
      const boundary = i === 0 || i === columns || j === 0 || j === rows;
      const profile = boundary ? 0 : Math.sqrt(across * 4 * v * (1 - v));
      const seamZ = crownSurfaceZ(x, y) + 0.004;
      const u = localX / (2 * CROWN.halfWidth) + 0.5;
      front[i][j] = addVertex(x, y, seamZ + 0.06 * profile, u, v);
      const rearX = side * CROWN.centerX + localX * 0.925;
      const rearY = y - THREE.MathUtils.lerp(0.03, 0.024, v);
      const depth = THREE.MathUtils.lerp(rootDepth, 0.15, smooth01(0.66, CROWN.topY, y));
      const rearZ = crownSurfaceZ(rearX, rearY) + 0.004 - depth - 0.035 * profile;
      back[i][j] = addVertex(rearX, rearY, rearZ, u, v);
    }
  }

  const addCell = (grid: number[][], i: number, j: number, reverse: boolean): void => {
    const a = grid[i][j];
    const b = grid[i + 1][j];
    const c = grid[i + 1][j + 1];
    const d = grid[i][j + 1];
    // Point corner diagonals toward the interior for even corner normals.
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

  // One counter-clockwise boundary loop, viewed from the front. Intermediate
  // rings round the sidewall into each cushion without extending the outline.
  const perimeter: Array<[number, number]> = [];
  for (let i = 0; i <= columns; i++) perimeter.push([front[i][0], back[i][0]]);
  for (let j = 1; j <= rows; j++) perimeter.push([front[columns][j], back[columns][j]]);
  for (let i = columns - 1; i >= 0; i--) perimeter.push([front[i][rows], back[i][rows]]);
  for (let j = rows - 1; j > 0; j--) perimeter.push([front[0][j], back[0][j]]);
  const rings: number[][] = [perimeter.map(([index]) => index)];
  const wallSegments = 10;
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
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
