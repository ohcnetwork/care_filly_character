/** Mic level (getUserMedia + AnalyserNode) and FPS hooks for the playground. */
import { useEffect, useRef, useState } from "react";

/** RMS of the mic signal, smoothed and scaled to roughly 0..1, while `enabled`. */
export function useMicLevel(enabled: boolean): { level: number; error: string | null } {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLevel(0);
      setError(null);
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let smoothed = 0;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia unavailable");
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const target = Math.min(1, rms * 6);
          smoothed += (target - smoothed) * (target > smoothed ? 0.5 : 0.15);
          setLevel(smoothed);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [enabled]);

  return { level, error };
}

/** Frames per second, sampled every 500 ms. */
export function useFps(): number {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frames.current += 1;
      if (now - last >= 500) {
        setFps(Math.round((frames.current * 1000) / (now - last)));
        frames.current = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}
