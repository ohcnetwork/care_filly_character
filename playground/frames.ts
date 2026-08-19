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
  { id: "idle", state: "idle", t: 1.0, title: "1. IDLE", caption: "Default resting state." },
  { id: "blink", state: "idle", t: 0.13, freezeBlink: true, title: "2. BLINK", caption: "Quick natural blink." },
  { id: "listening", state: "listening", t: 1.2, title: "3. LISTENING", caption: "Attentive and engaged." },
  { id: "talking", state: "talking", t: 1.35, audio: 0.7, title: "4. TALKING", caption: "Mouth opens for speech." },
  { id: "happy", state: "happy", t: 1.18, title: "5. HAPPY BOUNCE", caption: "Up, squash, down, stretch." },
  { id: "thinking", state: "thinking", t: 1.5, title: "6. THINKING", caption: "Curious and thoughtful." },
  { id: "surprised", state: "surprised", t: 1.1, title: "7. SURPRISED", caption: "Wide eyes, tiny 'o' mouth." },
  { id: "sleepy", state: "sleepy", t: 2.0, title: "8. SLEEPY", caption: "Resting and recharging." },
];
