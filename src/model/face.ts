/**
 * Flat cartoon eyes, expressive blink curves and a tiny
 * expressive mouth. The facial pieces follow the cushioned green insert.
 */
import * as THREE from "three";
import { PALETTE } from "../core/palette";
import { createCanvasSurface, type CanvasSurface } from "./canvas";
import {
  BODY_SCALE,
  bodyZ,
  getBrowGeometry,
  getCartoonEyeGeometry,
  getEyeArcGeometry,
  getEyePatchGeometry,
  getMouthPlaneGeometry,
  getUnitSphereGeometry,
  MOUTH_PLANE,
  plateZ,
} from "./geometry";
import type { FillyMaterials } from "./materials";
import {
  computeMouthShape,
  createMouthShape,
  mouthParamsChanged,
  type MouthParams,
  type MouthShape,
} from "./mouthShape";

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ── eyes ────────────────────────────────────────────────────────────────────

/** Eye layout, measured against the supplied character sheet. */
export const EYE = {
  x: 0.265,
  y: 0.12,
  z: plateZ(0.265, 0.12) + 0.004,
  radiusX: 0.125,
  radiusY: 0.15,
  /** Almost-flat colour patches sit just above the face surface. */
  radiusZ: 0.006,
  lookX: 0.012,
  lookY: 0.011,
  lookYaw: 0.018,
  lookPitch: 0.016,
  hideBelow: 0.08,
  showBrows: true,
  browTilt: 0.3,
  browY: 0.23,
  browLift: 0.14,
} as const;

const IRIS_CANVAS = { w: 512, h: 256 } as const;

/**
 * Paint one emerald eye, with a deep upper pupil and a luminous green
 * lower iris. The sphere's forward hemisphere is centred at u=.25, v=.5.
 * Catchlights are separate shallow patches so they stay steady during gaze.
 */
