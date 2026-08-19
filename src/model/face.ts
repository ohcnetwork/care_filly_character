/**
 * Face parts: eye rigs (ball + fixed highlights + closed-eye arc), cheeks and
 * the canvas-painted mouth decal.
 */
import * as THREE from "three";
import { PALETTE } from "../core/palette";
import { createCanvasSurface, type CanvasSurface } from "./canvas";
import {
  getBrowGeometry,
  getEyeArcGeometry,
  getMouthPlaneGeometry,
  getUnitSphereGeometry,
  MOUTH_PLANE,
} from "./geometry";
import type { FillyMaterials } from "./materials";
import {
  computeMouthShape,
  createMouthShape,
  mouthParamsChanged,
  type MouthParams,
  type MouthShape,
} from "./mouthShape";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ── eyes ────────────────────────────────────────────────────────────────────

/** Eye layout constants (body units). */
export const EYE = {
  /** Sheet v2: eyes at ≈ (±0.31, +0.17), r ≈ 0.16, bulging past the plate. */
  x: 0.31,
  y: 0.17,
  z: 0.82,
  radius: 0.175,
  /** Gaze rotation (radians) at lookX/lookY = ±1. */
  lookYaw: 0.38,
  lookPitch: 0.32,
  /** Ball hidden below this openness; arc fully in by 0.05 → 0.25. */
  hideBelow: 0.08,
  /** Brow tilt at brow = ±1 (− = inner ends up / worried). */
  browTilt: 0.45,
  /** Brow rest height above the eye centre and extra lift when eyes widen. */
  browY: 0.225,
  browLift: 0.25,
} as const;

/** Iris texture: the +z hemisphere of a SphereGeometry sits at u = 0.25, v = 0.5. */
const IRIS_CANVAS = { w: 256, h: 128 } as const;
/** Angular radius of the iris (≈ 49°) and pupil (≈ 17°) on the eyeball. */
const IRIS_ANGLE = 0.92;
const PUPIL_ANGLE = 0.33;

/**
 * Paint the eyeball texture: dark sclera everywhere, a green radial-gradient
 * iris with a dark pupil on the front hemisphere. Returns null without a DOM.
 */
export function createEyeTexture(): THREE.CanvasTexture | null {
  const surface = createCanvasSurface(IRIS_CANVAS.w, IRIS_CANVAS.h);
  if (!surface) return null;
  const { ctx, texture } = surface;
  const W = IRIS_CANVAS.w;
  const H = IRIS_CANVAS.h;
  const cx = W * 0.25;
  const cy = H * 0.5;
  // Angular radius → texture pixels (u spans 2π, v spans π).
  const rIris = (IRIS_ANGLE / (2 * Math.PI)) * W; // == (IRIS_ANGLE / π) * H for a 2:1 canvas
  const rPupil = (PUPIL_ANGLE / (2 * Math.PI)) * W;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PALETTE.eye;
  ctx.fillRect(0, 0, W, H);

  // Iris: bright centre fading to a darker rim, with a thin dark edge.
  const grad = ctx.createRadialGradient(cx, cy - rIris * 0.15, rIris * 0.1, cx, cy, rIris);
  grad.addColorStop(0, PALETTE.eyeIris);
  grad.addColorStop(0.62, PALETTE.eyeIris);
  grad.addColorStop(0.92, PALETTE.eyeIrisEdge);
  grad.addColorStop(1, PALETTE.eye);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, rIris, 0, Math.PI * 2);
  ctx.fill();

  // Pupil.
  ctx.fillStyle = PALETTE.eyePupil;
  ctx.beginPath();
  ctx.arc(cx, cy, rPupil, 0, Math.PI * 2);
  ctx.fill();

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Attach the iris texture to the shared eye material (once per material set).
 * The material colour becomes white so the map shows unmodified; without a
 * DOM the eye stays a plain dark glossy sphere. Returns the texture to dispose.
 */
export function ensureEyeTexture(materials: FillyMaterials): THREE.CanvasTexture | null {
  if (materials.eye.map) return null;
  const texture = createEyeTexture();
  if (!texture) return null;
  materials.eye.map = texture;
  materials.eye.color.set("#ffffff");
  materials.eye.needsUpdate = true;
  return texture;
}

