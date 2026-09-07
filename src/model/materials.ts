/**
 * Material set for the Filly rig. Everything is derived from the palette so
 * the look can be tuned in one place (src/core/palette.ts).
 */
import * as THREE from "three";
import { MATERIALS, PALETTE } from "../core/palette";

/** Materials used by {@link FillyModel}. All are owned by whoever built them. */
export interface FillyMaterials {
  /** Pale mint body sphere (soft vinyl look). */
  body: THREE.MeshPhysicalMaterial;
  /** Recessed plus/cross face plate. */
  plate: THREE.MeshPhysicalMaterial;
  /** Dark seam between the shell and the inset plate. */
  plateShadow: THREE.MeshPhysicalMaterial;
  /** Ear and side tiles. */
  tile: THREE.MeshPhysicalMaterial;
  /** Arms and feet nubs. */
  limb: THREE.MeshPhysicalMaterial;
  /** Slightly deeper material used by the planted feet. */
  foot: THREE.MeshPhysicalMaterial;
  /** Glossy black eyeballs. */
  eye: THREE.MeshPhysicalMaterial;
  /** Soft white sclera revealed for the thinking expression. */
  eyeWhite: THREE.MeshPhysicalMaterial;
  /** Unlit white eye highlight (big, upper-left). */
  eyeHighlight: THREE.MeshBasicMaterial;
  /** Unlit soft-green secondary highlight (small, lower-right). */
  eyeHighlightSoft: THREE.MeshBasicMaterial;
  /** Closed-eye arcs (blink / happy / sleepy). Cloned per eye for opacity. */
  eyeLid: THREE.MeshStandardMaterial;
  /** Eyebrow arcs. */
  brow: THREE.MeshStandardMaterial;
  /** Soft clay blush ovals that pick up the face lighting. */
  cheek: THREE.MeshPhysicalMaterial;
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

/** Fine moulded-clay grain, kept local so the mascot also works offline. */
function clayGrain(): THREE.DataTexture {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 431;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 110 + (seed >>> 25);
    pixels.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.name = "filly-clay-grain";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function toyMaterial(
  color: string,
  params: {
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    sheen?: number;
    sheenRoughness?: number;
    metalness?: number;
    envMapIntensity?: number;
    vertexColors?: boolean;
  },
  name: string,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: params.roughness,
    metalness: params.metalness ?? 0,
    clearcoat: params.clearcoat,
    clearcoatRoughness: params.clearcoatRoughness,
    envMapIntensity: params.envMapIntensity ?? 1,
    // Baked top-light → bottom-shade gradients (see geometry.ts bakeVerticalGradient).
    vertexColors: params.vertexColors ?? false,
  });
  if (params.sheen) {
    mat.sheen = params.sheen;
    mat.sheenRoughness = params.sheenRoughness ?? 0.8;
    // Velvety rim tinted toward white so the matte surfaces glow a little.
    sheenTint.set(color).lerp(WHITE, 0.5);
    mat.sheenColor.copy(sheenTint);
  }
  mat.name = name;
  if (/^filly-(body|plate|tile|limb|foot)$/.test(name)) {
    const grain = clayGrain();
    mat.bumpMap = grain;
    mat.bumpScale = 0.006;
    mat.addEventListener("dispose", () => grain.dispose());
  }
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
  const brow = new THREE.MeshStandardMaterial({
    color: PALETTE.brow,
    roughness: 0.7,
    metalness: 0,
    name: "filly-brow",
  });
  // Rounded blush picks up the same studio lighting as the surrounding face.
  // A tiny warm fill keeps it peach even at the shaded edge of a turned pose.
  const cheek = toyMaterial(PALETTE.cheek, MATERIALS.cheek, "filly-cheek");
  cheek.transparent = true;
  cheek.depthWrite = false;
  cheek.emissive.set(PALETTE.cheek);
  cheek.emissiveIntensity = 0.035;
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
  const eyeHighlightSoft = new THREE.MeshBasicMaterial({
    color: PALETTE.eyeHighlightSoft,
    toneMapped: false,
    name: "filly-eyeHighlightSoft",
  });
  const body = toyMaterial(
    PALETTE.body,
    { ...MATERIALS.body, vertexColors: true },
    "filly-body",
  );
  // Keep the pale shell luminous without washing out its rounded form.
  body.emissive.set(PALETTE.body);
  body.emissiveIntensity = 0.015;
  const eye = toyMaterial(PALETTE.eye, MATERIALS.eye, "filly-eye");
  eye.specularIntensity = 0.25;

  return {
    body,
    plate: toyMaterial(
      PALETTE.plate,
      { ...MATERIALS.plate, vertexColors: true },
      "filly-plate",
    ),
    plateShadow: toyMaterial(
      PALETTE.plateShadow,
      {
        ...MATERIALS.plate,
        roughness: 0.82,
        clearcoat: 0,
        sheen: 0,
        vertexColors: true,
      },
      "filly-plateShadow",
    ),
    tile: toyMaterial(
      PALETTE.tile,
      { ...MATERIALS.tile, vertexColors: true },
      "filly-tile",
    ),
    limb: toyMaterial(
      PALETTE.limb,
      { ...MATERIALS.limb, vertexColors: true },
      "filly-limb",
    ),
    foot: toyMaterial(
      PALETTE.foot,
      { ...MATERIALS.limb, vertexColors: true },
      "filly-foot",
    ),
    eye,
    eyeWhite: toyMaterial(
      "#f6f5dc",
      {
        roughness: 0.32,
        clearcoat: 0.42,
        clearcoatRoughness: 0.2,
        vertexColors: false,
      },
      "filly-eyeWhite",
    ),
    eyeHighlight,
    eyeHighlightSoft,
    eyeLid,
    brow,
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
