/**
 * Colours and material parameters — the single source of truth for the look.
 * Sampled from reference/animation-states-sheet.png (albedo estimated from
 * lit/shaded pairs), so tweak here, not in the model code.
 */
export const PALETTE = {
  /** Pale mint body — reads near-white in highlights, warm mint in shade. */
  body: "#dbe7c3",
  /** Recessed plus/cross face plate. */
  plate: "#689856",
  /** Raised ear tiles (top) and side tiles — clearly greener than the body. */
  tile: "#c4dca1",
  /** Arms and feet nubs (a touch greener still). */
  limb: "#a9cf8f",
  /** Glossy black eyes. */
  eye: "#121a10",
  eyeHighlight: "#ffffff",
  /** Closed-eye arcs (blink / happy / sleepy). */
  eyeLid: "#141a12",
  cheek: "#f3c0b8",
  mouthInner: "#3a1414",
  mouthLine: "#1a1f16",
  tongue: "#e89a8c",
  /** Decoration strokes (zZ, bubbles, waves, sparks). */
  accent: "#5b8f4c",
  accentSoft: "#9cc484",
  /** Contact shadow tint. */
  shadow: "#3d5a33",
  /** Suggested page background (matches the sheet). */
  background: "#f6f6f0",
} as const;

/** Material params for the soft "vinyl toy" look. */
export const MATERIALS = {
  body: { roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.35, sheenRoughness: 0.8 },
  plate: { roughness: 0.72, clearcoat: 0.1, clearcoatRoughness: 0.5, sheen: 0.2, sheenRoughness: 0.8 },
  tile: { roughness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.28, sheen: 0.35, sheenRoughness: 0.8 },
  limb: { roughness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.28, sheen: 0.35, sheenRoughness: 0.8 },
  eye: { roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0 },
  cheek: { roughness: 0.75 },
} as const;
