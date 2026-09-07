/**
 * Core contract shared by the animation layer (produces poses) and the model
 * layer (renders poses). Keep this file dependency-free.
 */

/** Continuous animation states. Blink is an overlay, not a state. */
export const FILLY_STATES = [
  "idle",
  "listening",
  "talking",
  "happy",
  "thinking",
  "surprised",
  "sleepy",
] as const;

export type FillyState = (typeof FILLY_STATES)[number];

export function isFillyState(value: unknown): value is FillyState {
  return (
    typeof value === "string" &&
    (FILLY_STATES as readonly string[]).includes(value)
  );
}

/**
 * Every continuously-animated parameter describing the character at one
 * instant. All numbers, so each can be spring-smoothed independently.
 *
 * Units: body radius = 1. Rotations in radians. 0..1 for blend factors.
 */
export interface FillyPose {
  // ── body ────────────────────────────────────────────────────────────────
  /** Vertical offset of the whole character (bounce / jump). */
  bodyY: number;
  /** Squash & stretch scale (x/z share bodyScaleX; y is bodyScaleY). */
  bodyScaleX: number;
  bodyScaleY: number;
  /** Nod (x-axis rotation, + = look down / lean forward). */
  bodyPitch: number;
  /** Turn (y-axis rotation, + = turn to viewer's right). */
  bodyYaw: number;
  /** Tilt (z-axis rotation, + = tilt head to viewer's left). */
  bodyRoll: number;

  // ── ears (top tiles) ────────────────────────────────────────────────────
  /** Rotation about tile base; + = perk outward/up, − = droop. */
  earL: number;
  earR: number;

  // ── arms ────────────────────────────────────────────────────────────────
  /** Arm raise, radians. 0 = resting. */
  armL: number;
  armR: number;
  /** 0..1 blend of the "hand to chin" thinking pose (uses the viewer's-left arm). */
  armLChin: number;

  // ── eyes ────────────────────────────────────────────────────────────────
  /** 0 closed .. 1 open. */
  eyeOpenL: number;
  eyeOpenR: number;
  /** Shape used when eyes are closed: −1 sleepy "︶", 0 flat "—", +1 happy "^". */
  eyeArc: number;
  /** Gaze offset, roughly −1..1 (scaled internally to a small displacement). */
  eyeLookX: number;
  eyeLookY: number;
  /** Uniform eye scale; >1 = wide (surprised). */
  eyeScale: number;
  /** 0 = glossy black jewel eye, 1 = white sclera with a small pupil (thinking). */
  eyeWhite: number;
  /** Brow tilt hint (−1 worried/inner-up .. +1 angry/inner-down); subtle lid rotation. */
  browL: number;
  browR: number;

  // ── mouth ───────────────────────────────────────────────────────────────
  /** 0 closed .. 1 fully open. */
  mouthOpen: number;
  /** Width multiplier, 1 = default. */
  mouthWide: number;
  /** −1 frown .. +1 smile. */
  mouthSmile: number;
  /** 0..1 blend toward a round "o" shape. */
  mouthRound: number;

  // ── cheeks ──────────────────────────────────────────────────────────────
  /** Legacy 0..1 blush intensity; retained for compatibility, no longer rendered. */
  cheek: number;

  // ── decorations (opacity 0..1) ──────────────────────────────────────────
  zzz: number;
  bubbles: number;
  waves: number;
  sparks: number;
}

export type PoseKey = keyof FillyPose;

export const DEFAULT_POSE: Readonly<FillyPose> = Object.freeze({
  bodyY: 0,
  bodyScaleX: 1,
  bodyScaleY: 1,
  bodyPitch: 0,
  bodyYaw: 0,
  bodyRoll: 0,
  earL: 0,
  earR: 0,
  armL: 0,
  armR: 0,
  armLChin: 0,
  eyeOpenL: 1,
  eyeOpenR: 1,
  eyeArc: 1,
  eyeLookX: 0,
  eyeLookY: 0,
  eyeScale: 1,
  eyeWhite: 0,
  browL: 0,
  browR: 0,
  mouthOpen: 0.42,
  mouthWide: 1,
  mouthSmile: 0.8,
  mouthRound: 0.15,
  cheek: 0.95,
  zzz: 0,
  bubbles: 0,
  waves: 0,
  sparks: 0,
});

export const POSE_KEYS = Object.keys(DEFAULT_POSE) as PoseKey[];

/** Mutable copy of the default pose. */
export function createPose(overrides: Partial<FillyPose> = {}): FillyPose {
  return { ...DEFAULT_POSE, ...overrides };
}

/** Sanity ranges used by tests and by the model to clamp inputs. */
export const POSE_BOUNDS: Readonly<Record<PoseKey, readonly [number, number]>> =
  Object.freeze({
    bodyY: [-0.5, 1],
    bodyScaleX: [0.6, 1.5],
    bodyScaleY: [0.6, 1.5],
    bodyPitch: [-0.6, 0.6],
    bodyYaw: [-0.8, 0.8],
    bodyRoll: [-0.6, 0.6],
    earL: [-0.8, 0.8],
    earR: [-0.8, 0.8],
    armL: [-0.5, 2.5],
    armR: [-0.5, 2.5],
    armLChin: [0, 1],
    eyeOpenL: [0, 1],
    eyeOpenR: [0, 1],
    eyeArc: [-1, 1],
    eyeLookX: [-1, 1],
    eyeLookY: [-1, 1],
    eyeScale: [0.6, 1.6],
    eyeWhite: [0, 1],
    browL: [-1, 1],
    browR: [-1, 1],
    mouthOpen: [0, 1],
    mouthWide: [0.4, 1.8],
    mouthSmile: [-1, 1],
    mouthRound: [0, 1],
    cheek: [0, 1],
    zzz: [0, 1],
    bubbles: [0, 1],
    waves: [0, 1],
    sparks: [0, 1],
  });

export function clampPose(pose: FillyPose): FillyPose {
  for (const key of POSE_KEYS) {
    const [lo, hi] = POSE_BOUNDS[key];
    const v = pose[key];
    pose[key] = v < lo ? lo : v > hi ? hi : v;
  }
  return pose;
}
