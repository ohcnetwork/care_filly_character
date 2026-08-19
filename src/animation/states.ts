/**
 * Static target pose per {@link FillyState}. These are the "rest" values the
 * springs chase; the procedural loops live in `modulators.ts`.
 *
 * Conventions (see `FillyPose`): `eyeLookX` + = viewer's right, `eyeLookY` +
 * = up; `bodyPitch` + = lean toward the viewer / look down.
 */
import { DEFAULT_POSE, POSE_KEYS, type FillyPose, type FillyState } from "../core/types";

/** Idle is the neutral sheet pose: small closed smile, cheeks .7, brows relaxed. */
const IDLE: Readonly<FillyPose> = DEFAULT_POSE;

const LISTENING: Readonly<FillyPose> = Object.freeze({
  ...DEFAULT_POSE,
  earL: 0.22,
  earR: 0.22,
  bodyPitch: 0.04,
  bodyYaw: -0.05,
  bodyRoll: 0.1,
  armR: 1.35,
  eyeScale: 1.06,
  mouthOpen: 0,
  mouthSmile: 0.9,
  mouthWide: 1,
  waves: 1,
  cheek: 0.6,
});

/** Talking's mouth opening is driven entirely by the procedural envelope. */
const TALKING: Readonly<FillyPose> = Object.freeze({
  ...DEFAULT_POSE,
  mouthOpen: 0,
  mouthSmile: 0.7,
  mouthWide: 1.15,
  bodyYaw: 0.05,
  armR: 1.1,
  sparks: 0.5,
  cheek: 0.7,
});

const HAPPY: Readonly<FillyPose> = Object.freeze({
  ...DEFAULT_POSE,
  eyeOpenL: 0,
  eyeOpenR: 0,
  eyeArc: 1,
  eyeScale: 1.05,
  mouthOpen: 0.8,
  mouthWide: 1.25,
  mouthSmile: 1,
  cheek: 1,
  bodyRoll: 0.06,
  armL: 1.25,
  armR: 1.25,
});

const THINKING: Readonly<FillyPose> = Object.freeze({
  ...DEFAULT_POSE,
  eyeLookX: 0.7,
  eyeLookY: 0.6,
  mouthSmile: -0.5,
  mouthOpen: 0,
  mouthWide: 0.6,
  browL: -0.6,
  browR: -0.6,
  armLChin: 1,
  armL: 0.6,
  bodyRoll: -0.06,
  bodyPitch: 0.03,
  bubbles: 1,
  cheek: 0.5,
});

const SURPRISED: Readonly<FillyPose> = Object.freeze({
  ...DEFAULT_POSE,
  eyeScale: 1.28,
  eyeOpenL: 1,
  eyeOpenR: 1,
  eyeLookX: 0,
  eyeLookY: 0,
  mouthRound: 1,
  mouthOpen: 0.9,
  mouthWide: 1,
  mouthSmile: 0,
  earL: 0.3,
  earR: 0.3,
  armL: 1.0,
  armR: 1.0,
  sparks: 1,
  cheek: 0.5,
  bodyPitch: -0.05,
});

const SLEEPY: Readonly<FillyPose> = Object.freeze({
  ...DEFAULT_POSE,
  eyeOpenL: 0,
  eyeOpenR: 0,
  eyeArc: -1,
  mouthRound: 0,
  mouthOpen: 0,
  mouthWide: 0.7,
  mouthSmile: 0.6,
  bodyPitch: 0.05,
  bodyY: -0.03,
  bodyScaleX: 1.06,
  bodyScaleY: 0.94,
  earL: -0.18,
  earR: -0.18,
  armL: 0.45,
  armR: -0.1,
  zzz: 1,
  cheek: 0.4,
});

/** Static target pose for every state. */
export const STATE_TARGETS: Readonly<Record<FillyState, Readonly<FillyPose>>> = Object.freeze({
  idle: IDLE,
  listening: LISTENING,
  talking: TALKING,
  happy: HAPPY,
  thinking: THINKING,
  surprised: SURPRISED,
  sleepy: SLEEPY,
});

/** Per-state multiplier applied to pointer follow (0 = disabled). */
export const POINTER_FOLLOW_WEIGHT: Readonly<Record<FillyState, number>> = Object.freeze({
  idle: 1,
  listening: 1,
  talking: 1,
  happy: 0.4,
  thinking: 0.5,
  surprised: 0.4,
  sleepy: 0,
});

/** True when the state's eyes are nominally open (blink overlay applies). */
export function stateEyesOpen(state: FillyState): boolean {
  return STATE_TARGETS[state].eyeOpenL > 0.5;
}

/** Copy `src` into `dst` key by key (no allocation). */
export function copyPose(dst: FillyPose, src: Readonly<FillyPose>): FillyPose {
  for (let i = 0; i < POSE_KEYS.length; i++) {
    const k = POSE_KEYS[i];
    dst[k] = src[k];
  }
  return dst;
}
