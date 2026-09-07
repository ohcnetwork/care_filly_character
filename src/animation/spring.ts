/**
 * Damped spring used to smooth every pose parameter. Integrated with
 * semi-implicit (symplectic) Euler in fixed sub-steps so a frame of up to
 * `MAX_DT` seconds stays stable even for the stiffest presets.
 */
import type { PoseKey } from "../core/types";

export interface SpringConfig {
  /** Stiffness k (higher = faster). */
  stiffness: number;
  /** Damping c (2·√k = critically damped). */
  damping: number;
}

/** Largest frame delta the animation layer will integrate in one call. */
export const MAX_DT = 0.1;
/** Largest integration sub-step (240 Hz). */
export const MAX_SUBSTEP = 1 / 240;

/** Damping value that makes a spring of stiffness `k` critically damped. */
export function criticallyDamped(stiffness: number): number {
  return 2 * Math.sqrt(stiffness);
}

/** Tuning presets referenced by the per-key table below. */
export const SPRING_PRESETS = {
  /** Mouth / eyes: snappy. */
  fast: { stiffness: 260, damping: 24 },
  /** Body / ears / arms / cheeks. */
  medium: { stiffness: 120, damping: 16 },
  /** Decorations fade in and out lazily. */
  slow: { stiffness: 40, damping: 12 },
  /** Pointer follow (gaze / head turn). */
  pointer: { stiffness: 60, damping: 12 },
  /** State-presence weights for procedural overlays (critically damped, no overshoot). */
  weight: { stiffness: 80, damping: criticallyDamped(80) },
} as const satisfies Record<string, SpringConfig>;

/** Spring tuning for every pose parameter. */
export const POSE_SPRING_CONFIG: Readonly<Record<PoseKey, SpringConfig>> =
  Object.freeze({
    bodyY: SPRING_PRESETS.medium,
    bodyScaleX: SPRING_PRESETS.medium,
    bodyScaleY: SPRING_PRESETS.medium,
    bodyPitch: SPRING_PRESETS.medium,
    bodyYaw: SPRING_PRESETS.medium,
    bodyRoll: SPRING_PRESETS.medium,
    earL: SPRING_PRESETS.medium,
    earR: SPRING_PRESETS.medium,
    armL: SPRING_PRESETS.medium,
    armR: SPRING_PRESETS.medium,
    armLChin: SPRING_PRESETS.medium,
    eyeOpenL: SPRING_PRESETS.fast,
    eyeOpenR: SPRING_PRESETS.fast,
    eyeArc: SPRING_PRESETS.fast,
    eyeLookX: SPRING_PRESETS.fast,
    eyeLookY: SPRING_PRESETS.fast,
    eyeScale: SPRING_PRESETS.fast,
    eyeWhite: SPRING_PRESETS.fast,
    browL: SPRING_PRESETS.fast,
    browR: SPRING_PRESETS.fast,
    mouthOpen: SPRING_PRESETS.fast,
    mouthWide: SPRING_PRESETS.fast,
    mouthSmile: SPRING_PRESETS.fast,
    mouthRound: SPRING_PRESETS.fast,
    cheek: SPRING_PRESETS.medium,
    zzz: SPRING_PRESETS.slow,
    bubbles: SPRING_PRESETS.slow,
    waves: SPRING_PRESETS.slow,
    sparks: SPRING_PRESETS.slow,
  });

/**
 * One-dimensional damped spring.
 *
 * ```ts
 * const s = new Spring(0, SPRING_PRESETS.fast);
 * s.target = 1;
 * s.update(1 / 60); // → s.value moves toward 1
 * ```
 */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  stiffness: number;
  damping: number;

  constructor(value = 0, config: SpringConfig = SPRING_PRESETS.medium) {
    this.value = value;
    this.target = value;
    this.stiffness = config.stiffness;
    this.damping = config.damping;
  }

  /** Replace the tuning. */
  configure(config: SpringConfig): this {
    this.stiffness = config.stiffness;
    this.damping = config.damping;
    return this;
  }

  /** Teleport: value = target = `v`, velocity = 0. */
  snap(v: number = this.target): this {
    this.value = v;
    this.target = v;
    this.velocity = 0;
    return this;
  }

  /** Add an instantaneous velocity impulse (used for "enter" pops). */
  kick(dv: number): this {
    this.velocity += dv;
    return this;
  }

  /** True when the spring is effectively at rest on its target. */
  settled(epsilon = 1e-4): boolean {
    return (
      Math.abs(this.value - this.target) < epsilon &&
      Math.abs(this.velocity) < epsilon
    );
  }

  /**
   * Advance by `dt` seconds (clamped to `[0, MAX_DT]`, sub-stepped) and
   * return the new value.
   */
  update(dt: number): number {
    if (!(dt > 0)) return this.value; // also rejects NaN
    if (dt > MAX_DT) dt = MAX_DT;
    const n = Math.ceil(dt / MAX_SUBSTEP);
    const h = dt / n;
    const k = this.stiffness;
    const c = this.damping;
    let x = this.value;
    let v = this.velocity;
    const t = this.target;
    for (let i = 0; i < n; i++) {
      v += (k * (t - x) - c * v) * h;
      x += v * h;
    }
    this.value = x;
    this.velocity = v;
    return x;
  }
}

/**
 * Asymmetric exponential follower (fast attack, slower release). Returns the
 * new value. Used for audio envelopes where springs would ring.
 */
export function follow(
  current: number,
  target: number,
  dt: number,
  attackTau: number,
  releaseTau: number,
): number {
  const tau = target > current ? attackTau : releaseTau;
  if (tau <= 0) return target;
  const a = 1 - Math.exp(-dt / tau);
  return current + (target - current) * a;
}