export function createEyeTexture(): THREE.CanvasTexture | null {
  const surface = createCanvasSurface(IRIS_CANVAS.w, IRIS_CANVAS.h);
  if (!surface) return null;
  const { ctx, texture } = surface;
  const { w: W, h: H } = IRIS_CANVAS;
  const cx = W * 0.25;
  const cy = H * 0.5;
  const r = (1.46 / (2 * Math.PI)) * W;

  ctx.fillStyle = "#0a2c18";
  ctx.fillRect(0, 0, W, H);
  const iris = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  iris.addColorStop(0, "#123e21");
  iris.addColorStop(0.3, "#225a2b");
  iris.addColorStop(0.53, "#32713c");
  iris.addColorStop(0.76, "#508f49");
  iris.addColorStop(1, "#8abb70");
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
  ctx.fill();

  // Soft painted colour keeps the iris expressive without a glass-lens finish.
  const glow = ctx.createRadialGradient(
    cx - r * 0.38, cy + r * 0.6, r * 0.03,
    cx - r * 0.38, cy + r * 0.6, r * 0.63,
  );
  glow.addColorStop(0, "rgba(156, 210, 116, 0.22)");
  glow.addColorStop(1, "rgba(81, 144, 55, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
  ctx.fill();

  const pupil = ctx.createRadialGradient(
    cx + r * 0.12, cy - r * 0.18, r * 0.1,
    cx + r * 0.12, cy - r * 0.18, r * 0.84,
  );
  pupil.addColorStop(0, "#071d13");
  pupil.addColorStop(0.75, "#082618");
  pupil.addColorStop(1, "#154b24");
  ctx.fillStyle = pupil;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.08, cy - r * 0.19, r * 0.69, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  texture.needsUpdate = true;
  return texture;
}

/** Attach one shared iris texture per material set; headless builds stay dark. */
export function ensureEyeTexture(
  materials: FillyMaterials,
): THREE.CanvasTexture | null {
  if (materials.eye.map) return null;
  const texture = createEyeTexture();
  if (!texture) return null;
  materials.eye.map = texture;
  materials.eye.color.set("#ffffff");
  materials.eye.needsUpdate = true;
  return texture;
}

/** One eye, including its squashable colour patch and closed-eye stroke. */
export interface EyeRig {
  group: THREE.Group;
  lid: THREE.Group;
  /** Optional ivory rim, hidden for the default cartoon style. */
  sclera: THREE.Mesh;
  ball: THREE.Mesh;
  highlights: [THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh];
  arc: THREE.Mesh;
  arcMaterial: THREE.MeshStandardMaterial;
  brow: THREE.Mesh;
  browBaseY: number;
  side: -1 | 1;
}

/** Build soft ink beans with one generous drawn highlight. */
export function buildEye(side: -1 | 1, materials: FillyMaterials): EyeRig {
  const group = new THREE.Group();
  group.name = side < 0 ? "eyeL" : "eyeR";
  placeOnPlate(group, side * EYE.x, EYE.y, 0.004);

  const lid = new THREE.Group();
  lid.name = "lid";
  group.add(lid);
  const unit = getUnitSphereGeometry();
  const illustrated = materials.eye.map !== null;
  const patch = illustrated ? unit : getEyePatchGeometry();

  const outline = new THREE.Mesh(unit, materials.brow);
  outline.name = "eyeOutline";
  outline.scale.set(0.144, 0.17, 0.004);
  outline.position.z = -0.001;
  outline.visible = illustrated;
  lid.add(outline);

  const sclera = new THREE.Mesh(unit, materials.eyeWhite);
  sclera.name = "sclera";
  sclera.scale.set(0.139, 0.164, 0.004);
  sclera.position.set(-0.001, 0, 0.003);
  sclera.visible = illustrated;
  lid.add(sclera);

  const ball = new THREE.Mesh(illustrated ? unit : getCartoonEyeGeometry(side), materials.eye);
  ball.name = "ball";
  ball.scale.set(EYE.radiusX, EYE.radiusY, EYE.radiusZ);
  ball.position.set(0.009, 0, 0.005);
  lid.add(ball);

  const big = new THREE.Mesh(patch, materials.eyeHighlight);
  big.name = "highlightBig";
  big.scale.set(0.04, 0.045, 0.0008);
  big.position.set(-0.041, 0.059, 0.012);
  const lower = new THREE.Mesh(unit, materials.eyeHighlightSoft);
  lower.name = "highlightLower";
  lower.scale.set(0.024, 0.017, 0.0006);
  lower.position.set(0.04, -0.088, 0.012);
  lower.visible = illustrated;
  const pin = new THREE.Mesh(unit, materials.eyeHighlight);
  pin.name = "highlightPin";
  pin.scale.set(0.008, 0.008, 0.0005);
  pin.position.set(0.031, 0.025, 0.013);
  pin.visible = illustrated;
  const soft = new THREE.Mesh(unit, materials.eyeHighlightSoft);
  soft.name = "highlightSoft";
  soft.scale.set(0.022, 0.013, 0.0006);
  soft.position.set(-0.022, -0.12, 0.011);
  soft.visible = false;
  lid.add(big, lower, pin, soft);

  const arcMaterial = materials.eyeLid.clone();
  arcMaterial.transparent = true;
  arcMaterial.opacity = 0;
  const arc = new THREE.Mesh(getEyeArcGeometry(), arcMaterial);
  arc.name = "arc";
  arc.position.set(0, -0.008, 0.005);
  arc.scale.z = 0.25;
  arc.visible = false;
  group.add(arc);

  const brow = new THREE.Mesh(getBrowGeometry(), materials.brow);
  brow.name = "brow";
  brow.scale.set(0.95, 1, 0.8);
  placeOnPlate(brow, side * EYE.x, EYE.y + EYE.browY, 0.013);
  // Preserve the eyebrow's surface placement when adding it under the eye.
  group.updateMatrixWorld(true);
  group.worldToLocal(brow.position);
  brow.quaternion.premultiply(group.quaternion.clone().invert());
  brow.visible = EYE.showBrows;
  group.add(brow);

  return {
    group, lid, sclera, ball, highlights: [big, lower, pin, soft],
    arc, arcMaterial, brow, browBaseY: brow.position.y, side,
  };
}

/** Apply the expression without allocating geometry or textures. */
export function applyEyePose(
  eye: EyeRig,
  open: number,
  arc: number,
  lookX: number,
  lookY: number,
  scale: number,
  white: number,
  brow: number,
): void {
  const openness = clamp(open, 0, 1);
  const whiteMix = clamp(white, 0, 1);
  eye.group.scale.setScalar(scale);
  eye.lid.visible = openness > EYE.hideBelow;
  eye.lid.scale.x = 1 + 0.12 * (1 - openness);
  eye.lid.scale.y = Math.max(openness, 0.02);

  // Thinking adds a small gaze shift and squash to the drawn eye shapes.
  const pupilScale = 1 - whiteMix * 0.07;
  const pupilX = lookX * (EYE.lookX + whiteMix * 0.008);
  const pupilY = lookY * (EYE.lookY + whiteMix * 0.014);
  eye.ball.scale.set(
    EYE.radiusX * pupilScale,
    EYE.radiusY * pupilScale,
    EYE.radiusZ,
  );
  eye.ball.position.set(0.009 + pupilX, pupilY, 0.005);
  eye.ball.rotation.set(-lookY * EYE.lookPitch, lookX * EYE.lookYaw, 0);

  // A single drawn dot stays steady while the oval follows the gaze.
  // Extra accents remain available for the optional illustrated style.
  const [big, lower, pin, soft] = eye.highlights;
  const gx = pupilX * whiteMix;
  const gy = pupilY * whiteMix;
  big.position.set(-0.041 + gx, 0.059 + gy, 0.012);
  lower.position.set(0.04 + gx, -0.088 + gy, 0.012);
  pin.position.set(0.031 + gx, 0.025 + gy, 0.013);
  soft.position.set(-0.022 + gx, -0.12 + gy, 0.011);

  let arcScale = clamp(arc, -1, 1);
  if (Math.abs(arcScale) < 0.15) arcScale = arcScale < 0 ? -0.15 : 0.15;
  eye.arc.scale.y = arcScale;
  eye.arc.scale.x = 1 + 0.1 * Math.max(0, arcScale) * (1 - openness);
  const arcOpacity = 1 - smoothstep(0.05, 0.25, openness);
  eye.arcMaterial.opacity = arcOpacity;
  eye.arc.visible = arcOpacity > 0.01;

  eye.brow.rotation.z = eye.side * clamp(brow, -1, 1) * EYE.browTilt;
  eye.brow.position.y = eye.browBaseY + EYE.browLift * Math.max(0, scale - 1);
}

// ── cheeks ──────────────────────────────────────────────────────────────────

const scratchDir = new THREE.Vector3();
const scratchTarget = new THREE.Vector3();

/**
 * Place `obj` on the body ellipsoid of radius `r` at (x, y) (z derived), facing
 * outward along the ellipsoid normal.
 */
export function placeOnBody(
  obj: THREE.Object3D,
  x: number,
  y: number,
  r: number,
): void {
  const z = bodyZ(x, y, r);
  obj.position.set(x, y, z);
  // Ellipsoid normal ∝ (x/sx², y/sy², z/sz²).
  scratchDir
    .set(
      x / (BODY_SCALE.x * BODY_SCALE.x),
      y / (BODY_SCALE.y * BODY_SCALE.y),
      z / (BODY_SCALE.z * BODY_SCALE.z),
    )
    .normalize();
  scratchTarget.copy(obj.position).add(scratchDir);
  obj.lookAt(scratchTarget);
}

/** Attach a facial feature to the insert, following its local tangent. */
function placeOnPlate(obj: THREE.Object3D, x: number, y: number, offset: number): void {
  const step = 0.002;
  const dzdx = (plateZ(x + step, y) - plateZ(x - step, y)) / (2 * step);
  const dzdy = (plateZ(x, y + step) - plateZ(x, y - step)) / (2 * step);
  obj.position.set(x, y, plateZ(x, y) + offset);
  scratchDir.set(-dzdx, -dzdy, 1).normalize();
  scratchTarget.copy(obj.position).add(scratchDir);
  obj.lookAt(scratchTarget);
}

/** Legacy blush geometry retained for the public rig; FillyModel keeps it hidden. */
export function buildCheek(
  side: -1 | 1,
  materials: FillyMaterials,
): THREE.Mesh {
  const cheek = new THREE.Mesh(getUnitSphereGeometry(), materials.cheek);
  cheek.name = side < 0 ? "cheekL" : "cheekR";
  // Small peach ovals sit just below and outside the eyes.
  cheek.scale.set(0.09, 0.051, 0.009);
  placeOnPlate(cheek, side * 0.395, -0.035, 0.012);
  return cheek;
}

// ── mouth ───────────────────────────────────────────────────────────────────

/** Canvas size for the mouth decal. */
export const MOUTH_CANVAS = { w: 256, h: 208 } as const;

function tracePath(
  ctx: CanvasRenderingContext2D,
  s: MouthShape,
  closeLoop: boolean,
): void {
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
      ctx.ellipse(
        shape.tongue.x,
        shape.tongue.y,
        shape.tongue.rx,
        shape.tongue.ry,
        0,
        0,
        Math.PI * 2,
      );
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
  private readonly last: MouthParams = {
    open: NaN,
    wide: NaN,
    smile: NaN,
    round: NaN,
  };
  private readonly params: MouthParams = {
    open: 0,
    wide: 1,
    smile: 0,
    round: 0,
  };

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
    // The sheet's mouth is compact and sits at the bar/stem junction.
    placeOnPlate(this.mesh, 0, 0.015, 0.019);
    this.mesh.scale.setScalar(0.7);
    // Without a DOM there is nothing to paint: hide the bare plane.
    this.mesh.visible = this.surface !== null;
  }

  /** Repaint only when params moved beyond a small epsilon. */
  update(open: number, wide: number, smile: number, round: number): void {
    // Closed smiles are tiny; open vowel and surprised mouths need enough
    // area to read at the small sizes used by the assistant UI.
    this.mesh.scale.setScalar(0.7 + 0.3 * smoothstep(0, 0.4, open));
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
