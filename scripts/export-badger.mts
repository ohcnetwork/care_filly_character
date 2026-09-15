/**
 * Filly sprite sheets for the GitHub Universe 2025 badge (Badger / Tufty 2350,
 * MicroPython `badgeware`): one paletted PNG per state plus `manifest.json`.
 *
 *   npm run export:badger [-- --out badger/apps/filly/assets] [--port 5179] [--cell 56] [--cols 8]
 *
 * Also writes the app's 24×24 `icon.png` next to the assets directory. Frames come from the playground's deterministic frame page (`?state=&t=&from=`),
 * driven through `window.__fillyFrame` so the page loads once. Every frame is
 * cropped to one shared square (so the feet stay put across states), box-filtered
 * down to `cell` px and quantised (median cut) to at most 255 opaque colours plus
 * 1 transparent index — the PNG8 + tRNS layout of the badge's own Mona sheets.
 *
 * Loop seams: a FillyAnimator is stepped in Node with the same seed and dt as the
 * page, and the loop window whose first pose and "one past last" pose match best
 * is chosen, so each loop closes without a visible jump.
 */
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { PNG } from "pngjs";
import { FillyAnimator } from "../src/animation/FillyAnimator";
import { BOUNCE_PERIOD } from "../src/animation/modulators";
import { createPose, POSE_KEYS, type FillyPose, type FillyState } from "../src/core/types";
import { launchBrowser, parseArgs, ROOT, startPlayground, wirePageLogging } from "./harness.mjs";

const READY_TIMEOUT = 90_000;
/** Capture size in CSS px (deviceScaleFactor 1); ~8× the default cell for a clean box filter. */
const CAPTURE_SIZE = 448;
/** Alpha at or above this (after the box filter) is opaque; below is transparent (binary alpha). */
const ALPHA_THRESHOLD = 128;
/** Seam candidates within this pose distance of the best one count as equal; the earliest wins. */
const SEAM_TOLERANCE = 0.01;
/** Menu icon size (px). */
const ICON_SIZE = 24;
/** Extra transparent pixels around the shared crop, in capture px. */
const CROP_PADDING = 6;

interface SheetPlan {
  state: FillyState;
  fps: number;
  /** Start in this state and ease into `state`: the transition frames precede the loop. */
  from?: FillyState;
  /** Loop length in seconds. 0 = one-shot: the badge holds the last frame. */
  loop: number;
  /**
   * [earliest, latest] loop start in seconds after entering `state`. The seam
   * search scans this range in whole frames; the springs should have settled
   * by `earliest`. For a one-shot, `earliest` is the sheet length.
   */
  lead: readonly [number, number];
  audio?: number;
}

/**
 * Loop lengths follow the overlay periods in src/animation/modulators.ts.
 * Frame budgets keep every sheet ≤ ~100 kB decoded (56 px cells ≈ 3.1 kB each):
 * the badge holds idle plus one reaction sheet in RAM.
 */
const PLANS: readonly SheetPlan[] = [
  { state: "idle", fps: 8, loop: 4, lead: [1, 2] }, // breathing 0.25 Hz; before the first idle glance
  { state: "listening", fps: 10, from: "idle", loop: 1, lead: [1, 1.5] }, // ear wiggle 3 Hz
  { state: "talking", fps: 10, from: "idle", loop: 2, lead: [1, 1] }, // synthetic syllables: any seam reads as speech
  { state: "happy", fps: 10, from: "idle", loop: BOUNCE_PERIOD, lead: [2 * BOUNCE_PERIOD, 2 * BOUNCE_PERIOD] },
  { state: "thinking", fps: 10, from: "idle", loop: 2, lead: [1, 1] }, // eye-drift seam is sub-pixel at 56 px
  { state: "surprised", fps: 10, from: "idle", loop: 0, lead: [1.5, 1.5] }, // one-shot: jump, tremble, hold
  { state: "sleepy", fps: 3, from: "idle", loop: 25 / 3, lead: [1.5, 2] }, // one 8.33 s breath (0.12 Hz)
];

interface SheetTiming {
  /** Animator time of each frame. */
  times: number[];
  /** Index of the first frame of the loop (frames before it play once). */
  loopStart: number;
}

interface ManifestSheet {
  file: string;
  frames: number;
  cols: number;
  rows: number;
  fps: number;
  loop_start: number;
}

interface Manifest {
  cell: number;
  /** Feet baseline: y offset of the character's lowest opaque pixel inside a cell. */
  baseline: number;
  sheets: Record<FillyState, ManifestSheet>;
}

