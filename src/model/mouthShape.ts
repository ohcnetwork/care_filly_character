/**
 * Pure geometry for the mouth decal. Produces bezier control points in
 * "mouth units" (world units, y up, origin at the mouth centre) from the
 * four pose parameters; the canvas painter in face.ts only draws them.
 *
 * The outline is a 4-anchor cubic loop: L (left corner) → T (top lip centre)
 * → R (right corner) → B (bottom lip centre) → L. A smile "D" and a round
 * "o" are both expressible with this loop, and `round` lerps between them.
 */

export interface MouthParams {
  /** 0 closed .. 1 fully open. */
  open: number;
  /** Width multiplier, 1 = default. */
  wide: number;
  /** −1 frown .. +1 smile. */
  smile: number;
  /** 0..1 blend toward a round "o". */
  round: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface MouthShape {
  /** True when the mouth is drawn as a single lip stroke (open ≈ 0). */
  closed: boolean;
  /** Anchors. */
  L: Vec2;
  T: Vec2;
  R: Vec2;
  B: Vec2;
  /** Handles, named <anchor><direction of the segment they belong to>. */
  LtoT: Vec2; // handle leaving L toward T
  TfromL: Vec2; // handle arriving at T from L
  TtoR: Vec2;
  RfromT: Vec2;
  RtoB: Vec2;
  BfromR: Vec2;
  BtoL: Vec2;
  LfromB: Vec2;
  /** Interior bbox size (0 height when closed). */
  width: number;
  height: number;
  /** Outline / lip stroke width. */
  lineWidth: number;
  /** Tongue ellipse (alpha 0 when hidden). */
  tongue: { x: number; y: number; rx: number; ry: number; alpha: number };
}

/** Base half-width at wide = 1 (world units). */
export const MOUTH_BASE_HALF_WIDTH = 0.1;
/** Below this `open` the mouth is a closed lip line. */
export const MOUTH_CLOSED_THRESHOLD = 0.04;

const KAPPA = 0.5523; // cubic bezier circle constant

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function vec(): Vec2 {
  return { x: 0, y: 0 };
}

/** Allocate an empty shape (reuse it across calls to avoid garbage). */
export function createMouthShape(): MouthShape {
  return {
    closed: true,
    L: vec(),
    T: vec(),
    R: vec(),
    B: vec(),
    LtoT: vec(),
    TfromL: vec(),
    TtoR: vec(),
    RfromT: vec(),
    RtoB: vec(),
    BfromR: vec(),
    BtoL: vec(),
    LfromB: vec(),
    width: 0,
    height: 0,
    lineWidth: 0.016,
    tongue: { x: 0, y: 0, rx: 0, ry: 0, alpha: 0 },
  };
}

function set(v: Vec2, x: number, y: number): void {
  v.x = x;
  v.y = y;
}

/**
 * Compute the mouth outline for the given params.
 * @param params pose mouth params (clamped internally)
 * @param out    optional shape to fill (no allocation when provided)
 */
export function computeMouthShape(
  params: MouthParams,
  out: MouthShape = createMouthShape(),
): MouthShape {
  const open = clamp01(params.open);
  const wide = Math.min(Math.max(params.wide, 0.4), 1.8);
  const smile = Math.min(Math.max(params.smile, -1), 1);
  const round = clamp01(params.round);

  const closed = open < MOUTH_CLOSED_THRESHOLD;

  // ── "D" smile geometry ──────────────────────────────────────────────────
  const hwD = MOUTH_BASE_HALF_WIDTH * wide;
  const cornerY = smile * 0.035; // corners up for smile, down for frown
  const dip = smile * (closed ? 0.074 : 0.03); // a small, rounded U keeps the resting smile warm
  const hD = open * 0.24 * (0.85 + 0.15 * wide); // interior height
  const lift = hD * 0.3; // mouth grows mostly downward, a little upward
  const tYD = cornerY - dip + lift;
  const bYD = tYD - hD;
  const cYD = cornerY + lift;
  const kxD = hwD * 0.55;
  const kyD = Math.min(hD * 0.18, hwD * 0.2);

  // ── round "o" geometry ──────────────────────────────────────────────────
  const hwR = MOUTH_BASE_HALF_WIDTH * wide * 0.65;
  const hR = open * 0.22;
  const rY = hR / 2;
  const kxR = hwR * KAPPA;
  const kyR = rY * KAPPA;

  // ── blend ───────────────────────────────────────────────────────────────
  const hw = lerp(hwD, hwR, round);
  const cY = lerp(cYD, 0, round);
  const tY = lerp(tYD, rY, round);
  const bY = lerp(bYD, -rY, round);
  const kx = lerp(kxD, kxR, round);
  const ky = lerp(kyD, kyR, round); // softly rounded D-smile corners → round "o"

  set(out.L, -hw, cY);
  set(out.R, hw, cY);
  set(out.T, 0, tY);
  set(out.B, 0, bY);
  set(out.LtoT, -hw, cY + ky);
  set(out.TfromL, -kx, tY);
  set(out.TtoR, kx, tY);
  set(out.RfromT, hw, cY + ky);
  set(out.RtoB, hw, cY - ky);
  set(out.BfromR, kx, bY);
  set(out.BtoL, -kx, bY);
  set(out.LfromB, -hw, cY - ky);

  out.closed = closed;
  out.width = hw * 2;
  out.height = closed ? 0 : Math.max(tY - bY, 0);
  out.lineWidth = closed ? 0.025 : 0.012;

  // Tongue: sits in the bottom of the open smile, hidden for round "o".
  // Round "o" mouths keep a hint of tongue (the sheet's surprised face has one).
  const tongueAlpha = smoothstep(0.15, 0.4, open) * (1 - 0.6 * round);
  const tongueRy = out.height * 0.42;
  out.tongue.x = 0;
  out.tongue.y = bY + tongueRy * 0.55;
  out.tongue.rx = hw * 0.5;
  out.tongue.ry = tongueRy;
  out.tongue.alpha = tongueAlpha;

  return out;
}

/** True when two param sets differ by more than `eps` in any component (NaN counts as different). */
export function mouthParamsChanged(
  a: MouthParams,
  b: MouthParams,
  eps = 0.004,
): boolean {
  return (
    !(Math.abs(a.open - b.open) <= eps) ||
    !(Math.abs(a.wide - b.wide) <= eps) ||
    !(Math.abs(a.smile - b.smile) <= eps) ||
    !(Math.abs(a.round - b.round) <= eps)
  );
}