/** One eye: socket group → lid (squashes) → ball (gaze) + fixed highlights; plus arc and brow. */
export interface EyeRig {
  /** Socket: positioned on the face, scaled by eyeScale. */
  group: THREE.Group;
  /** Scales in y with openness; holds ball + highlights. */
  lid: THREE.Group;
  /** Glossy textured sphere; rotated by gaze. */
  ball: THREE.Mesh;
  highlights: [THREE.Mesh, THREE.Mesh];
  /** Closed-eye arc; scale.y = eyeArc, opacity fades in as the eye closes. */
  arc: THREE.Mesh;
  arcMaterial: THREE.MeshStandardMaterial;
  /** Eyebrow arc above the eye; tilted by brow, lifted when the eye widens. */
  brow: THREE.Mesh;
  /** −1 = viewer's left (x < 0), +1 = viewer's right. */
  side: -1 | 1;
}

/** Build one eye. The returned arc material is a clone (per-eye opacity). */
export function buildEye(side: -1 | 1, materials: FillyMaterials): EyeRig {
  const group = new THREE.Group();
  group.name = side < 0 ? "eyeL" : "eyeR";
  group.position.set(side * EYE.x, EYE.y, EYE.z);

  const lid = new THREE.Group();
  lid.name = "lid";
  group.add(lid);

  const unit = getUnitSphereGeometry();
  const ball = new THREE.Mesh(unit, materials.eye);
  ball.name = "ball";
  ball.scale.setScalar(EYE.radius);
  lid.add(ball);

  // Both highlights sit upper-left / lower-right on BOTH eyes (fixed to view).
  const big = new THREE.Mesh(unit, materials.eyeHighlight);
  big.name = "highlightBig";
  big.scale.set(0.054, 0.048, 0.054); // slightly oval, like the sheet
  big.position.set(-0.06, 0.065, 0.15);
  const small = new THREE.Mesh(unit, materials.eyeHighlight);
  small.name = "highlightSmall";
  small.scale.setScalar(0.022);
  small.position.set(0.065, -0.055, 0.155);
  lid.add(big, small);

  const arcMaterial = materials.eyeLid.clone();
  arcMaterial.transparent = true;
  arcMaterial.opacity = 0;
  const arc = new THREE.Mesh(getEyeArcGeometry(), arcMaterial);
  arc.name = "arc";
  arc.position.set(0, 0, 0.07);
  arc.visible = false;
  group.add(arc);

  const brow = new THREE.Mesh(getBrowGeometry(), materials.brow);
  brow.name = "brow";
  brow.position.set(0, EYE.browY, -0.02);
  group.add(brow);

  return { group, lid, ball, highlights: [big, small], arc, arcMaterial, brow, side };
}

/** Apply eye pose params. Allocation-free. */
export function applyEyePose(
  eye: EyeRig,
  open: number,
  arc: number,
  lookX: number,
  lookY: number,
  scale: number,
  brow: number,
): void {
  const openness = clamp(open, 0, 1);
  eye.group.scale.setScalar(scale);

  // Lid squash: ball + highlights flatten together; hide when nearly shut.
  const lidVisible = openness > EYE.hideBelow;
  eye.lid.visible = lidVisible;
  eye.lid.scale.y = Math.max(openness, 0.02);

  // Gaze: rotate the textured ball (iris + pupil travel on the sphere).
  eye.ball.rotation.set(-lookY * EYE.lookPitch, lookX * EYE.lookYaw, 0);

  // Closed arc: +1 happy "^", −1 sleepy "︶"; never fully flat.
  let arcScale = clamp(arc, -1, 1);
  if (Math.abs(arcScale) < 0.15) arcScale = arcScale < 0 ? -0.15 : 0.15;
  eye.arc.scale.y = arcScale;
  const arcOpacity = 1 - smoothstep(0.05, 0.25, openness);
  eye.arcMaterial.opacity = arcOpacity;
  eye.arc.visible = arcOpacity > 0.01;

  // Brow: tilt (− = inner end up, worried) and lift when the eyes widen.
  eye.brow.rotation.z = eye.side * clamp(brow, -1, 1) * EYE.browTilt;
  eye.brow.position.y = EYE.browY + EYE.browLift * Math.max(0, scale - 1);
}

// ── cheeks ──────────────────────────────────────────────────────────────────

const scratchDir = new THREE.Vector3();
const scratchTarget = new THREE.Vector3();

/** Place `obj` on the sphere of `radius` along direction (x, y, z), facing outward. */
export function placeOnSphere(obj: THREE.Object3D, x: number, y: number, z: number, radius: number): void {
  scratchDir.set(x, y, z).normalize();
  obj.position.copy(scratchDir).multiplyScalar(radius);
  scratchTarget.copy(scratchDir).multiplyScalar(radius + 1);
  obj.lookAt(scratchTarget);
}

