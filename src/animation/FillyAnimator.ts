/**
 * FillyAnimator — pure-TypeScript state machine that turns a
 * {@link FillyState} (+ audio level, pointer, interaction hints) into a
 * continuously animated {@link FillyPose}. No three.js, no DOM.
 *
 * Pipeline per `update(dt)`:
 * 1. target = STATE_TARGETS[state] + slow modulation + pointer follow + hint
 * 2. one spring per pose key chases its target
 * 3. procedural overlays (breathe / bounce / syllables / tremble…) are added,
 *    each scaled by a smoothed per-state weight so they cross-fade
 * 4. blink overlay multiplies eyeOpenL/R, then `clampPose`
 *
 * Everything random goes through a seeded {@link Rng}: same seed + same `dt`
 * sequence ⇒ identical poses.
 */
import {
  FILLY_STATES,
  POSE_KEYS,
  clampPose,
  createPose,
  type FillyPose,
  type FillyState,
} from "@/core/types";
import { BLINK_ARC, BlinkController } from "./blink";
import { StateModulator } from "./modulators";
import { Rng } from "./rng";
import { MAX_DT, POSE_SPRING_CONFIG, SPRING_PRESETS, Spring } from "./spring";
import { POINTER_FOLLOW_WEIGHT, STATE_TARGETS, copyPose, stateEyesOpen } from "./states";

export type InteractionHint = "none" | "hover" | "pressed";

export interface FillyAnimatorOptions {
  /** PRNG seed (default 1). */
  seed?: number;
  /** Automatic blinking (default true). Never blinks in `sleepy` regardless. */
  autoBlink?: boolean;
  /** Starting state (default `'idle'`); springs start settled on its target. */
  initialState?: FillyState;
}

/** Pointer-follow gains (see spec §4.4). */
const POINTER_EYE_GAIN = 0.35;
const POINTER_YAW_GAIN = 0.12;
const POINTER_PITCH_GAIN = 0.08;
/** Extra gaze gain while hovered. */
const HOVER_EYE_BOOST = 1.4;

/** Overlay weights below this are skipped entirely. */
const WEIGHT_EPSILON = 1e-3;

export class FillyAnimator {
  private readonly rng: Rng;
  private readonly autoBlink: boolean;
  private readonly initialState: FillyState;

  private _state: FillyState;
  private _time = 0;
  private readonly enteredAt: Record<FillyState, number>;

  /** Mutable output; returned by every `update()`. */
  private readonly _pose: FillyPose = createPose();
  /** Scratch target pose (no per-frame allocation). */
  private readonly target: FillyPose = createPose();
  /** One spring per POSE_KEY, in POSE_KEYS order. */
  private readonly springs: Spring[];
  /** Per-state presence weight springs, in FILLY_STATES order. */
  private readonly weights: Spring[];

  private readonly pointerX = new Spring(0, SPRING_PRESETS.pointer);
  private readonly pointerY = new Spring(0, SPRING_PRESETS.pointer);
  private readonly pointerWeight = new Spring(1, SPRING_PRESETS.pointer);
  private hint: InteractionHint = "none";
  private audioLevel: number | null = null;

  private readonly blinkCtl: BlinkController;
  private readonly modulator: StateModulator;

  constructor(opts: FillyAnimatorOptions = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.autoBlink = opts.autoBlink ?? true;
    this.initialState = opts.initialState ?? "idle";
    this._state = this.initialState;
    this.enteredAt = {
      idle: 0,
      listening: 0,
      talking: 0,
      happy: 0,
      thinking: 0,
      surprised: 0,
      sleepy: 0,
    };
    this.springs = POSE_KEYS.map((k) => new Spring(STATE_TARGETS[this._state][k], POSE_SPRING_CONFIG[k]));
    this.weights = FILLY_STATES.map((s) => new Spring(s === this._state ? 1 : 0, SPRING_PRESETS.weight));
    this.blinkCtl = new BlinkController(this.rng);
    this.modulator = new StateModulator(this.rng);
    this.snapToState();
  }

  // ── public API ───────────────────────────────────────────────────────────

  /** Current logical state. */
  get state(): FillyState {
    return this._state;
  }

  /** Elapsed animator time in seconds (sum of clamped `dt`s). */
  get time(): number {
    return this._time;
  }

  /** The pose produced by the last `update()` (same object every call). */
  get pose(): Readonly<FillyPose> {
    return this._pose;
  }

  /**
   * Switch state. Idempotent: calling with the current state does nothing.
   * Swaps spring targets and fires the enter impulses (happy, surprised).
   */
  setState(next: FillyState): void {
    if (next === this._state) return;
    this._state = next;
    this.enteredAt[next] = this._time;
    this.modulator.enter(next);
    this.pointerWeight.target = POINTER_FOLLOW_WEIGHT[next];
    this.fireEnterImpulse(next);
  }

  /** One-shot blink; ignored while a blink is already running. */
  blink(): void {
    this.blinkCtl.trigger();
  }

  /** 0..1 audio level from the host (mic / TTS); `null` = none → synthetic talking. */
  setAudioLevel(level: number | null): void {
    if (level === null || !Number.isFinite(level)) {
      this.audioLevel = null;
      return;
    }
    this.audioLevel = level < 0 ? 0 : level > 1 ? 1 : level;
  }

  /**
   * Pointer position relative to the character, roughly −1..1 on each axis
   * (+x = viewer's right, +y = up). `null` releases (gaze returns to centre).
   */
  setPointer(x: number | null, y: number | null): void {
    const px = x === null || !Number.isFinite(x) ? 0 : x < -1 ? -1 : x > 1 ? 1 : x;
    const py = y === null || !Number.isFinite(y) ? 0 : y < -1 ? -1 : y > 1 ? 1 : y;
    this.pointerX.target = px;
    this.pointerY.target = py;
  }

