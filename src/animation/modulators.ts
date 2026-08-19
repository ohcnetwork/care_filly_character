/**
 * Procedural motion layered on top of the static {@link STATE_TARGETS}.
 *
 * Two kinds of modulation:
 * - **target offsets** (slow, e.g. the idle glance) are added to the spring
 *   targets so they ease naturally;
 * - **overlays** (breathing, bounce, tremble, syllables…) are added *after*
 *   the springs, scaled by a smoothed per-state weight, because the springs
 *   would otherwise filter the faster motion away.
 */
import type { FillyPose, FillyState } from "../core/types";
import type { Rng } from "./rng";
import { MouthEnvelope } from "./talking";

const TAU = Math.PI * 2;

/** Happy bounce period (seconds) and height (body radii). */
export const BOUNCE_PERIOD = 0.7;
export const BOUNCE_HEIGHT = 0.2;

/** Random glance used in idle: wait 2–5 s, look somewhere for ~1 s, return. */
class GlanceEngine {
  x = 0;
  y = 0;
  private holding = false;
  private timer = 0;

  constructor(private readonly rng: Rng) {}

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.holding = false;
    this.timer = this.rng.range(2, 5);
  }

  step(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.holding) {
      this.x = 0;
      this.y = 0;
      this.holding = false;
      this.timer = this.rng.range(2, 5);
    } else {
      this.x = this.rng.symmetric(0.5);
      this.y = this.rng.range(-0.2, 0.4);
      this.holding = true;
      this.timer = this.rng.range(0.5, 1.2);
    }
  }
}

/** Fires a decaying 0..1 envelope at random intervals (thinking "hmm" bob). */
class RandomImpulse {
  env = 0;
  private timer = 0;

  constructor(
    private readonly rng: Rng,
    private readonly minWait: number,
    private readonly maxWait: number,
    private readonly tau: number,
  ) {}

  reset(): void {
    this.env = 0;
    this.timer = this.rng.range(this.minWait, this.maxWait);
  }

  step(dt: number): void {
    this.env *= Math.exp(-dt / this.tau);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.env = 1;
      this.timer = this.rng.range(this.minWait, this.maxWait);
    }
  }
}

/**
 * Owns every per-state procedural engine. One instance per animator; all
 * randomness goes through the shared seeded {@link Rng}.
 */
export class StateModulator {
  readonly mouth: MouthEnvelope;
  private readonly glance: GlanceEngine;
  private readonly hmm: RandomImpulse;

  constructor(rng: Rng) {
    this.mouth = new MouthEnvelope(rng);
    this.glance = new GlanceEngine(rng);
    this.hmm = new RandomImpulse(rng, 2.5, 5, 0.18);
    this.reset();
  }

  reset(): void {
    this.mouth.reset();
    this.glance.reset();
    this.hmm.reset();
  }

  /** Called when the animator switches into `state`. */
  enter(state: FillyState): void {
    if (state === "idle") this.glance.reset();
    else if (state === "talking") this.mouth.reset();
    else if (state === "thinking") this.hmm.reset();
  }

  /** Advance the engines that belong to the *current* state. */
  step(state: FillyState, dt: number, audioLevel: number | null): void {
    if (state === "idle") this.glance.step(dt);
    else if (state === "talking") this.mouth.step(dt, audioLevel);
    else if (state === "thinking") this.hmm.step(dt);
  }

  /** Slow offsets added to the spring targets (only for the current state). */
  applyTargetOffsets(state: FillyState, target: FillyPose): void {
    if (state === "idle") {
      target.eyeLookX += this.glance.x;
      target.eyeLookY += this.glance.y;
    }
  }

  /**
   * Add the post-spring overlay of `state`, scaled by weight `w` (0..1).
   * @param t  time since `state` was last entered
   * @param T  global animator time (for free-running loops)
   */
  applyOverlay(
    state: FillyState,
    w: number,
    t: number,
    T: number,
    audioLevel: number | null,
    pose: FillyPose,
  ): void {
    switch (state) {
      case "idle": {
        const b = Math.sin(TAU * 0.25 * T);
        pose.bodyScaleY += 0.015 * b * w;
        pose.bodyScaleX -= 0.008 * b * w;
        pose.bodyY += 0.01 * Math.sin(TAU * 0.25 * T + 0.6) * w;
        pose.bodyYaw += 0.03 * Math.sin(TAU * 0.08 * T) * w;
        break;
      }
      case "listening": {
        const gain = 0.3 + (audioLevel ?? 0);
        const wig = 0.06 * Math.sin(TAU * 3 * t) * gain * w;
        pose.earL += wig;
        pose.earR += wig;
        pose.bodyRoll += 0.05 * Math.sin(TAU * 0.4 * T) * w;
        break;
      }
      case "talking": {
        const open = this.mouth.value;
        pose.mouthOpen += open * w;
        pose.mouthWide += 0.15 * open * w;
        pose.bodyY += 0.01 * open * w;
        pose.bodyPitch += 0.03 * this.mouth.nod * w;
        break;
      }
      case "happy": {
        const p = (t / BOUNCE_PERIOD) % 1;
        const s = Math.sin(Math.PI * p); // 0 at contact, 1 at apex
        const sq = (1 - s) * (1 - s) * (1 - s); // sharp squash at contact
        const swing = Math.sin(TAU * p); // + while rising, − while falling
        pose.bodyY += BOUNCE_HEIGHT * s * w;
        pose.bodyScaleX += (0.14 * sq - 0.06 * s) * w;
        pose.bodyScaleY += (-0.14 * sq + 0.08 * s) * w;
        pose.earL += -0.2 * swing * w;
        pose.earR += -0.2 * swing * w;
        pose.armL += 0.3 * swing * w;
        pose.armR += 0.3 * swing * w;
        break;
      }
      case "thinking": {
        pose.eyeLookX += 0.1 * Math.sin(TAU * 0.2 * T) * w;
        pose.eyeLookY += 0.1 * Math.cos(TAU * 0.16 * T) * w;
        pose.bodyPitch += 0.05 * this.hmm.env * w;
        break;
      }
      case "surprised": {
        const decay = Math.exp(-t / 0.6);
        pose.bodyRoll += 0.01 * Math.sin(TAU * 12 * t) * decay * w;
        break;
      }
      case "sleepy": {
        const b = Math.sin(TAU * 0.12 * T);
        pose.bodyScaleY += 0.03 * b * w;
        pose.bodyScaleX -= 0.015 * b * w;
        pose.bodyRoll += 0.02 * Math.sin(TAU * 0.1 * T) * w;
        break;
      }
    }
  }
}
