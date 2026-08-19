/**
 * Mouth envelope for the `talking` state. Either follows a host-supplied
 * audio level (mic / TTS) with a fast attack and slower release, or — when no
 * level is supplied — synthesises syllables from the seeded RNG.
 */
import type { Rng } from "./rng";
import { follow } from "./spring";

/** Smallest mouth opening while talking (lips never fully close). */
export const TALK_MIN_OPEN = 0.15;
/** Largest synthetic syllable opening. */
export const TALK_MAX_SYNTH_OPEN = 0.9;

const AUDIO_ATTACK = 0.03;
const AUDIO_RELEASE = 0.12;
const SYNTH_ATTACK = 0.025;
const SYNTH_RELEASE = 0.06;
/** Nod envelope decay time constant. */
const NOD_TAU = 0.12;
/** Minimum time between two syllable onsets (audio-driven detection). */
const ONSET_REFRACTORY = 0.15;

export class MouthEnvelope {
  /** Current mouth opening contribution, `TALK_MIN_OPEN`..1. */
  value = 0;
  /** Decaying 0..1 envelope that spikes on each syllable onset (drives nods). */
  nod = 0;
  /** True for the single step in which a syllable onset happened. */
  onset = false;

  private level = TALK_MIN_OPEN;
  private timer = 0;
  private sinceOnset = 1;

  constructor(private readonly rng: Rng) {}

  reset(): void {
    this.value = 0;
    this.nod = 0;
    this.onset = false;
    this.level = TALK_MIN_OPEN;
    this.timer = 0;
    this.sinceOnset = 1;
  }

  /** Advance by `dt`; `audioLevel` is 0..1 or `null` for synthetic speech. */
  step(dt: number, audioLevel: number | null): void {
    this.onset = false;
    this.sinceOnset += dt;
    if (audioLevel === null) this.stepSynthetic(dt);
    else this.stepAudio(dt, audioLevel);
    this.nod *= Math.exp(-dt / NOD_TAU);
    if (this.onset) this.nod = 1;
  }

  private stepAudio(dt: number, audioLevel: number): void {
    const target = TALK_MIN_OPEN + (1 - TALK_MIN_OPEN) * audioLevel;
    if (target - this.value > 0.3 && this.sinceOnset >= ONSET_REFRACTORY) {
      this.onset = true;
      this.sinceOnset = 0;
    }
    this.value = follow(this.value, target, dt, AUDIO_ATTACK, AUDIO_RELEASE);
  }

  private stepSynthetic(dt: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      const prev = this.level;
      if (this.rng.chance(0.12)) {
        // Short pause between "words".
        this.level = TALK_MIN_OPEN;
        this.timer = this.rng.range(0.25, 0.5);
      } else {
        this.level = this.rng.range(TALK_MIN_OPEN, TALK_MAX_SYNTH_OPEN);
        this.timer = this.rng.range(0.08, 0.16);
      }
      if (this.level - prev > 0.25 && this.sinceOnset >= ONSET_REFRACTORY) {
        this.onset = true;
        this.sinceOnset = 0;
      }
    }
    this.value = follow(this.value, this.level, dt, SYNTH_ATTACK, SYNTH_RELEASE);
  }
}
