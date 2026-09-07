/**
 * Soft contact shadow: a radial-gradient plane lying just below the feet.
 */
import * as THREE from "three";
import { createCanvasSurface } from "./canvas";
import type { FillyMaterials } from "./materials";

/** Shadow plane size and height (body units). */
export const SHADOW = { w: 1.85, h: 0.56, y: -1.02, opacity: 0.32 } as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Contact shadow mesh with pose-driven fade/shrink. */
export class ContactShadow {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  private readonly texture: THREE.CanvasTexture | null;
  private readonly geometry: THREE.PlaneGeometry;

  constructor(materials: FillyMaterials) {
    this.material = materials.shadow.clone();
    this.material.transparent = true;
    this.material.depthWrite = false;
    this.material.opacity = SHADOW.opacity;

    const surface = createCanvasSurface(128, 128);
    if (surface) {
      const { ctx } = surface;
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.6)");
      grad.addColorStop(0.7, "rgba(255,255,255,0.15)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      surface.texture.needsUpdate = true;
      // White gradient (RGB) × material colour = tinted shadow; alpha falls off.
      this.material.map = surface.texture;
      this.material.needsUpdate = true;
      this.texture = surface.texture;
    } else {
      this.texture = null;
      this.material.opacity = SHADOW.opacity * 0.5;
    }

    this.geometry = new THREE.PlaneGeometry(SHADOW.w, SHADOW.h);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "shadow";
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = SHADOW.y;
    this.mesh.renderOrder = -1;
  }

  /** Shrink + fade as the body rises; widen with horizontal squash. */
  update(bodyY: number, bodyScaleX: number): void {
    const lift = clamp01(bodyY);
    const s = 1 - 0.4 * lift;
    this.mesh.scale.set(s * bodyScaleX, s, 1);
    this.material.opacity = SHADOW.opacity * (1 - 0.55 * lift);
  }

  dispose(): void {
    this.texture?.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}
