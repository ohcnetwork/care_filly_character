/** The eight expression portraits, composed to match the character reference. */
import { useCallback, useRef, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { FillyCharacter } from "../src/react/FillyCharacter";
import { SHEET_FRAMES } from "./frames";
import { ExpressionIcon } from "./ExpressionIcon";

export function SheetMode({ cell }: { cell: number }) {
  const readyCount = useRef(0);
  const [allReady, setAllReady] = useState(false);
  const onReady = useCallback(() => {
    readyCount.current += 1;
    if (readyCount.current >= SHEET_FRAMES.length) setAllReady(true);
  }, []);

  return (
    <main className="sheet" data-ready={allReady ? "1" : undefined}>
      <header className="sheet-header">
        <a className="studio-brand" href="./" aria-label="Return to Filly’s character studio">
          <span className="care-wordmark">CARE</span>
          <span className="brand-divider" />
          <span>Filly</span>
        </a>
        <h1>One little friend. So many feelings.</h1>
        <a className="sheet-link" href="./">Back to studio <ArrowUpRight size={18} aria-hidden="true" /></a>
      </header>
      <div className="sheet-grid">
        {SHEET_FRAMES.map((frame) => (
          <section className="sheet-cell" key={frame.id} data-frame={frame.id} aria-labelledby={`pose-${frame.id}`}>
            <FillyCharacter
              className="sheet-portrait"
              state={frame.state}
              size={`min(${Math.round(cell * 1.17)}px, calc(100% + 54px))`}
              style={{ height: "auto", aspectRatio: "1" }}
              freezeAt={frame.t}
              dpr={2}
              freezeBlink={frame.freezeBlink}
              audioLevel={frame.audio ?? null}
              followPointer={false}
              interactive={false}
              onReady={onReady}
            />
            <h2 className="title" id={`pose-${frame.id}`}>{frame.title}</h2>
            <p className="caption">{frame.caption}</p>
            <ExpressionIcon className="sheet-symbol" expression={frame.id} size={28} weight={frame.id === "idle" || frame.id === "happy" ? "fill" : "light"} />
          </section>
        ))}
      </div>
    </main>
  );
}