/** Mirror of the playground's `window.__fillyFrame` (playground/FrameMode.tsx); evaluate callbacks run in the browser. */
interface FramePage {
  __fillyFrame: (next: {
    state: FillyState;
    t: number;
    from?: FillyState;
    audioLevel: number | null;
    blink: boolean;
  }) => Promise<void>;
}
declare const window: FramePage;

// ── timing ────────────────────────────────────────────────────────────────────

/** Same call sequence as FillyScene's freeze effect; `stepTo` uses the same 1/60 s steps. */
function freshAnimator(plan: SheetPlan): FillyAnimator {
  const animator = new FillyAnimator({ seed: 1, initialState: plan.from ?? plan.state });
  animator.reset();
  if (plan.from !== undefined) animator.setState(plan.state);
  if (plan.audio !== undefined) animator.setAudioLevel(plan.audio);
  return animator;
}

function poseDistance(a: FillyPose, b: FillyPose): number {
  let d = 0;
  for (const k of POSE_KEYS) d += (a[k] - b[k]) ** 2;
  return d;
}

/**
 * Loop start in whole frames within `plan.lead`: the earliest candidate whose
 * pose is within SEAM_TOLERANCE of the best match with the pose one loop later.
 */
function pickLead(plan: SheetPlan): number {
  const step = 1 / plan.fps;
  const first = Math.ceil(plan.lead[0] * plan.fps - 1e-9);
  const last = Math.max(first, Math.floor(plan.lead[1] * plan.fps + 1e-9));
  const start = createPose();
  const distances: number[] = [];
  for (let i = first; i <= last; i++) {
    const animator = freshAnimator(plan);
    Object.assign(start, animator.stepTo(i * step));
    distances.push(Math.sqrt(poseDistance(start, animator.stepTo(i * step + plan.loop))));
  }
  const best = Math.min(...distances);
  const pick = distances.findIndex((d) => d <= best + SEAM_TOLERANCE);
  return (first + pick) * step;
}

function planTiming(plan: SheetPlan): SheetTiming {
  const step = 1 / plan.fps;
  if (plan.loop === 0) {
    const count = Math.round(plan.lead[0] * plan.fps);
    return { times: Array.from({ length: count }, (_, i) => i * step), loopStart: count - 1 };
  }
  const lead = pickLead(plan);
  const loopFrames = Math.round(plan.loop * plan.fps);
  if (plan.from === undefined) {
    // Already settled: the sheet is the loop window itself.
    return { times: Array.from({ length: loopFrames }, (_, i) => lead + i * step), loopStart: 0 };
  }
  const leadFrames = Math.round(lead * plan.fps);
  return {
    times: Array.from({ length: leadFrames + loopFrames }, (_, i) => i * step),
    loopStart: leadFrames,
  };
}

// ── pixels ────────────────────────────────────────────────────────────────────

interface Rgba {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, straight (non-premultiplied) alpha
}

interface Box {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

function decodePng(buffer: Buffer): Rgba {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

function alphaBounds(image: Rgba, minAlpha: number): Box | null {
  let x0 = image.width;
  let y0 = image.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] < minAlpha) continue;
      if (x < x0) x0 = x;
      if (x >= x1) x1 = x + 1;
      if (y < y0) y0 = y;
      if (y >= y1) y1 = y + 1;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** Grow `box` to a square around its centre (plus padding), clamped to the image. */
function squareBox(box: Box, pad: number, width: number, height: number): Box {
  const size = Math.min(Math.max(box.x1 - box.x0, box.y1 - box.y0) + 2 * pad, width, height);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const x0 = Math.round(Math.min(Math.max(cx - size / 2, 0), width - size));
  const y0 = Math.round(Math.min(Math.max(cy - size / 2, 0), height - size));
  return { x0, y0, x1: x0 + size, y1: y0 + size };
}

/**
 * Area-averaging resample of `box` in `src` to a `cell`×`cell` RGBA image.
 * Colours are averaged premultiplied, so edge pixels keep the character's
 * colour rather than bleeding towards transparent black. With `binaryAlpha`
 * (sprite sheets) coverage ≥ ALPHA_THRESHOLD is opaque and the rest is clear.
 */
function resampleCell(src: Rgba, box: Box, cell: number, binaryAlpha = true): Rgba {
  const out = new Uint8Array(cell * cell * 4);
  const scale = (box.x1 - box.x0) / cell;
  const sums = new Float64Array(4);
  for (let cy = 0; cy < cell; cy++) {
    const sy0 = box.y0 + cy * scale;
    const sy1 = sy0 + scale;
    for (let cx = 0; cx < cell; cx++) {
      const sx0 = box.x0 + cx * scale;
      const sx1 = sx0 + scale;
      sums.fill(0);
      let area = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const w = wy * (Math.min(sx + 1, sx1) - Math.max(sx, sx0));
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3] / 255;
          sums[0] += src.data[i] * a * w;
          sums[1] += src.data[i + 1] * a * w;
          sums[2] += src.data[i + 2] * a * w;
          sums[3] += a * w;
          area += w;
        }
      }
      const o = (cy * cell + cx) * 4;
      const alpha = (sums[3] / area) * 255;
      if (sums[3] > 0 && (binaryAlpha ? alpha >= ALPHA_THRESHOLD : alpha >= 1)) {
        out[o] = Math.round(sums[0] / sums[3]);
        out[o + 1] = Math.round(sums[1] / sums[3]);
        out[o + 2] = Math.round(sums[2] / sums[3]);
        out[o + 3] = binaryAlpha ? 255 : Math.round(alpha);
      }
    }
  }
  return { width: cell, height: cell, data: out };
}

