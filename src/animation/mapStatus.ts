/**
 * Mapping from the care_filly_fe plugin's `FillyStatus` to a character state.
 */
import type { FillyState } from "@/core/types";

/** Status union used by the CARE voice-documentation plugin. */
export type FillyStatus = "idle" | "recording" | "paused" | "processing" | "completed" | "failed";

export interface MapStatusOptions {
  /** True while the assistant is speaking (TTS) — turns `recording` into `talking`. */
  speaking?: boolean;
}

/**
 * idle → idle, recording → listening (or talking when `speaking`),
 * paused → sleepy, processing → thinking, completed → happy,
 * failed → surprised. Anything unknown → idle.
 */
export function mapStatusToState(
  status: FillyStatus | (string & Record<never, never>),
  opts: MapStatusOptions = {},
): FillyState {
  switch (status) {
    case "recording":
      return opts.speaking ? "talking" : "listening";
    case "paused":
      return "sleepy";
    case "processing":
      return "thinking";
    case "completed":
      return "happy";
    case "failed":
      return "surprised";
    case "idle":
    default:
      return "idle";
  }
}
