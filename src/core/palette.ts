/**
 * Colours and material parameters — the single source of truth for the look.
 * Matched to the CARE mascot hero illustration (2026-08-19): a wide pale-mint
 * oval body, a dark emerald cross plate with a light notch between two flat
 * green ear tabs, square side tiles, solid black glossy eyes, tone-on-tone
 * green cheeks, an open smile with a green tongue, chunky green arms/feet and
 * soft, almost flat lighting. Tweak here, not in the model code.
 */
export const PALETTE = {
  /** Very pale mint body. */
  body: "#ddefd8",
  /** Recessed cross face plate — dark emerald. */
  plate: "#33904b",
  /** Ear tabs and side tiles — medium spring green. */
  tile: "#7ccd8d",
  /** Arms and feet — a step darker than the tiles. */
  limb: "#5fbb72",
  /** Solid glossy eye — near-black with a green cast. */
  eye: "#0e2415",
  /** Unused when the eye is solid; kept for the optional iris texture. */
  eyeIris: "#62c97e",
  eyeIrisEdge: "#1f7a3a",
  eyePupil: "#0b1d11",
  eyeHighlight: "#ffffff",
  /** Small secondary highlight — a soft light green, like the hero image. */
  eyeHighlightSoft: "#a9e2b2",
  /** Closed-eye arcs (blink / happy / sleepy) and (optional) eyebrows. */
  eyeLid: "#0e2415",
  brow: "#0e2415",
  /** Cheeks are tone-on-tone green ovals on the plate (the sheet uses pink: try "#f0aeaa"). */
  cheek: "#62bd74",
  mouthInner: "#0f2a18",
  mouthLine: "#0f2a18",
  tongue: "#5fbb72",
  /** Decoration strokes (zZ, bubbles, waves, sparks). */
  accent: "#3f9a55",
  accentSoft: "#9fd4a8",
  /** Contact shadow tint. */
  shadow: "#2f4a35",
  /** Suggested page background (hero image is on near-white). */
  background: "#fafcf8",
} as const;

/** Material params — soft matte vinyl, very little specular (hero is almost flat-shaded). */
export const MATERIALS = {
  body: { roughness: 0.72, clearcoat: 0.18, clearcoatRoughness: 0.5, sheen: 0.25, sheenRoughness: 0.9 },
  plate: { roughness: 0.82, clearcoat: 0.05, clearcoatRoughness: 0.6, sheen: 0.1, sheenRoughness: 0.9 },
  tile: { roughness: 0.68, clearcoat: 0.2, clearcoatRoughness: 0.5, sheen: 0.2, sheenRoughness: 0.9 },
  limb: { roughness: 0.68, clearcoat: 0.2, clearcoatRoughness: 0.5, sheen: 0.2, sheenRoughness: 0.9 },
  eye: { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0 },
  cheek: { roughness: 0.8 },
} as const;
