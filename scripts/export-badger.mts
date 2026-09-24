/**
 * Filly sprite frames for the GitHub Universe 2025 badge (Badger / Tufty 2350,
 * MicroPython `badgeware`): one paletted PNG per animation frame, grouped in a
 * directory per state, plus `manifest.json`.
 *
 *   npm run export:badger [-- --out badger/filly/assets] [--apps badger/apps] [--port 5179] [--body 72]
 *                         [--targets frames,icons,flappy,run]
 *
 * Also writes the 24×24 `icon.png` of each badge app (see ICONS) and the small
 * sprite sheets of the games (see SHEETS). `--targets` limits the run to some
 * outputs; only the states those outputs need are captured.
 *
 * Why single frames: the badge's MicroPython heap is ~240 kB and fragmented
 * (largest free block ≈ 48 kB), so a per-state sprite sheet cannot be decoded.
 * The app decodes the current frame from flash instead, like MonaOS's own
 * startup animation.
 *
 * Frames come from the playground's deterministic frame page (`?state=&t=&from=`),
 * driven through `window.__fillyFrame` so the page loads once.
 *
 * Size and anchor: one scale for every state, set so the idle body is `body`
 * px tall on the badge. Each state gets its own crop box (the smallest box
 * around all of its frames), so the idle body is not shrunk to make room for
 * the happy bounce or the sleepy zzz. The manifest stores each box as an
 * offset (`ox`, `oy`) from a shared anchor: the feet point, the bottom centre
 * of the idle body. An app blits a frame at (anchor_x + ox, anchor_y + oy) and
 * the feet stay put when the state changes.
 *
 * Every frame is box-filtered down to the badge scale and quantised (median
 * cut) to at most 255 opaque colours plus 1 transparent index — the PNG8 +
 * tRNS layout of the badge's own Mona sheets.
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
/** Capture size in CSS px (deviceScaleFactor 1); ~6× the badge scale for a clean box filter. */
const CAPTURE_SIZE = 448;
/** Alpha at or above this (after the box filter) is opaque; below is transparent (binary alpha). */
const ALPHA_THRESHOLD = 128;
/** Seam candidates within this pose distance of the best one count as equal; the earliest wins. */
const SEAM_TOLERANCE = 0.01;
/** Menu icon size (px). */
const ICON_SIZE = 24;
/** Extra transparent pixels around each crop box, in badge px. */
const CROP_PADDING = 1;
/** Height of the idle body on the badge (px). The badge screen is 160×120. */
const DEFAULT_BODY = 72;

/** Menu icon of each badge app: a frame of one state, cropped to that frame. `peak` = the loop frame that reaches highest. */
const ICONS: readonly { app: string; state: FillyState; frame: "first" | "loop" | "peak" }[] = [
  { app: "filly-mascot", state: "idle", frame: "first" },
  { app: "filly-pulse", state: "surprised", frame: "loop" },
  { app: "filly-pet", state: "happy", frame: "loop" },
  { app: "flappy-filly", state: "happy", frame: "peak" },
  { app: "filly-run", state: "happy", frame: "loop" },
];

/** One cell of a game sprite sheet. */
type SheetCell =
  /** A frame of the state's loop, as an index from the loop start (wraps). */
  | { state: FillyState; loop: number }
  /** The held last frame of a one-shot state. */
  | { state: FillyState; last: true }
  /** An extra capture: the state at time `t` with these pose values replaced. */
  | { state: FillyState; t: number; pose: Partial<FillyPose> };

/**
 * A game sprite sheet: one row of square cells at its own scale, one PNG8 the
 * game keeps in RAM. `align` says where a frame sits in its cell:
 * - `feet`: the frame cropped to itself, centred left to right, its lowest
 *   pixel 1 px above the cell bottom, like the badge's own 24 px Mona sheet.
 *   A bounce does not move the body in the cell.
 * - `anchor`: the shared feet point (bottom centre of the idle body) 1 px above
 *   the cell's bottom centre, so a frame keeps its true position: a bounce
 *   lifts the body in the cell, and cells of different states line up.
 */
interface SheetSpec {
  app: string;
  file: string;
  /** Height of the idle body in a cell (px). */
  body: number;
  /** Cell size (px): the tallest pose must fit. */
  cell: number;
  align: "feet" | "anchor";
  cells: readonly SheetCell[];
}

