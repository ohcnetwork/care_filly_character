/**
 * Small DOM hooks used by {@link FillyCharacter}: visibility gating and
 * window-level pointer tracking. All guard against SSR (no `window` access
 * at import time; effects only run in the browser).
 */
import { useEffect, useState, type RefObject } from "react";
import type { FillyAnimator } from "../animation/FillyAnimator";

/**
 * True while `element` intersects the viewport. Falls back to `true` where
 * IntersectionObserver is unavailable.
 *
 * Deliberately does NOT gate on `document.hidden`: browsers already stop
 * `requestAnimationFrame` in hidden tabs, and embedded webviews / previews
 * sometimes report `hidden` while the page is in fact visible, which would
 * leave the canvas blank.
 */
export function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [intersecting, setIntersecting] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setIntersecting(e.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return intersecting;
}

/**
 * Feeds the animator with the pointer position relative to the character's
 * centre, normalised by half the window size and clamped to ±1 (+x right,
 * +y up). Releases the pointer (gaze back to centre) when it leaves the page.
 */
export function usePointerFollow(
  ref: RefObject<HTMLElement | null>,
  animator: FillyAnimator,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      animator.setPointer(null, null);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hw = Math.max(1, window.innerWidth / 2);
      const hh = Math.max(1, window.innerHeight / 2);
      animator.setPointer((e.clientX - cx) / hw, -(e.clientY - cy) / hh);
    };
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget === null) animator.setPointer(null, null);
    };
    const onBlur = () => animator.setPointer(null, null);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onBlur);
      animator.setPointer(null, null);
    };
  }, [ref, animator, enabled]);
}
