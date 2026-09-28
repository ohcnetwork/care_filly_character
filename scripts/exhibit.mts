import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EXHIBIT_CHAPTERS, EXHIBIT_CUES } from "../playground/exhibitPlayback.ts";
import { launchBrowser, parseArgs, startPlayground } from "./harness.mts";

const args = parseArgs(process.argv.slice(2));
const server = args.url ? undefined : await startPlayground(Number(args.port ?? 5181));
const url = args.url ?? server!.url;
const output = path.resolve(args.out ?? path.join(tmpdir(), "care-filly-exhibit"));
const browser = await launchBrowser();
const errors: string[] = [];

try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.clock.install();
  const response = await page.goto(`${url}/exhibit/`);
  assert.equal(response?.status(), 200);
  assert.match(response?.headers()["content-type"] ?? "", /text\/html/);
  await page.bringToFront();
  await page.locator('[data-ready="1"]').waitFor();
  assert.equal(await page.evaluate(() => document.visibilityState), "visible");
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  const exhibit = page.getByRole("main", { name: "CARE exhibition" });

  await page.getByRole("button", { name: "Pause presentation", exact: true }).click();
  assert.equal(await exhibit.getAttribute("data-playing"), "false");
  const pausedCue = await exhibit.getAttribute("data-cue-index");
  await page.clock.fastForward(60000);
  assert.equal(await exhibit.getAttribute("data-cue-index"), pausedCue);
  console.log("PASS pause holds the current narration cue");

  for (const viewport of [
    { name: "exhibition", width: 1920, height: 1080 },
    { name: "desktop", width: 1440, height: 900 },
    { name: "laptop", width: 1280, height: 720 },
    { name: "mobile", width: 390, height: 844 },
    { name: "compact", width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    for (const chapter of EXHIBIT_CHAPTERS) {
      await page.getByRole("button", { name: chapter.label, exact: true }).click();
      await page.clock.runFor(750);
      await page.locator(".exhibit-story").evaluate((element) => {
        for (const animation of element.getAnimations({ subtree: true })) animation.finish();
      });
      assert.equal(await page.locator("h1").textContent(), chapter.title);
      const bounds = await page.evaluate(() => {
        const story = document.querySelector(".exhibit-story")!.getBoundingClientRect();
        const presenter = document.querySelector(".exhibit-presenter")!.getBoundingClientRect();
        const caption = document.querySelector(".exhibit-caption-band")!.getBoundingClientRect();
        const controls = document.querySelector(".exhibit-controls")!.getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          storyRight: story.right,
          storyBottom: story.bottom,
          storyTransform: getComputedStyle(document.querySelector(".exhibit-story")!).transform,
          presenterLeft: presenter.left,
          presenterTop: presenter.top,
          presenterBottom: presenter.bottom,
          captionTop: caption.top,
          controlsLeft: controls.left,
          controlsRight: controls.right,
        };
      });
      const label = `${viewport.name}: ${chapter.id}`;
      assert.ok(bounds.scrollWidth <= bounds.width + 1, `${label}: horizontal overflow ${JSON.stringify(bounds)}`);
      assert.ok(bounds.controlsLeft >= 0 && bounds.controlsRight <= bounds.width + 1, `${label}: controls overflow`);
      assert.ok(bounds.presenterBottom <= bounds.captionTop + 1, `${label}: presenter overlaps captions`);
      if (viewport.width > 700) {
        assert.ok(bounds.storyRight <= bounds.presenterLeft + 1, `${label}: story overlaps presenter`);
        assert.ok(bounds.storyBottom <= bounds.captionTop + 1, `${label}: story overlaps captions`);
        assert.ok(bounds.scrollHeight <= bounds.height + 1, `${label}: kiosk needs scrolling`);
      } else {
        assert.ok(bounds.storyBottom <= bounds.presenterTop + 1, `${label}: mobile story overlaps presenter ${JSON.stringify(bounds)}`);
      }
    }
    await page.getByRole("button", { name: "Meet CARE", exact: true }).click();
    await page.clock.runFor(750);
    await page.screenshot({ path: path.join(output, `${viewport.name}.png`), fullPage: true, animations: "disabled" });
    const pixels = await page.locator("canvas").screenshot();
    const greenFraction = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const probe = document.createElement("canvas");
      probe.width = image.width;
      probe.height = image.height;
      const context = probe.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, probe.width, probe.height).data;
      let greenPixels = 0;
      for (let offset = 0; offset < rgba.length; offset += 4) {
        if (rgba[offset + 1] > rgba[offset] + 22 && rgba[offset + 1] > rgba[offset + 2] + 22) greenPixels += 1;
      }
      return greenPixels / (probe.width * probe.height);
    }, pixels.toString("base64"));
    assert.ok(greenFraction > 0.025, `${viewport.name}: Filly canvas is blank (${greenFraction})`);
    console.log(`PASS ${viewport.name}: all chapters fit; Filly occupies ${(greenFraction * 100).toFixed(1)}% green pixels`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Restart presentation", exact: true }).click();
  for (let turn = 0; turn < EXHIBIT_CUES.length * 2; turn += 1) {
    const cueIndex = turn % EXHIBIT_CUES.length;
    assert.equal(await exhibit.getAttribute("data-cue-index"), String(cueIndex));
    const currentCue = EXHIBIT_CUES[cueIndex];
    let cueStartedAt = await page.evaluate(() => Date.now());
    if (currentCue.media) {
      const video = page.locator(".exhibit-media video");
      await video.waitFor({ timeout: 5000 });
      assert.equal(await video.getAttribute("src"), currentCue.media.src);
      assert.equal(await video.getAttribute("poster"), currentCue.media.poster);
      await page.clock.resume();
      await page.waitForFunction(() => {
        const element = document.querySelector<HTMLVideoElement>(".exhibit-media video");
        return element && element.readyState >= 2 && !element.paused;
      });

      if (turn < EXHIBIT_CUES.length) {
        await page.getByRole("button", { name: "Pause presentation", exact: true }).click();
        await page.waitForFunction(() => document.querySelector<HTMLVideoElement>(".exhibit-media video")?.paused === true);
        const pausedTime = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
        for (const viewport of [
          { name: "desktop", width: 1440, height: 900 },
          { name: "mobile", width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport);
          await page.locator(".exhibit-story").evaluate((element) => {
            for (const animation of element.getAnimations({ subtree: true })) animation.finish();
          });
          const layout = await page.evaluate(() => {
            const title = document.querySelector(".exhibit-story")!.getBoundingClientRect();
            const presenter = document.querySelector(".exhibit-presenter")!.getBoundingClientRect();
            const media = document.querySelector(".exhibit-media")!.getBoundingClientRect();
            const caption = document.querySelector(".exhibit-caption-band")!.getBoundingClientRect();
            return {
              width: innerWidth,
              height: innerHeight,
              scrollWidth: document.documentElement.scrollWidth,
              scrollHeight: document.documentElement.scrollHeight,
              titleRight: title.right,
              titleBottom: title.bottom,
              presenterLeft: presenter.left,
              presenterTop: presenter.top,
              presenterRight: presenter.right,
              presenterBottom: presenter.bottom,
              presenterWidth: presenter.width,
              presenterHeight: presenter.height,
              mediaLeft: media.left,
              mediaTop: media.top,
              mediaRight: media.right,
              mediaBottom: media.bottom,
              captionTop: caption.top,
            };
          });
          const label = `${viewport.name}: ${currentCue.media.src}`;
          assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: horizontal overflow ${JSON.stringify(layout)}`);
          assert.ok(layout.mediaBottom <= layout.captionTop + 1, `${label}: video overlaps captions ${JSON.stringify(layout)}`);
          assert.ok(layout.presenterWidth >= layout.presenterHeight * .9, `${label}: Filly's canvas is too narrow to frame the model ${JSON.stringify(layout)}`);
          if (viewport.width > 700) {
            assert.ok(layout.scrollHeight <= layout.height + 1, `${label}: kiosk needs scrolling`);
            assert.ok(layout.titleRight <= layout.mediaLeft && layout.presenterRight <= layout.mediaLeft, `${label}: video overlaps presenter`);
            assert.ok(layout.titleBottom <= layout.presenterTop + 1, `${label}: title overlaps Filly`);
          } else {
            assert.ok(layout.titleRight <= layout.presenterLeft + 1, `${label}: mobile title overlaps Filly`);
            assert.ok(Math.max(layout.titleBottom, layout.presenterBottom) <= layout.mediaTop + 1, `${label}: mobile video overlaps heading`);
          }
          await page.screenshot({ path: path.join(output, `${viewport.name}-${path.basename(currentCue.media.src, ".mp4")}.png`), fullPage: true, animations: "disabled" });
        }
        assert.equal(await video.evaluate((element: HTMLVideoElement) => element.currentTime), pausedTime);
        const colors = await video.evaluate((element: HTMLVideoElement) => {
          const probe = document.createElement("canvas");
          probe.width = 64;
          probe.height = 64;
          const context = probe.getContext("2d")!;
          context.drawImage(element, 0, 0, 64, 64);
          const pixels = context.getImageData(0, 0, 64, 64).data;
          const distinct = new Set<string>();
          for (let offset = 0; offset < pixels.length; offset += 4) distinct.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
          return distinct.size;
        });
        assert.ok(colors > 32, `${currentCue.media.src}: blank video frame`);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.getByRole("button", { name: "Play presentation", exact: true }).click();
        await page.waitForFunction(() => document.querySelector<HTMLVideoElement>(".exhibit-media video")?.paused === false);
        cueStartedAt = await page.evaluate(() => Date.now());
        console.log(`PASS ${currentCue.media.src}: desktop/mobile framing, decoded pixels, pause/resume`);
      }

      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
      const videoState = await video.evaluate((element: HTMLVideoElement) => ({
        muted: element.muted,
        paused: element.paused,
        ready: element.readyState >= 2,
        error: element.error?.message ?? null,
      }));
      assert.deepEqual(videoState, { muted: true, paused: false, ready: true, error: null }, currentCue.media.src);
    }
    const elapsed = await page.evaluate(() => Date.now()) - cueStartedAt;
    await page.clock.fastForward(Math.max(0, currentCue.durationMs - elapsed) + 250);
    const expected = (cueIndex + 1) % EXHIBIT_CUES.length;
    const observed = await exhibit.getAttribute("data-cue-index");
    assert.equal(observed, String(expected), `After cue ${cueIndex}: ${currentCue.media?.src ?? "narration"}; ${(await page.locator(".exhibit-notice").allTextContents()).join(" ")}`);
    await page.waitForFunction((index) => document.querySelector(".exhibit")?.getAttribute("data-cue-index") === String(index), expected);
  }
  console.log("PASS two complete automatic loops");

  await page.clock.runFor(400);
  const firstFrame = await page.locator("canvas").screenshot();
  await page.clock.runFor(700);
  const secondFrame = await page.locator("canvas").screenshot();
  assert.notEqual(createHash("sha256").update(firstFrame).digest("hex"), createHash("sha256").update(secondFrame).digest("hex"));
  console.log("PASS Filly animation changes canvas pixels");

  await page.locator("h1").click();
  await page.keyboard.press("Space");
  assert.equal(await exhibit.getAttribute("data-playing"), "false");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("h1").textContent(), EXHIBIT_CHAPTERS[1].title);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.locator("h1").textContent(), EXHIBIT_CHAPTERS[0].title);
  await page.keyboard.press("r");
  assert.equal(await exhibit.getAttribute("data-playing"), "true");
  console.log("PASS keyboard pause, chapter navigation, and restart");

  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
    await page.getByRole("button", { name: "Exit fullscreen", exact: true }).waitFor();
    await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    await page.getByRole("button", { name: "Enter fullscreen", exact: true }).waitFor();
    console.log("PASS fullscreen enter and exit");
  }

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() => document.querySelector(".exhibit")?.getAttribute("data-playing") === "false");
  const hiddenCue = await exhibit.getAttribute("data-cue-index");
  await page.clock.fastForward(60000);
  assert.equal(await exhibit.getAttribute("data-cue-index"), hiddenCue);
  await page.evaluate(() => {
    delete (document as Partial<Document>).visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForFunction(() => document.querySelector(".exhibit")?.getAttribute("data-playing") === "true");
  console.log("PASS hidden displays pause and resume");

  const voicePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  voicePage.on("pageerror", (error) => errors.push(error.message));
  voicePage.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await voicePage.addInitScript(() => {
    const state = { current: null as SpeechSynthesisUtterance | null };
    Object.defineProperty(window, "__exhibitVoice", { value: state });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices() { return []; },
        cancel() { state.current = null; },
        speak(utterance: SpeechSynthesisUtterance) { state.current = utterance; },
      },
    });
  });
  const voiceResponse = await voicePage.goto(`${url}/exhibit`);
  assert.equal(voiceResponse?.status(), 200);
  assert.match(voiceResponse?.headers()["content-type"] ?? "", /text\/html/);
  await voicePage.bringToFront();
  await voicePage.locator('[data-ready="1"]').waitFor();
  assert.deepEqual(errors, [], "Browser setup errors");
  const voiceExhibit = voicePage.getByRole("main", { name: "CARE exhibition" });
  await voicePage.getByRole("button", { name: "Enable narration", exact: true }).click();
  await voicePage.waitForFunction(() => Reflect.get(window, "__exhibitVoice").current !== null);
  assert.equal(await voicePage.getByRole("button", { name: "Mute narration", exact: true }).getAttribute("aria-pressed"), "true");
  await voicePage.evaluate(() => {
    const utterance = Reflect.get(window, "__exhibitVoice").current as SpeechSynthesisUtterance;
    utterance.dispatchEvent(new Event("start"));
    utterance.dispatchEvent(new Event("end"));
  });
  await voicePage.locator('[data-cue-index="1"]').waitFor();
  await voicePage.waitForFunction((text) => Reflect.get(window, "__exhibitVoice").current?.text === text, EXHIBIT_CUES[1].text);
  await voicePage.getByRole("button", { name: "Pause presentation", exact: true }).click();
  await voicePage.waitForFunction(() => Reflect.get(window, "__exhibitVoice").current === null);
  assert.equal(await voiceExhibit.getAttribute("data-cue-index"), "1");
  await voicePage.getByRole("button", { name: "Mute narration", exact: true }).click();
  await voicePage.getByRole("button", { name: "Enable narration", exact: true }).waitFor();
  console.log("PASS narration toggle, spoken-cue completion, and speech cancellation (simulated engine)");

  await voicePage.evaluate(() => {
    const unavailable = {
      speak() { throw new Error("Simulated unavailable voice"); },
    };
    speechSynthesis.speak = unavailable.speak;
  });
  await voicePage.getByRole("button", { name: "Restart presentation", exact: true }).click();
  await voicePage.getByRole("button", { name: "Enable narration", exact: true }).click();
  await voicePage.getByRole("status").waitFor();
  assert.match(await voicePage.getByRole("status").textContent() ?? "", /Voice unavailable/);
  await voicePage.getByRole("button", { name: "Enable narration", exact: true }).waitFor();
  await voicePage.locator('[data-cue-index="1"]').waitFor();
  console.log("PASS unavailable voice recovers into automatic caption playback");

  assert.deepEqual(errors, [], "Browser errors");
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
  await server?.close();
}