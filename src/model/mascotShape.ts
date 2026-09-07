/**
 * Character adaptation from the user-supplied September 2026 reference.
 * CARE's four pixels become soft tabs around a broad expressive face with a
 * cream crown notch and lower stem. The unchanged official mark lives in
 * careMark.ts / reference/care-logo-mark.svg; this is the mascot silhouette.
 */
export const MASCOT_FACE = Object.freeze({
  vHalfWidth: 0.185,
  vBottom: -0.55,
  vTop: 0.61,
  hHalfWidth: 0.55,
  hBottom: -0.29,
  hTop: 0.61,
  notchHalfWidth: 0.15,
  notchBottom: 0.49,
  cornerRadius: 0.075,
});

function roundedBox(
  x: number, y: number, x0: number, x1: number,
  y0: number, y1: number, radius: number,
): number {
  const qx = Math.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2 + radius;
  const qy = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
    + Math.min(Math.max(qx, qy), 0) - radius;
}

/** One shared contour for the sculpted surface and its CSG fallback. */
export function mascotFaceSdf(x: number, y: number): number {
  const p = MASCOT_FACE;
  const face = roundedBox(x, y, -p.hHalfWidth, p.hHalfWidth,
    p.hBottom, p.hTop, p.cornerRadius);
  const stem = roundedBox(x, y, -p.vHalfWidth, p.vHalfWidth,
    p.vBottom, p.hBottom + 0.2, p.cornerRadius);
  const notch = roundedBox(x, y, -p.notchHalfWidth, p.notchHalfWidth,
    p.notchBottom, 1.2, 0.065);
  return Math.max(Math.min(face, stem), -notch);
}
