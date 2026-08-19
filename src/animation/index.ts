/**
 * Animation layer — pure TypeScript, no three.js / DOM. Produces a
 * `FillyPose` per frame from a `FillyState` plus live inputs.
 */
export { FillyAnimator, type FillyAnimatorOptions, type InteractionHint } from "./FillyAnimator";
export {
  Spring,
  SPRING_PRESETS,
  POSE_SPRING_CONFIG,
  MAX_DT,
  MAX_SUBSTEP,
  criticallyDamped,
  follow,
  type SpringConfig,
} from "./spring";
export { Rng, mulberry32 } from "./rng";
export { STATE_TARGETS, POINTER_FOLLOW_WEIGHT, stateEyesOpen, copyPose } from "./states";
export { StateModulator, BOUNCE_PERIOD, BOUNCE_HEIGHT } from "./modulators";
export { MouthEnvelope, TALK_MIN_OPEN, TALK_MAX_SYNTH_OPEN } from "./talking";
export {
  BlinkController,
  BLINK_ARC,
  BLINK_CLOSE_DURATION,
  BLINK_OPEN_DURATION,
  AUTO_BLINK_MIN,
  AUTO_BLINK_MAX,
  DOUBLE_BLINK_CHANCE,
} from "./blink";
export { mapStatusToState, type FillyStatus, type MapStatusOptions } from "./mapStatus";
