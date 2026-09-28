import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import {
  ArrowCounterClockwise,
  ArrowUpRight,
  ArrowsIn,
  ArrowsOut,
  ArrowLeft,
  ArrowRight,
  Code,
  Heart,
  Heartbeat,
  Pause,
  Play,
  Repeat,
  SpeakerHigh,
  SpeakerSlash,
  Waveform,
} from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { FillyCharacter } from "../src/react/FillyCharacter";
import {
  EXHIBIT_CHAPTERS,
  EXHIBIT_CUES,
  EXHIBIT_DURATION_MS,
  INITIAL_EXHIBIT_PLAYBACK,
  exhibitReducer,
  startExhibitCue,
  startExhibitVideo,
  type ExhibitMedia,
} from "./exhibitPlayback";
import "./exhibit.css";

function ExhibitVideo({ media, playing, onUnavailable }: {
  media: ExhibitMedia;
  playing: boolean;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!playing) {
      video.pause();
      return;
    }
    return startExhibitVideo(video, onUnavailable);
  }, [media.src, playing, onUnavailable]);

  return (
    <video
      ref={videoRef}
      src={media.src}
      poster={media.poster}
      muted
      loop
      playsInline
      preload="auto"
      aria-label={media.title}
      aria-describedby="exhibit-caption"
    />
  );
}

