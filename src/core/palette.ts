/**
 * Colours and material parameters — the single source of truth for the look.
 * Tuned against the CARE mascot design sheet (v2, 2026-08-19): a very pale
 * mint body, a dark emerald face plate, medium-green ear/side tiles and limbs,
 * green-iris eyes with small dark brows. Tweak here, not in the model code.
 */
export const PALETTE = {
  /** Very pale mint body — near-white in highlights, cool mint in shade. */
  body: "#e3f1df",
  /** Recessed plus/cross face plate — dark emerald. */
  plate: "#3f8b50",
  /** Raised ear tiles (top) and side tiles — medium green. */
  tile: "#8fd09b",
  /** Arms and feet nubs — medium green, darker than the tiles. */
  limb: "#63b672",
  /** Eyeball ground (sclera) — dark green-black, shows as the eye's rim. */
  eye: "#163322",
  /** Iris radial gradient centre → edge. */
  eyeIris: "#62c97e",
  eyeIrisEdge: "#1f7a3a",
  eyePupil: "#0b1d11",
  eyeHighlight: "#ffffff",
  /** Closed-eye arcs (blink / happy / sleepy) and eyebrows. */
  eyeLid: "#1d3b26",
  brow: "#1d3b26",
  cheek: "#f3a6a3",
  mouthInner: "#3a1414",
  mouthLine: "#1d3b26",
  tongue: "#e89a8c",
  /** Decoration strokes (zZ, bubbles, waves, sparks). */
  accent: "#4f9d5f",
  accentSoft: "#9fd4a8",
  /** Contact shadow tint. */
  shadow: "#2f5a3a",
  /** Suggested page background (matches the sheet). */
  background: "#f7f8f4",
} as const;

/** Material params for the soft "vinyl toy" look. */
export const MATERIALS = {
  body: { roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.35, sheenRoughness: 0.8 },
  plate: { roughness: 0.7, clearcoat: 0.15, clearcoatRoughness: 0.5, sheen: 0.2, sheenRoughness: 0.8 },
  tile: { roughness: 0.48, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.3, sheenRoughness: 0.8 },
  limb: { roughness: 0.48, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.3, sheenRoughness: 0.8 },
  eye: { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.06, metalness: 0 },
  cheek: { roughness: 0.75 },
} as const;