  /** hover → small ear perk / stronger glance; pressed → tiny squash. */
  setInteractionHint(hint: InteractionHint): void {
    this.hint = hint;
  }

  /**
   * Advance by `dt` seconds (clamped to [0, 0.1]) and return the mutable pose
   * object — the SAME object every call, never a fresh allocation.
   */
  update(dt: number): FillyPose {
    if (!(dt > 0)) dt = 0;
    else if (dt > MAX_DT) dt = MAX_DT;
    this._time += dt;

    const state = this._state;
    const pose = this._pose;
    const target = this.target;
    const staticTarget = STATE_TARGETS[state];

    // 1. targets ------------------------------------------------------------
    this.modulator.step(state, dt, this.audioLevel);
    copyPose(target, staticTarget);
    this.modulator.applyTargetOffsets(state, target);
    this.applyPointer(dt, target);
    this.applyHint(target);

    // 2. springs ------------------------------------------------------------
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const s = this.springs[i];
      s.target = target[POSE_KEYS[i]];
      pose[POSE_KEYS[i]] = s.update(dt);
    }

    // 3. overlays -----------------------------------------------------------
    for (let i = 0; i < FILLY_STATES.length; i++) {
      const st = FILLY_STATES[i];
      const ws = this.weights[i];
      ws.target = st === state ? 1 : 0;
      let w = ws.update(dt);
      if (w < WEIGHT_EPSILON) continue;
      if (w > 1) w = 1;
      this.modulator.applyOverlay(st, w, this._time - this.enteredAt[st], this._time, this.audioLevel, pose);
    }

    // 4. blink + clamp ------------------------------------------------------
    const openness = this.blinkCtl.update(dt, this.autoBlink && state !== "sleepy");
    if (openness < 1) {
      pose.eyeOpenL *= openness;
      pose.eyeOpenR *= openness;
      if (stateEyesOpen(state)) pose.eyeArc += (BLINK_ARC - pose.eyeArc) * (1 - openness);
    }
    return clampPose(pose);
  }

  /**
   * Deterministically advance from the current time to `time` in fixed
   * `dt` steps (plus one shorter final step). Used for static screenshots.
   */
  stepTo(time: number, dt = 1 / 60): FillyPose {
    const eps = 1e-9;
    if (!(dt > 0)) dt = 1 / 60;
    else if (dt > MAX_DT) dt = MAX_DT;
    while (this._time + dt <= time + eps) this.update(dt);
    const rem = time - this._time;
    if (rem > eps) this.update(rem);
    return this._pose;
  }

  /** Back to t = 0, the initial state, fresh RNG sequence, springs settled. */
  reset(): void {
    this.rng.reset();
    this._time = 0;
    this._state = this.initialState;
    for (const s of FILLY_STATES) this.enteredAt[s] = 0;
    this.hint = "none";
    this.audioLevel = null;
    this.pointerX.snap(0);
    this.pointerY.snap(0);
    this.blinkCtl.reset();
    this.modulator.reset();
    this.snapToState();
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** Settle every spring on the current state's static target. */
  private snapToState(): void {
    const staticTarget = STATE_TARGETS[this._state];
    for (let i = 0; i < POSE_KEYS.length; i++) this.springs[i].snap(staticTarget[POSE_KEYS[i]]);
    for (let i = 0; i < FILLY_STATES.length; i++) this.weights[i].snap(FILLY_STATES[i] === this._state ? 1 : 0);
    this.pointerWeight.snap(POINTER_FOLLOW_WEIGHT[this._state]);
    copyPose(this._pose, staticTarget);
    copyPose(this.target, staticTarget);
  }

  private fireEnterImpulse(state: FillyState): void {
    if (state === "happy") {
      // Leave the ground right away; the bounce overlay takes over.
      this.spring("bodyY").kick(1.5);
      this.spring("bodyScaleY").kick(0.6);
      this.spring("bodyScaleX").kick(-0.4);
    } else if (state === "surprised") {
      // Jump ~0.15 and stretch ~1.1, settling in ~0.6 s.
      this.spring("bodyY").kick(3.6);
      this.spring("bodyScaleY").kick(2.6);
      this.spring("bodyScaleX").kick(-1.2);
      this.spring("eyeScale").kick(1.2);
    }
  }

  private spring(key: keyof FillyPose): Spring {
    return this.springs[POSE_KEYS.indexOf(key)];
  }

  private applyPointer(dt: number, target: FillyPose): void {
    const px = this.pointerX.update(dt);
    const py = this.pointerY.update(dt);
    const w = this.pointerWeight.update(dt);
    if (w <= 0) return;
    const eyeGain = POINTER_EYE_GAIN * (this.hint === "hover" ? HOVER_EYE_BOOST : 1) * w;
    target.eyeLookX += px * eyeGain;
    target.eyeLookY += py * eyeGain;
    target.bodyYaw += px * POINTER_YAW_GAIN * w;
    target.bodyPitch += -py * POINTER_PITCH_GAIN * w;
  }

  private applyHint(target: FillyPose): void {
    if (this.hint === "hover") {
      target.earL += 0.1;
      target.earR += 0.1;
      target.cheek += 0.1;
    } else if (this.hint === "pressed") {
      target.bodyScaleY -= 0.06;
      target.bodyScaleX += 0.04;
    }
  }
}