export function ExhibitMode() {
  const rootRef = useRef<HTMLElement>(null);
  const [playback, dispatch] = useReducer(exhibitReducer, INITIAL_EXHIBIT_PLAYBACK);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const cue = EXHIBIT_CUES[playback.cueIndex];
  const media = cue.media;
  const chapter = EXHIBIT_CHAPTERS[cue.chapterIndex];
  const canSpeak = typeof window.speechSynthesis !== "undefined"
    && typeof window.SpeechSynthesisUtterance !== "undefined";
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;

  const onMediaUnavailable = useCallback(() => {
    setNotice("Demo unavailable. Continuing the presentation.");
    dispatch({ type: "advance" });
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "CARE, with Filly | Open Healthcare Network";
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    onVisibility();
    onFullscreen();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.title = previousTitle;
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  useEffect(() => {
    setSpeaking(false);
    if (!playback.playing || !visible) return;
    return startExhibitCue(EXHIBIT_CUES[playback.cueIndex], {
      onFinish: () => dispatch({ type: "advance" }),
      onSpeakingChange: setSpeaking,
      onVoiceUnavailable: () => {
        setVoiceEnabled(false);
        setNotice("Voice unavailable. The captioned presentation will continue.");
      },
      speech: voiceEnabled && canSpeak ? {
        synthesis: window.speechSynthesis,
        createUtterance: (text) => new SpeechSynthesisUtterance(text),
      } : undefined,
    });
  }, [playback, voiceEnabled, visible, canSpeak]);

  useEffect(() => {
    if (!playback.playing || !visible || !("wakeLock" in navigator)) return;
    let disposed = false;
    let lock: WakeLockSentinel | undefined;
    void navigator.wakeLock.request("screen").then((acquired) => {
      if (disposed) void acquired.release().catch(() => undefined);
      else lock = acquired;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      void lock?.release().catch(() => undefined);
    };
  }, [playback.playing, visible]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      setNotice("Fullscreen is unavailable in this browser.");
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.target instanceof HTMLElement && event.target.closest("button, a, input, select, textarea, [contenteditable]")) return;
      switch (event.key.toLowerCase()) {
        case " ":
          event.preventDefault();
          dispatch({ type: "toggle-playing" });
          break;
        case "arrowright":
        case "arrowleft": {
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          dispatch({ type: "chapter", chapterIndex: (cue.chapterIndex + direction + EXHIBIT_CHAPTERS.length) % EXHIBIT_CHAPTERS.length });
          break;
        }
        case "r":
          dispatch({ type: "restart" });
          break;
        case "m":
          if (canSpeak) {
            setNotice("");
            setVoiceEnabled((enabled) => !enabled);
          }
          break;
        case "f":
          if (canFullscreen) void toggleFullscreen();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cue.chapterIndex, canSpeak, canFullscreen, toggleFullscreen]);

  function moveChapter(direction: number) {
    dispatch({ type: "chapter", chapterIndex: (cue.chapterIndex + direction + EXHIBIT_CHAPTERS.length) % EXHIBIT_CHAPTERS.length });
  }

  return (
    <main
      ref={rootRef}
      className="exhibit"
      aria-label="CARE exhibition"
      data-tone={chapter.tone}
      data-playing={playback.playing && visible}
      data-cue-index={playback.cueIndex}
    >
      <header className="exhibit-header">
        <a className="exhibit-brand" href="/" aria-label="CARE mascot studio">
          <img src="/favicon.svg" width="36" height="36" alt="" />
          <span>CARE</span>
        </a>
        <span className="exhibit-network">Open Healthcare Network</span>
        <a className="exhibit-site" href="https://ohc.network/" target="_blank" rel="noopener noreferrer">
          ohc.network <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </header>

      <section className="exhibit-stage" aria-labelledby="exhibit-title" data-media={Boolean(media)}>
        <div className="exhibit-story" key={media?.src ?? chapter.id}>
          <div className="exhibit-chapter-heading">
            <span>{String(cue.chapterIndex + 1).padStart(2, "0")}</span>
            <span>{chapter.label}</span>
          </div>
          <h1 id="exhibit-title">{media?.title ?? chapter.title}</h1>
          <p className="exhibit-description">{chapter.description}</p>
          <ul className="exhibit-points">
            {chapter.points.map((point, pointIndex) => {
              const Icon = [Heart, Heartbeat, Code][pointIndex];
              return (
                <li key={point}>
                  <Icon size={23} weight="regular" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="exhibit-presenter" role="img" aria-label="Filly, the CARE mascot">
          <FillyCharacter
            state={speaking && playback.playing ? "talking" : chapter.expression}
            size="100%"
            style={{ width: "100%", height: "100%" }}
            followPointer={false}
            interactive={false}
            paused={!playback.playing || !visible}
            dpr={[1, 1.5]}
          />
        </div>
        <span className="exhibit-presenter-name" aria-hidden="true">Your friend, Filly.</span>
        {media && (
          <figure className="exhibit-media" style={{ "--media-aspect": media.aspectRatio ?? 16 / 9 } as CSSProperties}>
            <div className="exhibit-media-screen">
              <ExhibitVideo
                key={media.src}
                media={media}
                playing={playback.playing && visible}
                onUnavailable={onMediaUnavailable}
              />
            </div>
            <figcaption>
              <span>CARE in action</span>
              <a href="https://deck.ohc.network/" target="_blank" rel="noopener noreferrer">
                OHC deck, slide {media.sourceSlide} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </figcaption>
          </figure>
        )}
      </section>

      <section className="exhibit-caption-band" aria-label="Filly's narration">
        <div className="exhibit-speaker" aria-hidden="true">
          <Waveform size={24} weight="regular" />
          <span>Filly</span>
        </div>
        <p id="exhibit-caption" className="exhibit-caption" aria-live={voiceEnabled ? "off" : "polite"} aria-atomic="true">
          <span key={playback.cueIndex}>{cue.text}</span>
        </p>
        <a className="exhibit-qr" href="https://ohc.network/" target="_blank" rel="noopener noreferrer" aria-label="Explore CARE at Open Healthcare Network">
          <QRCodeSVG value="https://ohc.network/" size={76} marginSize={2} fgColor="#183f30" aria-hidden="true" />
          <span>Explore CARE <ArrowUpRight size={14} aria-hidden="true" /></span>
        </a>
      </section>

      <footer className="exhibit-footer">
        <nav className="exhibit-chapters" aria-label="Exhibit chapters">
          {EXHIBIT_CHAPTERS.map((item, chapterIndex) => {
            const firstCue = EXHIBIT_CUES.findIndex((entry) => entry.chapterIndex === chapterIndex);
            const cueCount = EXHIBIT_CUES.filter((entry) => entry.chapterIndex === chapterIndex).length;
            const completed = Math.min(1, Math.max(0, (playback.cueIndex - firstCue) / cueCount));
            return (
              <button
                key={item.id}
                type="button"
                className="exhibit-chapter"
                aria-current={chapterIndex === cue.chapterIndex ? "step" : undefined}
                aria-label={item.label}
                title={item.label}
                onClick={() => dispatch({ type: "chapter", chapterIndex })}
              >
                <span className="exhibit-chapter-track" aria-hidden="true">
                  <span style={{ transform: `scaleX(${completed})` }} />
                  {chapterIndex === cue.chapterIndex && (
                    <span
                      key={`${playback.cueIndex}-${voiceEnabled}-${playback.playing}`}
                      className="exhibit-cue-progress"
                      style={{
                        left: `${completed * 100}%`,
                        width: `${100 / cueCount}%`,
                        "--cue-duration": `${cue.durationMs}ms`,
                      } as CSSProperties}
                    />
                  )}
                </span>
                <span className="exhibit-chapter-label">{item.label}</span>
                <span className="exhibit-chapter-number" aria-hidden="true">{String(chapterIndex + 1).padStart(2, "0")}</span>
              </button>
            );
          })}
        </nav>

        <div className="exhibit-bottom-bar">
          <div className="exhibit-loop-status">
            <Repeat size={18} aria-hidden="true" />
            <span>{playback.playing ? "On repeat" : "Paused"}</span>
            <span className="exhibit-runtime">About {Math.round(EXHIBIT_DURATION_MS / 60000)} min</span>
          </div>
          <div className="exhibit-controls" role="group" aria-label="Presentation controls">
            <button type="button" className="exhibit-icon-button" onClick={() => moveChapter(-1)} aria-label="Previous chapter" title="Previous chapter">
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" className="exhibit-icon-button exhibit-play" onClick={() => dispatch({ type: "toggle-playing" })} aria-label={playback.playing ? "Pause presentation" : "Play presentation"} title={playback.playing ? "Pause presentation" : "Play presentation"}>
              {playback.playing ? <Pause size={20} weight="fill" aria-hidden="true" /> : <Play size={20} weight="fill" aria-hidden="true" />}
            </button>
            <button type="button" className="exhibit-icon-button" onClick={() => moveChapter(1)} aria-label="Next chapter" title="Next chapter">
              <ArrowRight size={20} aria-hidden="true" />
            </button>
            <span className="exhibit-control-divider" />
            <button type="button" className="exhibit-icon-button" onClick={() => dispatch({ type: "restart" })} aria-label="Restart presentation" title="Restart presentation">
              <ArrowCounterClockwise size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="exhibit-voice-button"
              aria-label={voiceEnabled ? "Mute narration" : "Enable narration"}
              aria-pressed={voiceEnabled}
              disabled={!canSpeak}
              title={canSpeak ? (voiceEnabled ? "Mute narration" : "Enable narration") : "Speech is not supported in this browser"}
              onClick={() => {
                setNotice("");
                setVoiceEnabled((enabled) => !enabled);
              }}
            >
              {voiceEnabled ? <SpeakerHigh size={20} aria-hidden="true" /> : <SpeakerSlash size={20} aria-hidden="true" />}
              <span>{voiceEnabled ? "Voice on" : "Enable voice"}</span>
            </button>
            <button type="button" className="exhibit-icon-button" onClick={() => void toggleFullscreen()} disabled={!canFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={canFullscreen ? (fullscreen ? "Exit fullscreen" : "Enter fullscreen") : "Fullscreen is not supported in this browser"}>
              {fullscreen ? <ArrowsIn size={20} aria-hidden="true" /> : <ArrowsOut size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {notice && <p className="exhibit-notice" role="status">{notice}</p>}
      </footer>
    </main>
  );
}