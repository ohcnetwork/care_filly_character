/**
 * Blink overlay: automatic blinks every 2–6 s (10 % of them double) plus a
 * one-shot trigger. Produces an "openness" multiplier applied to
 * `eyeOpenL/R` after the springs, so it never fights the state targets.
 */
import type { Rng } from "./rng";

/** Seconds for the lid to close / to reopen. */
export const BLINK_CLOSE_DURATION = 0.13;
export const BLINK_OPEN_DURATION = 0.13;
/** Auto-blink interval range (seconds). */
export const AUTO_BLINK_MIN = 2;
export const AUTO_BLINK_MAX = 6;
/** Probability that an automatic blink is a double blink. */
export const DOUBLE_BLINK_CHANCE = 0.1;
/** `eyeArc` shown while the lids are shut during a blink ("^ ^" on the sheet). */
export const BLINK_ARC = 0.7;

type Phase = "idle" | "closing" | "opening";

export class BlinkController {
  private phase: Phase = "idle";
  private phaseTime = 0;
  private countdown = 0;
  private doublePending = false;
  /** 1 = eyes fully open, 0 = shut. */
  private open = 1;

  constructor(private readonly rng: Rng) {
    this.reset();
  }

  /** Forget any running blink and re-arm the auto timer. */
  reset(): void {
    this.phase = "idle";
    this.phaseTime = 0;
    this.open = 1;
    this.doublePending = false;
    this.countdown = this.rng.range(AUTO_BLINK_MIN, AUTO_BLINK_MAX);
  }

  /** True while a blink is in progress. */
  get active(): boolean {
    return this.phase !== "idle";
  }

  /** Current lid openness multiplier, 0..1. */
  get openness(): number {
    return this.open;
  }

  /** Seconds until the next automatic blink (if enabled). */
  get nextAutoIn(): number {
    return this.countdown;
  }

  /**
   * Start a blink now. Ignored (returns false) while one is already running.
   * Manual blinks are always single.
   */
  trigger(): boolean {
    if (this.active) return false;
    this.doublePending = false;
    this.begin();
    return true;
  }

  private begin(): void {
    this.phase = "closing";
    this.phaseTime = 0;
  }

  /**
   * Advance by `dt` seconds. When `autoEnabled` is false the automatic timer
   * is frozen (used by sleepy). Returns the openness multiplier.
   */
  update(dt: number, autoEnabled: boolean): number {
    if (!(dt > 0)) return this.open;
    if (this.phase === "idle") {
      if (autoEnabled) {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.doublePending = this.rng.chance(DOUBLE_BLINK_CHANCE);
          this.countdown = this.rng.range(AUTO_BLINK_MIN, AUTO_BLINK_MAX);
          this.begin();
        }
      }
      if (this.phase === "idle") return this.open;
    }

    this.phaseTime += dt;
    if (this.phase === "closing") {
      const u = Math.min(1, this.phaseTime / BLINK_CLOSE_DURATION);
      this.open = 1 - u * u; // ease-in close
      if (u >= 1) {
        this.phase = "opening";
        this.phaseTime = 0;
        this.open = 0;
      }
    } else {
      const u = Math.min(1, this.phaseTime / BLINK_OPEN_DURATION);
      const r = 1 - u;
      this.open = 1 - r * r; // ease-out open
      if (u >= 1) {
        this.open = 1;
        if (this.doublePending) {
          this.doublePending = false;
          this.begin();
        } else {
          this.phase = "idle";
          this.phaseTime = 0;
        }
      }
    }
    return this.open;
  }
}
