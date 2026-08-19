/** Default playground page: big interactive Filly + controls. */
import { useCallback, useEffect, useRef, useState } from "react";
import { FILLY_STATES, type FillyState } from "../src/core/types";
import { FillyCharacter, type FillyCharacterHandle } from "../src/react/FillyCharacter";
import { useFps, useMicLevel } from "./useAudio";

export function InteractiveMode() {
  const ref = useRef<FillyCharacterHandle>(null);
  const [state, setState] = useState<FillyState>("idle");
  const [useAudio, setUseAudio] = useState(false);
  const [slider, setSlider] = useState(0.5);
  const [followPointer, setFollowPointer] = useState(true);
  const [mic, setMic] = useState(false);
  const { level: micLevel, error: micError } = useMicLevel(mic);
  const fps = useFps();
  const [liveState, setLiveState] = useState<FillyState>("idle");

  // Poll the animator's actual state (click → happy bursts happen outside React state).
  useEffect(() => {
    const id = setInterval(() => {
      const a = ref.current?.getAnimator();
      if (a) setLiveState(a.state);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const audioLevel = mic ? micLevel : useAudio ? slider : null;
  const onClick = useCallback(() => {
    /* click → happy burst handled by the component */
  }, []);

  return (
    <div className="pg">
      <div className="pg-header">
        <h1>Filly</h1>
        <span className="sub">CARE mascot — react-three-fiber playground</span>
      </div>
      <div className="pg-stage">
        <FillyCharacter ref={ref} state={state} size={420} audioLevel={audioLevel} followPointer={followPointer} onClick={onClick} />
      </div>
      <div className="pg-row">
        {FILLY_STATES.map((s) => (
          <button key={s} className={s === state ? "active" : undefined} onClick={() => setState(s)}>
            {s}
          </button>
        ))}
        <button onClick={() => ref.current?.blink()}>Blink</button>
      </div>
      <div className="pg-controls">
        <label>
          <input type="checkbox" checked={useAudio} onChange={(e) => setUseAudio(e.target.checked)} disabled={mic} />
          use audio level
        </label>
        <label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={slider}
            disabled={!useAudio || mic}
            onChange={(e) => setSlider(Number(e.target.value))}
          />
          {slider.toFixed(2)}
        </label>
        <label>
          <input type="checkbox" checked={followPointer} onChange={(e) => setFollowPointer(e.target.checked)} />
          follow pointer
        </label>
        <label>
          <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} />
          sync mic
        </label>
      </div>
      <div className="pg-status">
        state <b>{liveState}</b> · audio <b>{audioLevel === null ? "—" : audioLevel.toFixed(2)}</b> · <b>{fps}</b> fps
      </div>
      {micError && <div className="pg-error">mic: {micError}</div>}
    </div>
  );
}
