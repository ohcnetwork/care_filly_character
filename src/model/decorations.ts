/**
 * Fine, hand-drawn expression accents built as ordinary three.js geometry.
 * Clouds, a heart speech bubble, listening waves, a surprise burst and two
 * sleepy Zs all stay within the character's compact camera framing.
 */
import * as THREE from "three";
import { PALETTE } from "../core/palette";
import type { FillyMaterials } from "./materials";

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const STROKE_RADIUS = 0.0055;
const ACCENT_Z = 0.42;

/** Arc in the XY plane, centred at the origin. */
class ArcCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radius: number,
    private readonly a0: number,
    private readonly a1: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = this.a0 + (this.a1 - this.a0) * t;
    return target.set(Math.cos(a) * this.radius, Math.sin(a) * this.radius, 0);
  }
}

/** Convert a drawn two-dimensional path to a thin tube, including its corners. */
function outlineGeometry(path: THREE.Path, radius = STROKE_RADIUS): THREE.TubeGeometry {
  const points = path.getPoints(18);
  const curve = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 1; i < points.length; i++) {
    curve.add(new THREE.LineCurve3(
      new THREE.Vector3(points[i - 1].x, points[i - 1].y, 0),
      new THREE.Vector3(points[i].x, points[i].y, 0),
    ));
  }
  return new THREE.TubeGeometry(curve, Math.max(24, points.length * 2), radius, 6, false);
}

/** Compact, gently asymmetric thought-cloud outline. */
function thoughtCloudPath(): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(-0.16, -0.035);
  path.bezierCurveTo(-0.205, 0.005, -0.185, 0.083, -0.132, 0.1);
  path.bezierCurveTo(-0.117, 0.176, -0.019, 0.191, 0.026, 0.137);
  path.bezierCurveTo(0.081, 0.161, 0.151, 0.124, 0.153, 0.073);
  path.bezierCurveTo(0.208, 0.046, 0.202, -0.029, 0.147, -0.053);
  path.bezierCurveTo(0.121, -0.112, 0.052, -0.119, 0.012, -0.085);
  path.bezierCurveTo(-0.043, -0.121, -0.1, -0.109, -0.12, -0.063);
  path.bezierCurveTo(-0.137, -0.061, -0.154, -0.052, -0.16, -0.035);
  return path;
}

/** Oval speech bubble with a small lower-left tail. */
function speechBubblePath(): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(-0.153, -0.036);
  path.bezierCurveTo(-0.2, 0.046, -0.132, 0.172, -0.025, 0.178);
  path.bezierCurveTo(0.092, 0.197, 0.186, 0.125, 0.188, 0.03);
  path.bezierCurveTo(0.191, -0.062, 0.11, -0.126, 0.005, -0.122);
  path.lineTo(-0.102, -0.187);
  path.lineTo(-0.078, -0.106);
  path.bezierCurveTo(-0.108, -0.095, -0.136, -0.07, -0.153, -0.036);
  return path;
}

/** A filled heart, rather than an emoji or external font glyph. */
function heartGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.064);
  shape.bezierCurveTo(-0.023, -0.046, -0.074, -0.011, -0.073, 0.026);
  shape.bezierCurveTo(-0.072, 0.073, -0.022, 0.078, 0, 0.04);
  shape.bezierCurveTo(0.023, 0.078, 0.073, 0.069, 0.073, 0.026);
  shape.bezierCurveTo(0.074, -0.011, 0.024, -0.046, 0, -0.064);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 24);
}

function setOpacity(meshes: readonly THREE.Mesh[], opacity: number): void {
  for (const mesh of meshes) (mesh.material as THREE.Material).opacity = opacity;
}

/** Expression families keep their existing public names and controls. */
export class FillyDecorations {
  readonly group = new THREE.Group();
  readonly zzz: THREE.Mesh[] = [];
  readonly bubbles: THREE.Mesh[] = [];
  readonly waves: THREE.Mesh[] = [];
  readonly sparks: THREE.Mesh[] = [];
  private readonly speech: THREE.Mesh[] = [];
  private readonly zGroup = new THREE.Group();
  private readonly bubbleGroup = new THREE.Group();
  private readonly waveGroup = new THREE.Group();
  private readonly sparkGroup = new THREE.Group();
  private readonly speechGroup = new THREE.Group();
  private readonly owned: Array<{ dispose(): void }> = [];

  constructor(materials: FillyMaterials) {
    this.group.name = "decorations";
    this.zGroup.name = "zzz";
    this.bubbleGroup.name = "bubbles";
    this.waveGroup.name = "waves";
    this.sparkGroup.name = "sparks";
    this.speechGroup.name = "speech";
    this.group.add(this.zGroup, this.bubbleGroup, this.waveGroup, this.sparkGroup, this.speechGroup);
    this.buildZzz(materials);
    this.buildBubbles(materials);
    this.buildWaves(materials);
    this.buildSparks(materials);
    this.buildSpeech(materials);
    this.update(0, 0, 0, 0, 0);
  }

  private cloneAccent(materials: FillyMaterials): THREE.MeshBasicMaterial {
    const material = materials.accent.clone();
    material.color.set(PALETTE.plate);
    material.transparent = true;
    material.opacity = 0;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    this.owned.push(material);
    return material;
  }

