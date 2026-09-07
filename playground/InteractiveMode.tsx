/** The live character studio. */
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CaretDown, Heart, SlidersHorizontal } from "@phosphor-icons/react";
import type { FillyState } from "../src/core/types";
import { FillyCharacter, type FillyCharacterHandle } from "../src/react/FillyCharacter";
import { SHEET_FRAMES, type SheetFrame } from "./frames";
import { useFps, useMicLevel } from "./useAudio";
import { ExpressionIcon } from "./ExpressionIcon";

export function InteractiveMode() {
  const ref = useRef<FillyCharacterHandle>(null);
  const [state, setState] = useState<FillyState>("idle");
  const [expression, setExpression] = useState<SheetFrame["id"]>("idle");
  const [useAudio, setUseAudio] = useState(false);
  const [slider, setSlider] = useState(0.5);
  const [followPointer, setFollowPointer] = useState(true);
  const [orbitControls, setOrbitControls] = useState(false);
  const [mic, setMic] = useState(false);
  const { level: micLevel, error: micError } = useMicLevel(mic);
  const fps = useFps();
  const [liveState, setLiveState] = useState<FillyState>("idle");

  useEffect(() => {
    const id = setInterval(() => {
      const animator = ref.current?.getAnimator();
      if (animator) setLiveState(animator.state);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const audioLevel = mic ? micLevel : useAudio ? slider : null;
  const selected = SHEET_FRAMES.find((frame) => frame.id === expression)!;

  function selectExpression(frame: SheetFrame) {
    setExpression(frame.id);
    setState(frame.state);
    ref.current?.setState(frame.state);
    if (frame.id === "blink") ref.current?.blink();
  }

  return (
    <main className="pg">
      <header className="studio-header">
        <a className="studio-brand" href="./" aria-label="Filly character studio home">
          <span className="care-wordmark">CARE</span>
          <span className="brand-divider" />
          <span>Filly</span>
        </a>
        <a className="sheet-link" href="?sheet=1">
          Expression sheet <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </header>

      <section className="character-studio" aria-labelledby="studio-title">
        <div className="studio-intro">
          <span className="eyebrow">A LITTLE COMPANION, A LOT OF HEART</span>
          <h1 id="studio-title">Hello, I’m Filly.</h1>
          <p>Here to listen, help, and brighten your day.</p>
        </div>
        <div className="pg-stage">
          <FillyCharacter
            ref={ref}
            state={state}
            size="min(480px, 94vw)"
            audioLevel={audioLevel}
            followPointer={followPointer && !orbitControls}
            interactive={!orbitControls}
            orbitControls={orbitControls}
          />
        </div>
        <div className="stage-caption" aria-live="polite">
          <span className="live-dot" aria-hidden="true" />
          {orbitControls
            ? "Drag to look around · Scroll or pinch to zoom"
            : "Move your cursor, or tap Filly for a little joy"}
        </div>

        <section className="expression-picker" aria-labelledby="expression-title">
          <div className="expression-heading">
            <h2 id="expression-title">A feeling for every moment</h2>
            <span>08 expressions</span>
          </div>
          <div className="expression-list" role="group" aria-label="Choose Filly’s expression">
            {SHEET_FRAMES.map((frame) => (
              <button
                type="button"
                key={frame.id}
                className={`expression-button${frame.id === expression ? " active" : ""}`}
                aria-pressed={frame.id === expression}
                onClick={() => selectExpression(frame)}
              >
                <ExpressionIcon className="expression-symbol" expression={frame.id} size={26} weight="light" />
                <span>{frame.title.toLowerCase()}</span>
              </button>
            ))}
          </div>
          <p className="expression-description" aria-live="polite">{selected.caption}</p>
        </section>

        <details className="studio-settings">
          <summary>
            <SlidersHorizontal className="settings-icon" size={16} aria-hidden="true" />
            Interaction settings
            <CaretDown className="settings-chevron" size={13} aria-hidden="true" />
          </summary>
          <div className="pg-controls">
            <label className="setting-toggle">
              <input type="checkbox" checked={orbitControls} onChange={(event) => setOrbitControls(event.target.checked)} />
              Rotate in 3D
            </label>
            <label className="setting-toggle">
              <input type="checkbox" checked={followPointer && !orbitControls} onChange={(event) => setFollowPointer(event.target.checked)} disabled={orbitControls} />
              Follow pointer
            </label>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={mic}
                onChange={(event) => {
                  setMic(event.target.checked);
                  if (event.target.checked) selectExpression(SHEET_FRAMES[3]);
                }}
              />
              Sync microphone
            </label>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={useAudio}
                onChange={(event) => {
                  setUseAudio(event.target.checked);
                  if (event.target.checked) selectExpression(SHEET_FRAMES[3]);
                }}
                disabled={mic}
              />
              Preview voice level
            </label>
            <label className="voice-level">
              <span>Voice level</span>
              <input type="range" min={0} max={1} step={0.01} value={slider} disabled={!useAudio || mic} onChange={(event) => setSlider(Number(event.target.value))} />
              <output>{Math.round(slider * 100)}%</output>
            </label>
          </div>
          <div className="pg-status">
            <span>{liveState}</span>
            <span>audio {audioLevel === null ? "—" : audioLevel.toFixed(2)}</span>
            <span>{fps} fps</span>
          </div>
        </details>
        {micError && <p className="pg-error" role="alert">Microphone: {micError}</p>}
      </section>
      <footer className="studio-footer">
        <span>Soft. Friendly. Always here.</span>
        <span>Made with a little <Heart className="footer-heart" size={15} alt="love" /></span>
      </footer>
    </main>
  );
}