/** Flattened blush disc on the plate. Shares the cheek material (opacity is common). */
export function buildCheek(side: -1 | 1, materials: FillyMaterials): THREE.Mesh {
  const cheek = new THREE.Mesh(getUnitSphereGeometry(), materials.cheek);
  cheek.name = side < 0 ? "cheekL" : "cheekR";
  // Sheet: pink ovals ≈ 0.16 × 0.12 at (±0.41, −0.21), just under the eyes.
  cheek.scale.set(0.1, 0.07, 0.02);
  placeOnSphere(cheek, side * 0.4, -0.05, 0.8, 0.945);
  return cheek;
}

// ── mouth ───────────────────────────────────────────────────────────────────

/** Canvas size for the mouth decal. */
export const MOUTH_CANVAS = { w: 256, h: 208 } as const;

function tracePath(ctx: CanvasRenderingContext2D, s: MouthShape, closeLoop: boolean): void {
  ctx.beginPath();
  ctx.moveTo(s.L.x, s.L.y);
  ctx.bezierCurveTo(s.LtoT.x, s.LtoT.y, s.TfromL.x, s.TfromL.y, s.T.x, s.T.y);
  ctx.bezierCurveTo(s.TtoR.x, s.TtoR.y, s.RfromT.x, s.RfromT.y, s.R.x, s.R.y);
  if (closeLoop) {
    ctx.bezierCurveTo(s.RtoB.x, s.RtoB.y, s.BfromR.x, s.BfromR.y, s.B.x, s.B.y);
    ctx.bezierCurveTo(s.BtoL.x, s.BtoL.y, s.LfromB.x, s.LfromB.y, s.L.x, s.L.y);
    ctx.closePath();
  }
}

/**
 * Paint a mouth shape onto a 2D context. The context is cleared first; the
 * drawing is done in mouth units (y up) via a transform.
 */
export function drawMouth(
  ctx: CanvasRenderingContext2D,
  shape: MouthShape,
  width = MOUTH_CANVAS.w,
  height = MOUTH_CANVAS.h,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const ppu = width / MOUTH_PLANE.w;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(ppu, -ppu);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (shape.closed) {
    tracePath(ctx, shape, false);
    ctx.strokeStyle = PALETTE.mouthLine;
    ctx.lineWidth = shape.lineWidth;
    ctx.stroke();
  } else {
    tracePath(ctx, shape, true);
    ctx.fillStyle = PALETTE.mouthInner;
    ctx.fill();
    if (shape.tongue.alpha > 0.01) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = shape.tongue.alpha;
      ctx.fillStyle = PALETTE.tongue;
      ctx.beginPath();
      ctx.ellipse(shape.tongue.x, shape.tongue.y, shape.tongue.rx, shape.tongue.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    tracePath(ctx, shape, true);
    ctx.strokeStyle = PALETTE.mouthLine;
    ctx.lineWidth = shape.lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/** Mouth decal: a plane on the plate with a lazily repainted canvas texture. */
export class MouthDecal {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  private readonly surface: CanvasSurface | null;
  private readonly shape = createMouthShape();
  private readonly last: MouthParams = { open: NaN, wide: NaN, smile: NaN, round: NaN };
  private readonly params: MouthParams = { open: 0, wide: 1, smile: 0, round: 0 };

  constructor(materials: FillyMaterials) {
    this.material = materials.mouth.clone();
    this.surface = createCanvasSurface(MOUTH_CANVAS.w, MOUTH_CANVAS.h);
    if (this.surface) {
      this.material.map = this.surface.texture;
      this.material.needsUpdate = true;
    }
    this.mesh = new THREE.Mesh(getMouthPlaneGeometry(), this.material);
    this.mesh.name = "mouth";
    this.mesh.renderOrder = 1;
    // Sheet: mouth centred at y ≈ −0.11, at the bar/stem junction.
    placeOnSphere(this.mesh, 0, -0.07, 0.912, 0.95);
    // Without a DOM there is nothing to paint: hide the bare plane.
    this.mesh.visible = this.surface !== null;
  }

  /** Repaint only when params moved beyond a small epsilon. */
  update(open: number, wide: number, smile: number, round: number): void {
    const p = this.params;
    p.open = open;
    p.wide = wide;
    p.smile = smile;
    p.round = round;
    if (!mouthParamsChanged(p, this.last)) return;
    this.last.open = open;
    this.last.wide = wide;
    this.last.smile = smile;
    this.last.round = round;
    computeMouthShape(p, this.shape);
    if (this.surface) {
      drawMouth(this.surface.ctx, this.shape);
      this.surface.texture.needsUpdate = true;
    }
  }

  /** Current (pure) shape, mainly for tests / debugging. */
  get currentShape(): Readonly<MouthShape> {
    return this.shape;
  }

  dispose(): void {
    this.surface?.texture.dispose();
    this.material.dispose();
  }
}
