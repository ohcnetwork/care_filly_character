/**
 * Material set for the Filly rig. Everything is derived from the palette so
 * the look can be tuned in one place (src/core/palette.ts).
 */
import * as THREE from "three";
import { MATERIALS, PALETTE } from "@/core/palette";

/** Materials used by {@link FillyModel}. All are owned by whoever built them. */
export interface FillyMaterials {
  /** Pale mint body sphere (soft vinyl look). */
  body: THREE.MeshPhysicalMaterial;
  /** Recessed plus/cross face plate. */
  plate: THREE.MeshPhysicalMaterial;
  /** Ear and side tiles. */
  tile: THREE.MeshPhysicalMaterial;
  /** Arms and feet nubs. */
  limb: THREE.MeshPhysicalMaterial;
  /** Glossy black eyeballs. */
  eye: THREE.MeshPhysicalMaterial;
  /** Unlit white eye highlights. */
  eyeHighlight: THREE.MeshBasicMaterial;
  /** Closed-eye arcs (blink / happy / sleepy). Cloned per eye for opacity. */
  eyeLid: THREE.MeshStandardMaterial;
  /** Blush discs. */
  cheek: THREE.MeshStandardMaterial;
  /** Mouth decal (canvas texture is attached per instance). */
  mouth: THREE.MeshBasicMaterial;
  /** Decoration strokes (zZ / bubbles / waves / sparks). Cloned per element. */
  accent: THREE.MeshBasicMaterial;
  /** Contact shadow (radial gradient texture is attached per instance). */
  shadow: THREE.MeshBasicMaterial;
}

export type FillyMaterialKey = keyof FillyMaterials;

const sheenTint = new THREE.Color();
const WHITE = new THREE.Color("#ffffff");

function toyMaterial(
  color: string,
  params: {
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    sheen?: number;
    sheenRoughness?: number;
    metalness?: number;
  },
  name: string,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: params.roughness,
    metalness: params.metalness ?? 0,
    clearcoat: params.clearcoat,
    clearcoatRoughness: params.clearcoatRoughness,
  });
  if (params.sheen) {
    mat.sheen = params.sheen;
    mat.sheenRoughness = params.sheenRoughness ?? 0.8;
    // Velvety rim tinted toward white so the matte surfaces glow a little.
    sheenTint.set(color).lerp(WHITE, 0.5);
    mat.sheenColor.copy(sheenTint);
  }
  mat.name = name;
  return mat;
}

/**
 * Build a fresh set of materials for one Filly. The caller owns them; pass
 * them to `new FillyModel({ materials })` and dispose when done (FillyModel
 * disposes the materials it built itself).
 */
export function buildFillyMaterials(): FillyMaterials {
  const eyeLid = new THREE.MeshStandardMaterial({
    color: PALETTE.eyeLid,
    roughness: 0.6,
    metalness: 0,
    transparent: true,
    opacity: 0,
    name: "filly-eyeLid",
  });
  // Blush reads as flat solid pink on the sheet: mostly self-lit so the scene
  // lighting and tone mapping cannot grey it out.
  const cheek = new THREE.MeshStandardMaterial({
    color: PALETTE.cheek,
    emissive: PALETTE.cheek,
    emissiveIntensity: 0.55,
    roughness: MATERIALS.cheek.roughness,
    metalness: 0,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    name: "filly-cheek",
  });
  const mouth = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    name: "filly-mouth",
  });
  const accent = new THREE.MeshBasicMaterial({
    color: PALETTE.accent,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    name: "filly-accent",
  });
  const shadow = new THREE.MeshBasicMaterial({
    color: PALETTE.shadow,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    name: "filly-shadow",
  });
  const eyeHighlight = new THREE.MeshBasicMaterial({
    color: PALETTE.eyeHighlight,
    toneMapped: false,
    name: "filly-eyeHighlight",
  });

  return {
    body: toyMaterial(PALETTE.body, MATERIALS.body, "filly-body"),
    plate: toyMaterial(PALETTE.plate, MATERIALS.plate, "filly-plate"),
    tile: toyMaterial(PALETTE.tile, MATERIALS.tile, "filly-tile"),
    limb: toyMaterial(PALETTE.limb, MATERIALS.limb, "filly-limb"),
    eye: toyMaterial(PALETTE.eye, MATERIALS.eye, "filly-eye"),
    eyeHighlight,
    eyeLid,
    cheek,
    mouth,
    accent,
    shadow,
  };
}

/** Dispose every material in a set. */
export function disposeFillyMaterials(materials: FillyMaterials): void {
  for (const key of Object.keys(materials) as FillyMaterialKey[]) {
    materials[key].dispose();
  }
}
