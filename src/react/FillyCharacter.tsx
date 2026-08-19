/**
 * `<FillyCharacter>` — the CARE mascot as a drop-in React component.
 * Wraps a react-three-fiber `<Canvas>` around {@link FillyScene}, owns one
 * {@link FillyAnimator}, and wires up pointer follow, hover/click reactions,
 * visibility-based pausing and deterministic freeze frames.
 */
import { Canvas } from "@react-three/fiber";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FillyAnimator } from "@/animation/FillyAnimator";
import type { FillyState } from "@/core/types";
import { useOnScreen, usePointerFollow } from "./hooks";
import { CAMERA_FOV, CAMERA_POSITION, FillyScene, type FillyFreeze } from "./FillyScene";

/** Seconds the character stays `happy` after a click. */
export const CLICK_HAPPY_SECONDS = 1.6;

export interface FillyCharacterProps {
  /** Animation state (default `'idle'`). */
  state?: FillyState;
  /** 0..1 live audio level (mic / TTS). `null`/undefined = none (synthetic talking). */
  audioLevel?: number | null;
  /** Square size in px (number) or any CSS size (string). Default 160. */
  size?: number | string;
  /** Eyes/head follow the pointer anywhere on the page (default true). */
  followPointer?: boolean;
  /** Hover → attentive, press → squash, click → short happy bounce (default true). */
  interactive?: boolean;
  /** Fired on click when `interactive`. */
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** PRNG seed for blink timing / idle glances (default 1). */
  seed?: number;
  /** Freeze the animation (the last pose stays visible). */
  paused?: boolean;
  /**
   * Deterministic static frame: the animator is reset and stepped to this
   * time, one frame is rendered and the loop stops (for screenshots/tests).
   */
  freezeAt?: number;
  /** With `freezeAt`: trigger a blink at t = 0 so the frame lands mid-blink. */
  freezeBlink?: boolean;
  /** Device pixel ratio or [min, max] range (default [1, 2]). */
  dpr?: number | [number, number];
  /** CSS background of the canvas (default transparent). */
  background?: string;
  /** Called once after the first frame containing the character has rendered. */
  onReady?: () => void;
}

/** Imperative handle exposed through `ref`. */
export interface FillyCharacterHandle {
  /** One-shot blink. */
  blink(): void;
  /** Override the state until the `state` prop next changes. */
  setState(state: FillyState): void;
  /** The underlying animator (advanced use: audio, pointer, hints). */
  getAnimator(): FillyAnimator;
}

function toCssSize(size: number | string): string {
  return typeof size === "number" ? `${size}px` : size;
}

export const FillyCharacter = forwardRef<FillyCharacterHandle, FillyCharacterProps>(function FillyCharacter(
  {
    state = "idle",
    audioLevel = null,
    size = 160,
    followPointer = true,
    interactive = true,
    onClick,
    className,
    style,
    seed = 1,
    paused = false,
    freezeAt,
    freezeBlink = false,
    dpr = [1, 2],
    background = "transparent",
    onReady,
  },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // One animator per seed. Its initial state is whatever the first render asked
  // for; in freeze mode it is rebuilt per state so `reset()` lands on that state.
  const frozen = freezeAt !== undefined;
  const initialStateRef = useRef(state);
  const frozenState = frozen ? state : null;
  const animator = useMemo(
    () => new FillyAnimator({ seed, initialState: frozenState ?? initialStateRef.current }),
    [seed, frozenState],
  );

  // Prop → animator state (unless a click-triggered happy burst is running).
  const propStateRef = useRef(state);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    propStateRef.current = state;
    if (happyTimer.current !== null) {
      clearTimeout(happyTimer.current);
      happyTimer.current = null;
    }
    animator.setState(state);
  }, [animator, state]);
  useEffect(
    () => () => {
      if (happyTimer.current !== null) clearTimeout(happyTimer.current);
    },
    [],
  );

  useEffect(() => {
    animator.setAudioLevel(audioLevel ?? null);
  }, [animator, audioLevel]);

  usePointerFollow(wrapperRef, animator, followPointer && !frozen);
  const onScreen = useOnScreen(wrapperRef);
  const running = !paused && onScreen && !frozen;

  useImperativeHandle(
    ref,
    () => ({
      blink: () => animator.blink(),
      setState: (s: FillyState) => animator.setState(s),
      getAnimator: () => animator,
    }),
    [animator],
  );

  // ── interaction ──────────────────────────────────────────────────────────
  const hint = useCallback(
    (h: "none" | "hover" | "pressed") => {
      if (interactive && !frozen) animator.setInteractionHint(h);
    },
    [animator, interactive, frozen],
  );
  const handleEnter = useCallback(() => hint("hover"), [hint]);
  const handleLeave = useCallback(() => hint("none"), [hint]);
  const handleDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button === 0) hint("pressed");
    },
    [hint],
  );
  const handleUp = useCallback(() => hint("hover"), [hint]);
  const handleClick = useCallback(() => {
    if (!interactive || frozen) return;
    animator.setState("happy");
    if (happyTimer.current !== null) clearTimeout(happyTimer.current);
    happyTimer.current = setTimeout(() => {
      happyTimer.current = null;
      animator.setState(propStateRef.current);
    }, CLICK_HAPPY_SECONDS * 1000);
    onClick?.();
  }, [animator, interactive, frozen, onClick]);

  useEffect(() => {
    if (!interactive) animator.setInteractionHint("none");
  }, [animator, interactive]);

  const handleReady = useCallback(() => {
    setReady(true);
    onReady?.();
  }, [onReady]);

  const freeze = useMemo<FillyFreeze | undefined>(
    () => (frozen ? { at: freezeAt, blink: freezeBlink, audioLevel } : undefined),
    [frozen, freezeAt, freezeBlink, audioLevel],
  );

  const css = toCssSize(size);
  const wrapperStyle: CSSProperties = {
    display: "inline-block",
    position: "relative",
    width: css,
    height: css,
    lineHeight: 0,
    pointerEvents: interactive ? "auto" : "none",
    cursor: interactive ? "pointer" : undefined,
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    ...style,
  };

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={wrapperStyle}
      data-ready={ready ? "1" : undefined}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleLeave}
      onClick={handleClick}
    >
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        dpr={dpr}
        camera={{ fov: CAMERA_FOV, position: [...CAMERA_POSITION], near: 0.1, far: 50 }}
        frameloop={frozen ? "demand" : running ? "always" : "never"}
        style={{ width: "100%", height: "100%", background }}
      >
        <FillyScene animator={animator} running={running} freeze={freeze} onReady={handleReady} />
      </Canvas>
    </div>
  );
});
