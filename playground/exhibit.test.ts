import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXHIBIT_CHAPTERS, EXHIBIT_CUES, exhibitReducer, INITIAL_EXHIBIT_PLAYBACK, startExhibitCue, startExhibitVideo } from "./exhibitPlayback";

describe("exhibit playback", () => {
  it("automatically returns to the opening after every narration cue", () => {
    let playback = INITIAL_EXHIBIT_PLAYBACK;

    for (let cueIndex = 0; cueIndex < EXHIBIT_CUES.length; cueIndex += 1) {
      expect(playback.cueIndex).toBe(cueIndex);
      playback = exhibitReducer(playback, { type: "advance" });
    }

    expect(EXHIBIT_CUES.length).toBeGreaterThan(1);
    expect(playback.cueIndex).toBe(0);
    expect(playback.playing).toBe(true);
  });

  it("does not advance while paused", () => {
    const paused = exhibitReducer(INITIAL_EXHIBIT_PLAYBACK, { type: "toggle-playing" });
    expect(paused.playing).toBe(false);
    expect(exhibitReducer(paused, { type: "advance" })).toEqual(paused);
    expect(exhibitReducer(paused, { type: "toggle-playing" }).playing).toBe(true);
  });

  it("selects the first cue of a chapter without resuming paused playback", () => {
    const playback = exhibitReducer({ cueIndex: 0, playing: false }, { type: "chapter", chapterIndex: 2 });
    expect(playback.playing).toBe(false);
    expect(EXHIBIT_CUES[playback.cueIndex]).toMatchObject({ chapterIndex: 2, text: EXHIBIT_CHAPTERS[2].narration[0] });
  });

  it("restarts the opening cue and resumes playback", () => {
    expect(exhibitReducer({ cueIndex: 5, playing: false }, { type: "restart" })).toEqual(INITIAL_EXHIBIT_PLAYBACK);
  });

  it("includes locally bundled deck recordings with matching posters and enough display time", () => {
    const demoCues = EXHIBIT_CUES.filter((cue) => cue.media);
    expect(demoCues.length).toBeGreaterThan(0);
    for (const cue of demoCues) {
      const media = cue.media!;
      expect(media.src).toMatch(/^\/exhibit-media\/.+\.mp4$/);
      expect(existsSync(new URL(`./public${media.src}`, import.meta.url))).toBe(true);
      expect(existsSync(new URL(`./public${media.poster}`, import.meta.url))).toBe(true);
      expect(cue.durationMs).toBeGreaterThanOrEqual(media.durationMs);
      expect(media.sourceSlide).toBeGreaterThan(0);
    }
  });
});

describe("exhibit narration", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const cue = EXHIBIT_CUES[0];
  function callbacks() {
    return { onFinish: vi.fn(), onSpeakingChange: vi.fn(), onVoiceUnavailable: vi.fn() };
  }

  function speechEngine() {
    const utterance = { onstart: null, onend: null, onerror: null } as unknown as SpeechSynthesisUtterance;
    const synthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };
    return { utterance, speech: { synthesis, createUtterance: () => utterance } };
  }

  it("advances captions automatically without a speech engine", () => {
    const events = callbacks();
    const stop = startExhibitCue(cue, events);
    expect(events.onSpeakingChange).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(cue.durationMs - 1);
    expect(events.onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(events.onFinish).toHaveBeenCalledTimes(1);
    expect(events.onSpeakingChange).toHaveBeenLastCalledWith(false);
    stop();
  });

  it("cancels pending caption advancement when stopped", () => {
    const events = callbacks();
    const stop = startExhibitCue(cue, events);
    stop();
    vi.runAllTimers();
    expect(events.onFinish).not.toHaveBeenCalled();
  });

  it("keeps a demo visible for its full excerpt after narration finishes", () => {
    const events = callbacks();
    const { utterance, speech } = speechEngine();
    const demoCue = {
      ...cue,
      media: {
        src: "/exhibit-media/demo.mp4",
        poster: "/exhibit-media/demo.jpg",
        title: "CARE workflow demo",
        durationMs: 20000,
        sourceSlide: 16,
      },
    };
    const stop = startExhibitCue(demoCue, { ...events, speech });
    utterance.onstart?.({} as SpeechSynthesisEvent);
    vi.advanceTimersByTime(3000);
    utterance.onend?.({} as SpeechSynthesisEvent);
    vi.advanceTimersByTime(16999);
    expect(events.onFinish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(events.onFinish).toHaveBeenCalledTimes(1);
    stop();
  });

  it("waits for spoken narration to end before advancing", () => {
    const events = callbacks();
    const { utterance, speech } = speechEngine();
    const stop = startExhibitCue(cue, { ...events, speech });
    utterance.onstart?.({} as SpeechSynthesisEvent);
    vi.advanceTimersByTime(cue.durationMs);
    expect(events.onFinish).not.toHaveBeenCalled();
    utterance.onend?.({} as SpeechSynthesisEvent);
    vi.advanceTimersByTime(900);
    expect(events.onFinish).toHaveBeenCalledTimes(1);
    stop();
  });

  it("falls back to captions if speech never starts", () => {
    const events = callbacks();
    const { speech } = speechEngine();
    const stop = startExhibitCue(cue, { ...events, speech });
    vi.advanceTimersByTime(cue.durationMs);
    expect(events.onVoiceUnavailable).toHaveBeenCalledTimes(1);
    expect(events.onFinish).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignores stale speech events after cancellation", () => {
    const events = callbacks();
    const { utterance, speech } = speechEngine();
    const stop = startExhibitCue(cue, { ...events, speech });
    const lateEnd = utterance.onend;
    stop();
    lateEnd?.call(utterance, {} as SpeechSynthesisEvent);
    vi.runAllTimers();
    expect(events.onFinish).not.toHaveBeenCalled();
    expect(speech.synthesis.cancel).toHaveBeenCalled();
  });
});

describe("exhibit video playback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function videoElement() {
    const video = new EventTarget();
    return Object.assign(video, {
      play: vi.fn(async () => { video.dispatchEvent(new Event("playing")); }),
      pause: vi.fn(),
    }) as unknown as HTMLVideoElement;
  }

  it("plays a demo and pauses it on cleanup", () => {
    const video = videoElement();
    const stop = startExhibitVideo(video, vi.fn());
    expect(video.play).toHaveBeenCalledOnce();
    stop();
    expect(video.pause).toHaveBeenCalledOnce();
  });

  it("skips a failed demo only once", () => {
    const video = videoElement();
    const unavailable = vi.fn();
    const stop = startExhibitVideo(video, unavailable);
    video.dispatchEvent(new Event("error"));
    video.dispatchEvent(new Event("error"));
    vi.runAllTimers();
    expect(unavailable).toHaveBeenCalledOnce();
    stop();
  });

  it("skips a stalled demo after a bounded wait", () => {
    const video = videoElement();
    const unavailable = vi.fn();
    const stop = startExhibitVideo(video, unavailable);
    video.dispatchEvent(new Event("waiting"));
    vi.advanceTimersByTime(8000);
    expect(unavailable).toHaveBeenCalledOnce();
    stop();
  });

  it("ignores a rejected play request after cleanup", async () => {
    const video = videoElement();
    vi.mocked(video.play).mockRejectedValue(new Error("Playback was interrupted"));
    const unavailable = vi.fn();
    const stop = startExhibitVideo(video, unavailable);
    stop();
    await Promise.resolve();
    expect(unavailable).not.toHaveBeenCalled();
  });
});