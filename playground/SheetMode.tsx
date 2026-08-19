/** `?sheet=1` — the 8 sheet frames in a 4×2 grid, labelled like the reference. */
import { useCallback, useRef, useState } from "react";
import { FillyCharacter } from "../src/react/FillyCharacter";
import { SHEET_FRAMES } from "./frames";

export function SheetMode({ cell }: { cell: number }) {
  const readyCount = useRef(0);
  const [allReady, setAllReady] = useState(false);
  const onReady = useCallback(() => {
    readyCount.current += 1;
    if (readyCount.current >= SHEET_FRAMES.length) setAllReady(true);
  }, []);

  return (
    <div className="sheet" data-ready={allReady ? "1" : undefined}>
      <div className="sheet-header">
        <div>
          <span className="badge">CARE MASCOT ♥</span>
          <h1>Animation States</h1>
        </div>
        <div className="tag">
          <b>Soft. Friendly. Helpful.</b> Built for gentle UI motion.
        </div>
      </div>
      <div className="sheet-grid">
        {SHEET_FRAMES.map((f) => (
          <div className="sheet-cell" key={f.id} data-frame={f.id}>
            <FillyCharacter
              state={f.state}
              size={cell}
              freezeAt={f.t}
              freezeBlink={f.freezeBlink}
              audioLevel={f.audio ?? null}
              followPointer={false}
              interactive={false}
              onReady={onReady}
            />
            <div className="title">{f.title}</div>
            <div className="caption">{f.caption}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