/**
 * The happy loop is a bounce: 0 landing squash, 1 stretched on the way up,
 * 2–4 in the air (3 is the top), 5 on the way down, 6 about to land. The happy
 * plan has a fixed lead, so the loop start and the phase are the same on every
 * export.
 */
const hop = (loop: number): SheetCell => ({ state: "happy", loop });

/**
 * Duck pose of the runner. The body pivot is at the feet, so a smaller
 * `bodyScaleY` squashes the body toward the floor; the wider `bodyScaleX`
 * keeps the volume. Ears back, a small lean toward the viewer, arms a bit out.
 */
const DUCK_POSE: Partial<FillyPose> = {
  bodyScaleY: 0.62,
  bodyScaleX: 1.22,
  bodyPitch: 0.18,
  earL: -0.45,
  earR: -0.45,
  armL: 0.25,
  armR: 0.25,
};

const SHEETS = {
  /**
   * flappy-filly: the pillar gap is 52 px, so the body is 24 px like Mona's
   * flappy sprite. Cells: rise, float, sink, fall (picked from the vertical
   * speed, like Mona's flying-to-falling row), then hit.
   */
  flappy: {
    app: "flappy-filly",
    file: "assets/filly.png",
    body: 24,
    cell: 32, // the tallest pose (surprised) is 29 px at this body height
    align: "feet",
    cells: [hop(1), hop(3), hop(5), hop(0), { state: "surprised", last: true }],
  },
  /**
   * filly-run: Filly hops along the ground (Filly has no legs), so the whole
   * happy loop is the run cycle; a jump picks a cell from the vertical speed.
   * Cells: hop 0–6, hit, duck.
   */
  run: {
    app: "filly-run",
    file: "assets/filly.png",
    body: 36,
    cell: 48, // the highest reach from the feet point (happy, surprised) is 43 px at this body height
    align: "anchor",
    cells: [...[0, 1, 2, 3, 4, 5, 6].map(hop), { state: "surprised", last: true }, { state: "idle", t: 1, pose: DUCK_POSE }],
  },
} satisfies Record<string, SheetSpec>;

type Target = "frames" | "icons" | keyof typeof SHEETS;
const TARGETS: readonly Target[] = ["frames", "icons", "flappy", "run"];

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

/** Loop lengths follow the overlay periods in src/animation/modulators.ts. */
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

interface ManifestClip {
  /** Directory under assets/ holding `00.png` … `NN.png`. */
  dir: string;
  frames: number;
  fps: number;
  /** Frames before this index play once; from it the clip loops. */
  loop_start: number;
  /** Frame size (px). */
  w: number;
  h: number;
  /** Top-left of the frame, relative to the anchor (the feet point). Blit at (anchor_x + ox, anchor_y + oy). */
  ox: number;
  oy: number;
}

interface Manifest {
  /** Badge px per capture px. */
  scale: number;
  /** Size of the idle body (px); its bottom centre is the anchor. */
  body: { w: number; h: number };
  /** Farthest any frame reaches from the anchor (px): left and right of it, up from it, down below it. */
  extent: { left: number; right: number; up: number; down: number };
  states: Record<FillyState, ManifestClip>;
}

