/**
 * Tiny canvas helpers. Canvas textures need a DOM; in node / vitest the
 * builders return null and the callers fall back to flat materials so the
 * model can still be constructed and posed headlessly.
 */
import * as THREE from "three";

/** True when a 2D canvas can be created (browser / jsdom). */
export function hasCanvas(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

export interface CanvasSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

/** Create a canvas + 2D context + CanvasTexture, or null without a DOM. */
export function createCanvasSurface(width: number, height: number): CanvasSurface | null {
  if (!hasCanvas()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { canvas, ctx, texture };
}
