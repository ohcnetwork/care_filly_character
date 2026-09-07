/**
 * Colours and material parameters — the single source of truth for the look.
 * The supplied mascot sheet supplies the mint shell, forest-green face,
 * blush, and softly polished clay treatment.
 */
export const PALETTE = {
  /** Warm near-white mint shell. */
  body: "#d9efc3",
  /** Deep green face insert from the mascot reference. */
  plate: "#287d43",
  /** Dark ambient-occlusion seam just inside the shell opening. */
  plateShadow: "#205831",
  /** Soft green articulated pixel cushions. */
  tile: "#73af6d",
  /** Character-only appendages stay secondary to the five logo pieces. */
  limb: "#348d4d",
  foot: "#2e8347",
  /** Solid glossy eye — almost black with a warm green cast. */
  eye: "#102c18",
  /** Unused when the eye is solid; kept for the optional iris texture. */
  eyeIris: "#70bd53",
  eyeIrisEdge: "#1f7a3a",
  eyePupil: "#0b1d11",
  eyeHighlight: "#fbf9e9",
  /** Small reflected glint near the bottom of the eye. */
  eyeHighlightSoft: "#b6d993",
  /** Closed-eye arcs (blink / happy / sleepy) and (optional) eyebrows. */
  eyeLid: "#113b20",
  brow: "#113b20",
  /** Peach-pink blush ovals from the animation sheet. */
  cheek: "#efb795",
  mouthInner: "#102d1b",
  mouthLine: "#123d22",
  tongue: "#ec9873",
  /** Decoration strokes (zZ, bubbles, waves, sparks). */
  accent: "#5a9d58",
  accentSoft: "#a9cb8d",
  /** Contact shadow tint. */
  shadow: "#60824a",
  /** Suggested page background (hero image is on near-white). */
  background: "#faf9f6",
} as const;

/** Material params — satin clay with soft, broad highlights. */
export const MATERIALS = {
  body: {
    roughness: 0.79,
    clearcoat: 0.06,
    clearcoatRoughness: 0.48,
    sheen: 0.3,
    sheenRoughness: 0.84,
  },
  plate: {
    roughness: 0.8,
    clearcoat: 0.1,
    clearcoatRoughness: 0.52,
    sheen: 0.16,
    sheenRoughness: 0.86,
  },
  tile: {
    roughness: 0.7,
    clearcoat: 0.1,
    clearcoatRoughness: 0.44,
    sheen: 0.28,
    sheenRoughness: 0.82,
  },
  limb: {
    roughness: 0.74,
    clearcoat: 0.08,
    clearcoatRoughness: 0.46,
    sheen: 0.26,
    sheenRoughness: 0.84,
  },
  eye: {
    roughness: 0.3,
    clearcoat: 0.18,
    clearcoatRoughness: 0.18,
    metalness: 0,
    envMapIntensity: 0.12,
  },
  cheek: {
    roughness: 0.72,
    clearcoat: 0.06,
    clearcoatRoughness: 0.64,
    sheen: 0.18,
    sheenRoughness: 0.9,
  },
} as const;
