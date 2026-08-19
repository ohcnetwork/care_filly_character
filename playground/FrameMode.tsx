/** `?state=…&t=…` — one deterministic freeze frame, centred. */
import type { FillyState } from "../src/core/types";
import { FillyCharacter } from "../src/react/FillyCharacter";

export interface FrameModeProps {
  state: FillyState;
  t: number;
  size: number;
  audioLevel: number | null;
  blink: boolean;
}

export function FrameMode({ state, t, size, audioLevel, blink }: FrameModeProps) {
  return (
    <div className="frame">
      <FillyCharacter
        state={state}
        size={size}
        freezeAt={t}
        freezeBlink={blink}
        audioLevel={audioLevel}
        followPointer={false}
        interactive={false}
        dpr={[1, 2]}
      />
    </div>
  );
}