/** Lay `cells` out on a `cols`-wide grid (row-major), transparent elsewhere. */
function composeGrid(cells: Rgba[], cell: number, cols: number): Rgba {
  const rows = Math.ceil(cells.length / cols);
  const width = cols * cell;
  const height = rows * cell;
  const data = new Uint8Array(width * height * 4);
  cells.forEach((c, i) => {
    const ox = (i % cols) * cell;
    const oy = Math.floor(i / cols) * cell;
    for (let y = 0; y < cell; y++) {
      data.set(c.data.subarray(y * cell * 4, (y + 1) * cell * 4), ((oy + y) * width + ox) * 4);
    }
  });
  return { width, height, data };
}

// ── PNG8 + tRNS ───────────────────────────────────────────────────────────────

/** Median-cut palette of at most `maxColours` RGB entries for the opaque pixels. */
function medianCut(image: Rgba, maxColours: number): number[][] {
  const pixels: number[][] = [];
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] === 255) pixels.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
  }
  if (pixels.length === 0) return [];
  const unique = new Map<number, number[]>();
  for (const p of pixels) unique.set((p[0] << 16) | (p[1] << 8) | p[2], p);
  if (unique.size <= maxColours) return [...unique.values()];

  const buckets: number[][][] = [pixels];
  while (buckets.length < maxColours) {
    let widest = -1;
    let widestRange = -1;
    let widestChannel = 0;
    buckets.forEach((bucket, index) => {
      if (bucket.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255;
        let hi = 0;
        for (const p of bucket) {
          if (p[ch] < lo) lo = p[ch];
          if (p[ch] > hi) hi = p[ch];
        }
        if (hi - lo > widestRange) {
          widestRange = hi - lo;
          widest = index;
          widestChannel = ch;
        }
      }
    });
    if (widest < 0 || widestRange === 0) break;
    const bucket = buckets[widest].sort((a, b) => a[widestChannel] - b[widestChannel]);
    const mid = bucket.length >> 1;
    buckets.splice(widest, 1, bucket.slice(0, mid), bucket.slice(mid));
  }
  return buckets.map((bucket) => {
    const sum = [0, 0, 0];
    for (const p of bucket) for (let ch = 0; ch < 3; ch++) sum[ch] += p[ch];
    return sum.map((v) => Math.round(v / bucket.length));
  });
}

function nearestIndex(palette: number[][], r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

function pngChunk(type: string, body: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body, zlib.crc32(typeBytes)));
  return Buffer.concat([length, typeBytes, body, crc]);
}