/** Mirror of the playground's `window.__fillyFrame` (playground/FrameMode.tsx); evaluate callbacks run in the browser. */
interface FramePage {
  __fillyFrame: (next: {
    state: FillyState;
    t: number;
    from?: FillyState;
    audioLevel: number | null;
    blink: boolean;
    pose: Partial<FillyPose> | null;
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

/** A frame box on the badge, relative to the anchor. */
interface Cell {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

/**
 * The smallest whole-pixel badge box (plus CROP_PADDING) around a capture-px
 * `box`, relative to the anchor. Whole badge px from the anchor keep the feet
 * on the same screen pixel in every state.
 */
function cellFor(box: Box, anchor: { x: number; y: number }, scale: number): Cell {
  const ox = Math.floor((box.x0 - anchor.x) * scale) - CROP_PADDING;
  const oy = Math.floor((box.y0 - anchor.y) * scale) - CROP_PADDING;
  const w = Math.ceil((box.x1 - anchor.x) * scale) + CROP_PADDING - ox;
  const h = Math.ceil((box.y1 - anchor.y) * scale) + CROP_PADDING - oy;
  return { w, h, ox, oy };
}

/** The capture-px source box of a badge `cell`. It may reach outside the capture. */
function sourceBox(cell: Cell, anchor: { x: number; y: number }, scale: number): Box {
  return {
    x0: anchor.x + cell.ox / scale,
    y0: anchor.y + cell.oy / scale,
    x1: anchor.x + (cell.ox + cell.w) / scale,
    y1: anchor.y + (cell.oy + cell.h) / scale,
  };
}

/**
 * Area-averaging resample of `box` in `src` (capture px, may be fractional or
 * reach outside the image; outside pixels are transparent) to a `w`×`h` RGBA
 * image. Colours are averaged premultiplied, so edge pixels keep the
 * character's colour rather than bleeding towards transparent black. With
 * `binaryAlpha` (sprite frames) coverage ≥ ALPHA_THRESHOLD is opaque and the
 * rest is clear.
 */
function resample(src: Rgba, box: Box, w: number, h: number, binaryAlpha = true): Rgba {
  const out = new Uint8Array(w * h * 4);
  const scaleX = (box.x1 - box.x0) / w;
  const scaleY = (box.y1 - box.y0) / h;
  const sums = new Float64Array(4);
  for (let cy = 0; cy < h; cy++) {
    const sy0 = box.y0 + cy * scaleY;
    const sy1 = sy0 + scaleY;
    for (let cx = 0; cx < w; cx++) {
      const sx0 = box.x0 + cx * scaleX;
      const sx1 = sx0 + scaleX;
      sums.fill(0);
      let area = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const weight = wy * (Math.min(sx + 1, sx1) - Math.max(sx, sx0));
          area += weight;
          if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3] / 255;
          sums[0] += src.data[i] * a * weight;
          sums[1] += src.data[i + 1] * a * weight;
          sums[2] += src.data[i + 2] * a * weight;
          sums[3] += a * weight;
        }
      }
      const o = (cy * w + cx) * 4;
      const alpha = (sums[3] / area) * 255;
      if (sums[3] > 0 && (binaryAlpha ? alpha >= ALPHA_THRESHOLD : alpha >= 1)) {
        out[o] = Math.round(sums[0] / sums[3]);
        out[o + 1] = Math.round(sums[1] / sums[3]);
        out[o + 2] = Math.round(sums[2] / sums[3]);
        out[o + 3] = binaryAlpha ? 255 : Math.round(alpha);
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** Index of the loop frame that reaches highest (smallest top edge): the top of a bounce. */
function peakFrame(frames: Rgba[], loopStart: number): number {
  let best = loopStart;
  let top = Infinity;
  for (let i = loopStart; i < frames.length; i++) {
    const bounds = alphaBounds(frames[i], ALPHA_THRESHOLD);
    if (bounds && bounds.y0 < top) {
      top = bounds.y0;
      best = i;
    }
  }
  return best;
}

/** One sheet cell (see SheetSpec.align). `anchor` is the feet point in capture px. */
function sheetCell(frame: Rgba, scale: number, cell: number, align: SheetSpec["align"], anchor: { x: number; y: number }): Rgba {
  const bounds = alphaBounds(frame, ALPHA_THRESHOLD);
  if (!bounds) throw new Error("no opaque pixels for a sheet cell");
  const size = cell / scale;
  const cx = align === "feet" ? (bounds.x0 + bounds.x1) / 2 : anchor.x;
  const y1 = (align === "feet" ? bounds.y1 : anchor.y) + 1 / scale;
  const box = { x0: cx - size / 2, y0: y1 - size, x1: cx + size / 2, y1 };
  if (bounds.x0 < box.x0 || bounds.x1 > box.x1 || bounds.y0 < box.y0 || bounds.y1 > box.y1) {
    const w = (bounds.x1 - bounds.x0) * scale;
    const h = (bounds.y1 - bounds.y0) * scale;
    throw new Error(`sheet frame ${w.toFixed(1)}×${h.toFixed(1)} px (${align} aligned) does not fit a ${cell} px cell`);
  }
  return resample(frame, box, cell, cell);
}

/** Square cells side by side in one row. */
function packRow(cells: Rgba[]): Rgba {
  const size = cells[0].width;
  const width = size * cells.length;
  const out = new Uint8Array(width * size * 4);
  cells.forEach((c, i) => {
    for (let y = 0; y < size; y++) out.set(c.data.subarray(y * size * 4, (y + 1) * size * 4), (y * width + i * size) * 4);
  });
  return { width, height: size, data: out };
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
  const outDir = path.resolve(ROOT, args.out ?? "badger/filly/assets");
  const appsDir = path.resolve(ROOT, args.apps ?? "badger/apps");
  const port = Number(args.port ?? 5179);
  const body = Number(args.body ?? DEFAULT_BODY);
  const targets = new Set<Target>();
  for (const name of (args.targets ?? TARGETS.join(",")).split(",")) {
    if (!TARGETS.includes(name as Target)) throw new Error(`unknown target ${name}; use ${TARGETS.join(", ")}`);
    targets.add(name as Target);
  }

  // Idle is always captured: it sets the scale and the anchor.
  const needed = new Set<FillyState>(["idle"]);
  if (targets.has("frames")) for (const plan of PLANS) needed.add(plan.state);
  if (targets.has("icons")) for (const spec of ICONS) needed.add(spec.state);
  const sheets = (Object.keys(SHEETS) as (keyof typeof SHEETS)[]).filter((name) => targets.has(name)).map((name) => SHEETS[name]);
  for (const sheet of sheets) for (const cell of sheet.cells) needed.add(cell.state);
  const plans = PLANS.filter((plan) => needed.has(plan.state));

  const timings = new Map<FillyState, SheetTiming>();
  for (const plan of plans) {
    const timing = planTiming(plan);
    timings.set(plan.state, timing);
    console.log(
      `${plan.state.padEnd(10)} ${String(timing.times.length).padStart(3)} frames @ ${plan.fps} fps, loop from #${timing.loopStart}`,
    );
  }

  const pg = await startPlayground(port);
  const browser = await launchBrowser();
  const captured = new Map<FillyState, Rgba[]>();
  const posed = new Map<SheetCell, Rgba>();
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

    for (const plan of plans) {
      const timing = timings.get(plan.state)!;
      const frames: Rgba[] = [];
      for (const t of timing.times) {
        // Remounts the character; resolves from its onReady (frame on canvas).
        await page.evaluate(
          ({ state, t, from, audio }) =>
            window.__fillyFrame({ state, t, from, audioLevel: audio ?? null, blink: false, pose: null }),
          { state: plan.state, t, from: plan.from, audio: plan.audio },
        );
        await page.waitForTimeout(50);
        frames.push(decodePng(await page.locator("[data-ready='1']").first().screenshot({ omitBackground: true })));
      }
      captured.set(plan.state, frames);
      console.log(`captured ${plan.state}`);
    }
    // Extra sheet cells with pose values the animator has no state for.
    for (const sheet of sheets) {
      for (const cell of sheet.cells) {
        if (!("pose" in cell)) continue;
        await page.evaluate(
          ({ state, t, pose }) => window.__fillyFrame({ state, t, audioLevel: null, blink: false, pose }),
          { state: cell.state, t: cell.t, pose: cell.pose },
        );
        await page.waitForTimeout(50);
        posed.set(cell, decodePng(await page.locator("[data-ready='1']").first().screenshot({ omitBackground: true })));
        console.log(`captured ${cell.state} with pose ${JSON.stringify(cell.pose)}`);
      }
    }
    await context.close();
  } finally {
    await browser.close();
    await pg.close();
  }

  // One scale for every state: the idle body is `body` px tall on the badge.
  // The anchor is the bottom centre of the idle body (the feet point).
  let idleBounds: Box | null = null;
  for (const f of captured.get("idle")!) idleBounds = unionBox(idleBounds, alphaBounds(f, ALPHA_THRESHOLD));
  if (!idleBounds) throw new Error("no opaque idle pixels captured");
  const scale = body / (idleBounds.y1 - idleBounds.y0);
  const anchor = { x: (idleBounds.x0 + idleBounds.x1) / 2, y: idleBounds.y1 };
  const bodyW = Math.round((idleBounds.x1 - idleBounds.x0) * scale);
  console.log(`scale ${scale.toFixed(4)}: idle body ${bodyW}×${body} px, anchor (${anchor.x.toFixed(1)}, ${anchor.y.toFixed(1)})`);

  const manifest: Manifest = {
    scale: Number(scale.toFixed(5)),
    body: { w: bodyW, h: body },
    extent: { left: 0, right: 0, up: 0, down: 0 },
    states: {} as Manifest["states"],
  };
  for (const plan of targets.has("frames") ? PLANS : []) {
    // Each state gets the smallest box around all of its frames.
    let bounds: Box | null = null;
    for (const f of captured.get(plan.state)!) bounds = unionBox(bounds, alphaBounds(f, ALPHA_THRESHOLD));
    if (!bounds) throw new Error(`no opaque ${plan.state} pixels captured`);
    const cell = cellFor(bounds, anchor, scale);
    const box = sourceBox(cell, anchor, scale);
    const frames = captured.get(plan.state)!.map((f) => resample(f, box, cell.w, cell.h));

    const dir = path.join(outDir, plan.state);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    let bytes = 0;
    for (let i = 0; i < frames.length; i++) {
      const png = encodePng8(frames[i]);
      bytes += png.length;
      await fs.writeFile(path.join(dir, `${String(i).padStart(2, "0")}.png`), png);
    }
    const timing = timings.get(plan.state)!;
    manifest.states[plan.state] = {
      dir: plan.state,
      frames: frames.length,
      fps: plan.fps,
      loop_start: timing.loopStart,
      ...cell,
    };
    manifest.extent.left = Math.max(manifest.extent.left, -cell.ox);
    manifest.extent.right = Math.max(manifest.extent.right, cell.ox + cell.w);
    manifest.extent.up = Math.max(manifest.extent.up, -cell.oy);
    manifest.extent.down = Math.max(manifest.extent.down, cell.oy + cell.h);
    console.log(
      `${plan.state.padEnd(10)} ${cell.w}×${cell.h} at (${cell.ox}, ${cell.oy}): ${frames.length} frames, ${(bytes / 1024).toFixed(1)} kB`,
    );
  }
  if (targets.has("frames")) {
    await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(path.join(outDir, "manifest.json"));
  }

  // Game sheets: small cells at their own scale, one PNG8 the game keeps in RAM.
  for (const sheet of sheets) {
    const sheetScale = sheet.body / (idleBounds.y1 - idleBounds.y0);
    const pick = (cell: SheetCell): Rgba => {
      if ("pose" in cell) return posed.get(cell)!;
      const frames = captured.get(cell.state)!;
      if ("last" in cell) return frames[frames.length - 1];
      const loopStart = timings.get(cell.state)!.loopStart;
      return frames[loopStart + (cell.loop % (frames.length - loopStart))];
    };
    const png = encodePng8(packRow(sheet.cells.map((cell) => sheetCell(pick(cell), sheetScale, sheet.cell, sheet.align, anchor))));
    const file = path.join(appsDir, sheet.app, sheet.file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, png);
    console.log(`${file}: ${sheet.cells.length} cells of ${sheet.cell}×${sheet.cell} px, ${(png.length / 1024).toFixed(1)} kB`);
  }

  // Menu icons: one frame each, cropped to that frame, soft alpha, RGBA like the badge's own icons.
  for (const spec of targets.has("icons") ? ICONS : []) {
    const frames = captured.get(spec.state)!;
    const loopStart = timings.get(spec.state)!.loopStart;
    const index = spec.frame === "first" ? 0 : spec.frame === "loop" ? loopStart : peakFrame(frames, loopStart);
    const frame = frames[index];
    const bounds = alphaBounds(frame, ALPHA_THRESHOLD);
    if (!bounds) throw new Error(`no opaque pixels for the ${spec.app} icon`);
    const icon = resample(frame, squareBox(bounds, 8, CAPTURE_SIZE, CAPTURE_SIZE), ICON_SIZE, ICON_SIZE, false);
    const iconPng = new PNG({ width: ICON_SIZE, height: ICON_SIZE });
    iconPng.data = Buffer.from(icon.data);
    const appDir = path.join(appsDir, spec.app);
    await fs.mkdir(appDir, { recursive: true });
    const iconFile = path.join(appDir, "icon.png");
    await fs.writeFile(iconFile, PNG.sync.write(iconPng));
    console.log(iconFile);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
