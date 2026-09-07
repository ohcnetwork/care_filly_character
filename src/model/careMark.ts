/**
 * Canonical CARE mark lattice, normalized from the official 512 × 512 SVG.
 *
 * The visible mark is a strict 5 × 4 grid. `module` corresponds to the
 * source artwork's 80 px cell; `centerY` only positions the mark on Filly's
 * cream shell. All other dimensions and anchors derive from that one cell.
 *
 *   · L · L ·
 *   L · D · L
 *   · D D D ·
 *   · · D · ·
 *
 * D = the dark healthcare plus, L = the four lighter pixel blocks, and the
 * two empty cells are intentional interlocking negative space.
 */

const moduleSize = 0.38;
const centerY = 0.05;
const cornerRadius = moduleSize * (11.43 / 80);

export const CARE_MARK = Object.freeze({
  module: moduleSize,
  centerY,
  cornerRadius,
  plus: Object.freeze({
    vHalfWidth: moduleSize / 2,
    vBottom: centerY - moduleSize * 1.5,
    vTop: centerY + moduleSize * 1.5,
    hHalfWidth: moduleSize * 1.5,
    hBottom: centerY - moduleSize / 2,
    hTop: centerY + moduleSize / 2,
    cornerRadius,
  }),
  topPixel: Object.freeze({
    size: moduleSize,
    centerX: moduleSize,
    centerY: centerY + moduleSize * 2,
    bottom: centerY + moduleSize * 1.5,
    top: centerY + moduleSize * 2.5,
  }),
  sidePixel: Object.freeze({
    size: moduleSize,
    centerX: moduleSize * 2,
    centerY: centerY + moduleSize,
    innerX: moduleSize * 1.5,
    outerX: moduleSize * 2.5,
    bottom: centerY + moduleSize / 2,
    top: centerY + moduleSize * 1.5,
  }),
  bounds: Object.freeze({
    minX: -moduleSize * 2.5,
    maxX: moduleSize * 2.5,
    minY: centerY - moduleSize * 1.5,
    maxY: centerY + moduleSize * 2.5,
  }),
});

/** Signed distance to an axis-aligned rounded box (negative inside). */
function roundedBoxSdf(
  x: number,
  y: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  radius: number,
): number {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - radius;
  const hy = (y1 - y0) / 2 - radius;
  const qx = Math.abs(x - cx) - hx;
  const qy = Math.abs(y - cy) - hy;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

/** Signed distance to the dark central CARE plus (negative inside). */
export function carePlusSdf(x: number, y: number): number {
  const p = CARE_MARK.plus;
  return Math.min(
    roundedBoxSdf(
      x,
      y,
      -p.vHalfWidth,
      p.vHalfWidth,
      p.vBottom,
      p.vTop,
      p.cornerRadius,
    ),
    roundedBoxSdf(
      x,
      y,
      -p.hHalfWidth,
      p.hHalfWidth,
      p.hBottom,
      p.hTop,
      p.cornerRadius,
    ),
  );
}