/** Encode as PNG colour type 3 (8-bit indexed): index 0 transparent, then the palette. */
function encodePng8(image: Rgba): Buffer {
  const palette = medianCut(image, 255);
  const cache = new Map<number, number>();
  const rows = Buffer.alloc((image.width + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    rows[y * (image.width + 1)] = 0; // filter: none
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      let index = 0;
      if (image.data[i + 3] === 255) {
        const key = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
        let hit = cache.get(key);
        if (hit === undefined) {
          hit = nearestIndex(palette, image.data[i], image.data[i + 1], image.data[i + 2]) + 1;
          cache.set(key, hit);
        }
        index = hit;
      }
      rows[y * (image.width + 1) + 1 + x] = index;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // colour type: indexed
  const plte = Buffer.alloc((palette.length + 1) * 3);
  palette.forEach(([r, g, b], i) => {
    plte[(i + 1) * 3] = r;
    plte[(i + 1) * 3 + 1] = g;
    plte[(i + 1) * 3 + 2] = b;
  });
  const trns = Buffer.from([0]); // only index 0 is transparent; omitted entries are opaque

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", plte),
    pngChunk("tRNS", trns),
    pngChunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, args.out ?? "badger/apps/filly/assets");
  const port = Number(args.port ?? 5179);
  const cell = Number(args.cell ?? 56);
  const cols = Number(args.cols ?? 8);
  await fs.mkdir(outDir, { recursive: true });

  const timings = new Map<FillyState, SheetTiming>();
  for (const plan of PLANS) {
    const timing = planTiming(plan);
    timings.set(plan.state, timing);
    console.log(
      `${plan.state.padEnd(10)} ${String(timing.times.length).padStart(3)} frames @ ${plan.fps} fps, loop from #${timing.loopStart}`,
    );
  }

  const pg = await startPlayground(port);
  const browser = await launchBrowser();
  const captured = new Map<FillyState, Rgba[]>();
  try {
    const context = await browser.newContext({
      viewport: { width: CAPTURE_SIZE + 40, height: CAPTURE_SIZE + 40 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    wirePageLogging(page, "badger");
    await page.goto(`${pg.url}/?state=idle&t=1&size=${CAPTURE_SIZE}`, { waitUntil: "load" });
    const wrapper = page.locator("[data-ready='1']").first();
    await wrapper.waitFor({ state: "attached", timeout: READY_TIMEOUT });
    await page.addStyleTag({ content: "html, body, .frame { background: transparent !important; }" });

    for (const plan of PLANS) {
      const timing = timings.get(plan.state)!;
      const frames: Rgba[] = [];
      for (const t of timing.times) {
        // Remounts the character; resolves from its onReady (frame on canvas).
        await page.evaluate(
          ({ state, t, from, audio }) =>
            window.__fillyFrame({ state, t, from, audioLevel: audio ?? null, blink: false }),
          { state: plan.state, t, from: plan.from, audio: plan.audio },
        );
        await page.waitForTimeout(50);
        frames.push(decodePng(await page.locator("[data-ready='1']").first().screenshot({ omitBackground: true })));
      }
      captured.set(plan.state, frames);
      console.log(`captured ${plan.state}`);
    }
    await context.close();
  } finally {
    await browser.close();
    await pg.close();
  }

  // One crop for every state, so the feet line up when the badge swaps sheets.
  let bounds: Box | null = null;
  for (const frames of captured.values()) for (const f of frames) bounds = unionBox(bounds, alphaBounds(f, ALPHA_THRESHOLD));
  if (!bounds) throw new Error("no opaque pixels captured");
  const crop = squareBox(bounds, CROP_PADDING, CAPTURE_SIZE, CAPTURE_SIZE);
  console.log(`crop ${crop.x1 - crop.x0}px square at (${crop.x0}, ${crop.y0}) → ${cell}px cells`);

  const manifest: Manifest = { cell, baseline: 0, sheets: {} as Manifest["sheets"] };
  let lowest = 0;
  for (const plan of PLANS) {
    const cells = captured.get(plan.state)!.map((f) => resampleCell(f, crop, cell));
    for (const c of cells) {
      const b = alphaBounds(c, 255);
      if (b && b.y1 > lowest) lowest = b.y1;
    }
    const sheetCols = Math.min(cols, cells.length);
    const sheet = composeGrid(cells, cell, sheetCols);
    const file = `filly-${plan.state}.png`;
    const png = encodePng8(sheet);
    await fs.writeFile(path.join(outDir, file), png);
    const timing = timings.get(plan.state)!;
    manifest.sheets[plan.state] = {
      file,
      frames: cells.length,
      cols: sheetCols,
      rows: Math.ceil(cells.length / sheetCols),
      fps: plan.fps,
      loop_start: timing.loopStart,
    };
    console.log(`${file}: ${sheet.width}×${sheet.height}, ${cells.length} frames, ${(png.length / 1024).toFixed(1)} kB`);
  }
  manifest.baseline = lowest;
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(path.join(outDir, "manifest.json"));

  // Menu icon: the first idle frame, soft alpha, RGBA like the badge's own icons.
  const icon = resampleCell(captured.get("idle")![0], crop, ICON_SIZE, false);
  const iconPng = new PNG({ width: ICON_SIZE, height: ICON_SIZE });
  iconPng.data = Buffer.from(icon.data);
  const iconFile = path.join(outDir, "..", "icon.png");
  await fs.writeFile(iconFile, PNG.sync.write(iconPng));
  console.log(iconFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
