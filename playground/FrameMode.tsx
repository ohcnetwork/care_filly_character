/**
 * `?state=…&t=…` — one deterministic freeze frame, centred. `&from=…` starts
 * the frame's transition in that state.
 *
 * Scripts can re-target the frame without a reload through
 * `window.__fillyFrame({ state, t, from, audioLevel, blink, pose })`. The
 * character is remounted for each request and the promise resolves from its
 * `onReady`, i.e. once the new frame is on the canvas (used by
 * scripts/export-badger.mts). `pose` values replace the animator's values in
 * the frame, for sprites of poses the animator has no state for.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FillyPose, FillyState } from "../src/core/types";
import { FillyCharacter } from "../src/react/FillyCharacter";

export interface FrameModeProps {
  state: FillyState;
  t: number;
  size: number;
  audioLevel: number | null;
  blink: boolean;
  from?: FillyState;
  pose?: Partial<FillyPose> | null;
}

export type FrameRequest = Partial<Omit<FrameModeProps, "size">>;

declare global {
  interface Window {
    __fillyFrame?: (next: FrameRequest) => Promise<void>;
  }
}

export function FrameMode(initial: FrameModeProps) {
  const [frame, setFrame] = useState(initial);
  const [serial, setSerial] = useState(0);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    window.__fillyFrame = (next) =>
      new Promise<void>((resolve) => {
        pending.current = resolve;
        setFrame((prev) => ({ ...prev, ...next }));
        setSerial((n) => n + 1);
      });
    return () => {
      delete window.__fillyFrame;
    };
  }, []);

  const handleReady = useCallback(() => {
    const resolve = pending.current;
    pending.current = null;
    resolve?.();
  }, []);

  return (
    <div className="frame">
      <FillyCharacter
        key={serial}
        state={frame.state}
        size={frame.size}
        freezeAt={frame.t}
        freezeBlink={frame.blink}
        freezeFrom={frame.from}
        freezePose={frame.pose ?? undefined}
        audioLevel={frame.audioLevel}
        followPointer={false}
        interactive={false}
        dpr={[1, 2]}
        onReady={handleReady}
      />
    </div>
  );
}