  private addMesh(
    geometry: THREE.BufferGeometry,
    materials: FillyMaterials,
    group: THREE.Group,
    meshes: THREE.Mesh[],
    name: string,
    x = 0,
    y = 0,
  ): THREE.Mesh {
    this.owned.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.cloneAccent(materials));
    mesh.name = name;
    mesh.position.set(x, y, ACCENT_Z);
    meshes.push(mesh);
    group.add(mesh);
    return mesh;
  }

  private buildZzz(materials: FillyMaterials): void {
    for (let i = 0; i < 2; i++) {
      const height = i === 0 ? 0.105 : 0.145;
      const width = height * 0.61;
      const path = new THREE.Path();
      path.moveTo(-width / 2, height / 2);
      path.lineTo(width / 2, height / 2);
      path.lineTo(-width / 2, -height / 2);
      path.lineTo(width / 2, -height / 2);
      this.addMesh(outlineGeometry(path, 0.006), materials, this.zGroup, this.zzz, `z${i}`);
    }
  }

  private buildBubbles(materials: FillyMaterials): void {
    const trails = [
      { x: 0.695, y: 0.596, r: 0.018 },
      { x: 0.751, y: 0.657, r: 0.026 },
    ];
    for (let i = 0; i < trails.length; i++) {
      const { x, y, r } = trails[i];
      this.addMesh(
        new THREE.TorusGeometry(r, 0.0045, 6, 32),
        materials, this.bubbleGroup, this.bubbles, `bubble${i}`, x, y,
      );
    }
    this.addMesh(outlineGeometry(thoughtCloudPath()), materials, this.bubbleGroup, this.bubbles, "thoughtCloud", 0.86, 0.815);
    this.addMesh(heartGeometry(), materials, this.bubbleGroup, this.bubbles, "thoughtHeart", 0.862, 0.837);
  }

  private buildSpeech(materials: FillyMaterials): void {
    this.addMesh(outlineGeometry(speechBubblePath()), materials, this.speechGroup, this.speech, "speechBubble", 0.865, 0.797);
    this.addMesh(heartGeometry(), materials, this.speechGroup, this.speech, "speechHeart", 0.876, 0.828);
  }

  private buildWaves(materials: FillyMaterials): void {
    const radii = [0.072, 0.126, 0.18];
    for (let i = 0; i < radii.length; i++) {
      const geometry = new THREE.TubeGeometry(
        new ArcCurve(radii[i], -0.72, 0.76), 24, STROKE_RADIUS, 6, false,
      );
      this.addMesh(geometry, materials, this.waveGroup, this.waves, `wave${i}`, 0.855, 0.635);
    }
  }

  private buildSparks(materials: FillyMaterials): void {
    const strokes = [
      [-0.828, 0.743, -1.01, 0.938],
      [-0.758, 0.775, -0.795, 0.976],
      [-0.871, 0.699, -1.035, 0.77],
    ];
    for (let i = 0; i < strokes.length; i++) {
      const [x0, y0, x1, y1] = strokes[i];
      const path = new THREE.Path();
      path.moveTo(x0, y0);
      path.lineTo(x1, y1);
      this.addMesh(outlineGeometry(path), materials, this.sparkGroup, this.sparks, `spark${i}`);
    }
  }

  /** Set master opacities and add restrained motion without shifting framing. */
  update(
    zzz: number,
    bubbles: number,
    waves: number,
    sparks: number,
    time: number,
    speaking = false,
  ): void {
    const z = clamp01(zzz);
    this.zGroup.visible = z > 0.001;
    if (this.zGroup.visible) {
      for (let i = 0; i < this.zzz.length; i++) {
        const mesh = this.zzz[i];
        const drift = Math.sin(time * 1.3 + i * 0.9);
        mesh.position.set(0.792 + i * 0.145, 0.797 + i * 0.137 + drift * 0.01, ACCENT_Z);
        (mesh.material as THREE.Material).opacity = z * (0.88 + 0.12 * drift);
      }
    }

    const b = clamp01(bubbles);
    this.bubbleGroup.visible = b > 0.001;
    if (this.bubbleGroup.visible) {
      this.bubbleGroup.position.y = 0.007 * Math.sin(time * 1.6);
      setOpacity(this.bubbles, b * (0.94 + 0.06 * Math.sin(time * 1.8)));
    }

    const w = clamp01(waves);
    this.waveGroup.visible = w > 0.001;
    if (this.waveGroup.visible) {
      for (let i = 0; i < this.waves.length; i++) {
        (this.waves[i].material as THREE.Material).opacity =
          w * (0.82 + 0.18 * Math.sin(time * 4.5 - i * 0.8));
      }
    }

    const s = clamp01(sparks);
    this.sparkGroup.visible = s > 0.001 && !speaking;
    this.speechGroup.visible = s > 0.001 && speaking;
    if (this.sparkGroup.visible) {
      setOpacity(this.sparks, s * (0.88 + 0.12 * Math.sin(time * 4.5)));
    }
    if (this.speechGroup.visible) {
      this.speechGroup.position.y = 0.005 * Math.sin(time * 2);
      // Talking uses a softer source pose value; the bubble should still be
      // as legible as the other outline accents when that state is settled.
      setOpacity(this.speech, clamp01(s * 1.8));
    }
  }

  dispose(): void {
    for (const resource of this.owned) resource.dispose();
    this.owned.length = 0;
  }
}
