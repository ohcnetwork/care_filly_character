/**
 * `<FillyMascot>` — convenience wrapper for the care_filly_fe plugin: takes
 * the plugin's `FillyStatus` (+ `speaking`) instead of a raw `FillyState`.
 */
import { forwardRef, useMemo } from "react";
import { mapStatusToState, type FillyStatus } from "../animation/mapStatus";
import { FillyCharacter, type FillyCharacterHandle, type FillyCharacterProps } from "./FillyCharacter";

export interface FillyMascotProps extends Omit<FillyCharacterProps, "state"> {
  /** Plugin status: idle | recording | paused | processing | completed | failed. */
  status: FillyStatus;
  /** True while the assistant is speaking (recording → talking). */
  speaking?: boolean;
}

export const FillyMascot = forwardRef<FillyCharacterHandle, FillyMascotProps>(function FillyMascot(
  { status, speaking = false, ...rest },
  ref,
) {
  const state = useMemo(() => mapStatusToState(status, { speaking }), [status, speaking]);
  return <FillyCharacter ref={ref} state={state} {...rest} />;
});
