/**
 * Decorations: zZ (sleepy), thought bubbles (thinking), sound waves
 * (listening) and sparks (surprised/talking). Each family has a master
 * opacity from the pose and a gentle time-driven loop.
 */
import * as THREE from "three";
import { PALETTE } from "../core/palette";
import { createCanvasSurface } from "./canvas";
import type { FillyMaterials } from "./materials";

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Arc in the XY plane, centred at the origin, from angle a0 to a1. */
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

/** Paint a bold "Z" glyph (three strokes, no font dependency). */
function paintZ(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = size * 0.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const m = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(m, m);
  ctx.lineTo(size - m, m);
  ctx.lineTo(m, size - m);
  ctx.lineTo(size - m, size - m);
  ctx.stroke();
}

/** All four decoration families under one group. */
export class FillyDecorations {
  readonly group = new THREE.Group();
  readonly zzz: THREE.Mesh[] = [];
  readonly bubbles: THREE.Mesh[] = [];
  readonly waves: THREE.Mesh[] = [];
  readonly sparks: THREE.Mesh[] = [];
  private readonly zGroup = new THREE.Group();
  private readonly bubbleGroup = new THREE.Group();
  private readonly waveGroup = new THREE.Group();
  private readonly sparkGroup = new THREE.Group();
  private readonly owned: Array<{ dispose(): void }> = [];

  constructor(materials: FillyMaterials) {
    this.group.name = "decorations";
    this.zGroup.name = "zzz";
    this.bubbleGroup.name = "bubbles";
    this.waveGroup.name = "waves";
    this.sparkGroup.name = "sparks";
    this.group.add(this.zGroup, this.bubbleGroup, this.waveGroup, this.sparkGroup);
    this.buildZzz(materials);
    this.buildBubbles(materials);
    this.buildWaves(materials);
    this.buildSparks(materials);
    this.update(0, 0, 0, 0, 0);
  }

  private cloneAccent(materials: FillyMaterials): THREE.MeshBasicMaterial {
    const m = materials.accent.clone();
    m.transparent = true;
    m.opacity = 0;
    this.owned.push(m);
    return m;
  }

  private buildZzz(materials: FillyMaterials): void {
    const surface = createCanvasSurface(64, 64);
    if (surface) {
      paintZ(surface.ctx, 64);
      surface.texture.needsUpdate = true;
      this.owned.push(surface.texture);
    }
    const sizes = [0.16, 0.22, 0.3];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(sizes[i], sizes[i]);
      this.owned.push(geo);
      const mat = this.cloneAccent(materials);
      if (surface) {
        mat.map = surface.texture;
        mat.color.set("#ffffff");
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `z${i}`;
      this.zzz.push(mesh);
      this.zGroup.add(mesh);
    }
  }

  private buildBubbles(materials: FillyMaterials): void {
    const specs = [
      { r: 0.07, tube: 0.018, x: 1.02, y: 1.0 },
      { r: 0.12, tube: 0.02, x: 1.26, y: 1.3 },
    ];
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const geo = new THREE.TorusGeometry(s.r, s.tube, 10, 36);
      this.owned.push(geo);
      const mesh = new THREE.Mesh(geo, this.cloneAccent(materials));
      mesh.name = `bubble${i}`;
      mesh.position.set(s.x, s.y, 0.3);
      this.bubbles.push(mesh);
      this.bubbleGroup.add(mesh);
    }
  }

  private buildWaves(materials: FillyMaterials): void {
    const radii = [0.12, 0.21, 0.3];
    for (let i = 0; i < radii.length; i++) {
      const geo = new THREE.TubeGeometry(new ArcCurve(radii[i], -0.7, 0.7), 20, 0.02, 8, false);
      this.owned.push(geo);
      const mesh = new THREE.Mesh(geo, this.cloneAccent(materials));
      mesh.name = `wave${i}`;
      mesh.position.set(1.08, 0.62, 0.25);
      this.waves.push(mesh);
      this.waveGroup.add(mesh);
    }
  }

  private buildSparks(materials: FillyMaterials): void {
    const geo = new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8, 1);
    this.owned.push(geo);
    const angles = [0.35, 0.95, 1.55]; // radians from +x, fanning toward up
    for (let i = 0; i < angles.length; i++) {
      const holder = new THREE.Group();
      holder.position.set(1.1, 0.3, 0.3);
      holder.rotation.z = angles[i] - Math.PI / 2; // cylinder's +y → radial direction
      const mesh = new THREE.Mesh(geo, this.cloneAccent(materials));
      mesh.name = `spark${i}`;
      mesh.position.y = 0.2; // radial distance from the burst centre
      holder.add(mesh);
      this.sparks.push(mesh);
      this.sparkGroup.add(holder);
    }
  }

  /** Set master opacities + animate. Allocation-free. */
  update(zzz: number, bubbles: number, waves: number, sparks: number, time: number): void {
    // zZ: three glyphs drifting up-right and fading in a loop.
    const z = clamp01(zzz);
    this.zGroup.visible = z > 0.001;
    if (this.zGroup.visible) {
      for (let i = 0; i < this.zzz.length; i++) {
        const mesh = this.zzz[i];
        const phase = (time * 0.35 + i / 3) % 1;
        // Stay inside the default camera frame (visible top ≈ y 1.5 at z 0.3).
        mesh.position.set(
          0.92 + i * 0.13 + 0.05 * Math.sin(phase * TAU),
          0.9 + i * 0.12 + phase * 0.24,
          0.3,
        );
        const s = 0.75 + 0.45 * phase;
        mesh.scale.set(s, s, 1);
        (mesh.material as THREE.Material).opacity = z * Math.sin(phase * Math.PI);
      }
    }

    // Bubbles: two rings bobbing.
    const b = clamp01(bubbles);
    this.bubbleGroup.visible = b > 0.001;
    if (this.bubbleGroup.visible) {
      for (let i = 0; i < this.bubbles.length; i++) {
        const mesh = this.bubbles[i];
        mesh.position.y = (i === 0 ? 0.92 : 1.18) + 0.03 * Math.sin(time * 1.8 + i * 1.3);
        (mesh.material as THREE.Material).opacity = b * (0.85 + 0.15 * Math.sin(time * 2.2 + i));
      }
    }

    // Waves: ")))" rings pulsing outward.
    const w = clamp01(waves);
    this.waveGroup.visible = w > 0.001;
    if (this.waveGroup.visible) {
      for (let i = 0; i < this.waves.length; i++) {
        const mesh = this.waves[i];
        // Pulse between 0.35 and 1 so the rings never vanish completely.
        (mesh.material as THREE.Material).opacity = w * (0.675 + 0.325 * Math.sin(time * 5 - i * 1.1));
      }
    }

    // Sparks: "\ | /" strokes twinkling.
    const s = clamp01(sparks);
    this.sparkGroup.visible = s > 0.001;
    if (this.sparkGroup.visible) {
      for (let i = 0; i < this.sparks.length; i++) {
        const mesh = this.sparks[i];
        const pulse = 0.5 + 0.5 * Math.sin(time * 6 + i * 2.1);
        mesh.scale.set(1, 0.75 + 0.35 * pulse, 1);
        mesh.position.y = 0.18 + 0.03 * pulse;
        (mesh.material as THREE.Material).opacity = s * (0.6 + 0.4 * pulse);
      }
    }
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
  }
}
