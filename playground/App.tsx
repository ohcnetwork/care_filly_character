/**
 * Playground router. Modes (by URL query):
 *  - default            interactive page (state buttons, audio slider, mic, pointer follow)
 *  - ?state=X&t=S       deterministic static frame (freezeAt) — [&size=360][&audio=0.5][&blink=1]
 *  - ?sheet=1           all 8 sheet frames in a 4×2 grid (compare with the reference)
 *  - ?export=1          exposes window.__fillyExportGLB() for scripts/export-glb.mts
 */
import { isFillyState } from "../src/core/types";
import { ExportMode } from "./ExportMode";
import { FrameMode } from "./FrameMode";
import { InteractiveMode } from "./InteractiveMode";
import { SheetMode } from "./SheetMode";
import { SocialPreviewMode } from "./SocialPreviewMode";

function num(v: string | null, fallback: number): number {
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("social") === "1") return <SocialPreviewMode />;
  if (params.get("export") === "1") return <ExportMode />;
  if (params.get("sheet") === "1") return <SheetMode cell={num(params.get("size"), 320)} />;

  const stateParam = params.get("state");
  if (stateParam !== null) {
    const blink = stateParam === "blink" || params.get("blink") === "1";
    const state = isFillyState(stateParam) ? stateParam : "idle";
    const audio = params.get("audio");
    return (
      <FrameMode
        state={state}
        t={num(params.get("t"), 1)}
        size={num(params.get("size"), 360)}
        audioLevel={audio === null ? null : num(audio, 0)}
        blink={blink}
      />
    );
  }
  return <InteractiveMode />;
}
