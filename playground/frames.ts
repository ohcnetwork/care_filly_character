/**
 * The canonical "sheet" frames: one deterministic freeze frame per state
 * (plus the blink overlay), labelled like reference/animation-states-sheet.png.
 * Shared by the sheet page and scripts/snapshot.mts.
 */
import type { FillyState } from "../src/core/types";

export interface SheetFrame {
  /** Slug used for file names / query strings (`blink` = idle + freezeBlink). */
  id: FillyState | "blink";
  state: FillyState;
  /** Freeze time in seconds. */
  t: number;
  /** Audio level applied before stepping (talking). */
  audio?: number;
  freezeBlink?: boolean;
  title: string;
  caption: string;
}

export const SHEET_FRAMES: readonly SheetFrame[] = [
  { id: "idle", state: "idle", t: 1.0, title: "IDLE", caption: "Relaxed and friendly neutral pose." },
  { id: "blink", state: "idle", t: 0.13, freezeBlink: true, title: "BLINK", caption: "Slow gentle blink." },
  { id: "listening", state: "listening", t: 1.2, title: "LISTENING", caption: "Head tilt and hand up to listen closely." },
  { id: "talking", state: "talking", t: 1.35, audio: 0.7, title: "TALKING", caption: "Open mouth with a friendly speaking pose." },
  { id: "happy", state: "happy", t: 1.18, title: "HAPPY BOUNCE", caption: "Excited bounce with joyful energy!" },
  { id: "thinking", state: "thinking", t: 1.5, title: "THINKING", caption: "Curious and thoughtful pondering pose." },
  { id: "surprised", state: "surprised", t: 1.1, title: "SURPRISED", caption: "Wide eyes and tiny “o” mouth in surprise." },
  { id: "sleepy", state: "sleepy", t: 2.0, title: "SLEEPY", caption: "Cozy and calm, ready for a nap." },
];
