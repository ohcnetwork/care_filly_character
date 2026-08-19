import { describe, expect, it } from "vitest";
import { AUTO_BLINK_MAX, AUTO_BLINK_MIN, BLINK_CLOSE_DURATION, BLINK_OPEN_DURATION, BlinkController } from "./blink";
import { Rng } from "./rng";

const DT = 1 / 120;

describe("BlinkController", () => {
  it("trigger() closes then reopens within ~0.3 s with easing", () => {
    const b = new BlinkController(new Rng(3));
    expect(b.trigger()).toBe(true);
    expect(b.active).toBe(true);
    let min = 1;
    let t = 0;
    let tMin = 0;
    while (b.active && t < 1) {
      const o = b.update(DT, false);
      t += DT;
      if (o < min) {
        min = o;
        tMin = t;
      }
    }
    expect(min).toBeLessThan(0.02);
    expect(tMin).toBeCloseTo(BLINK_CLOSE_DURATION, 1);
    expect(t).toBeLessThan(BLINK_CLOSE_DURATION + BLINK_OPEN_DURATION + 0.05);
    expect(b.openness).toBe(1);
    expect(b.active).toBe(false);
  });

  it("ignores trigger() while running", () => {
    const b = new BlinkController(new Rng(3));
    b.trigger();
    b.update(0.05, false);
    expect(b.trigger()).toBe(false);
  });

  it("ease-in close: starts slow, ease-out open: ends slow", () => {
    const b = new BlinkController(new Rng(3));
    b.trigger();
    const o1 = b.update(BLINK_CLOSE_DURATION / 4, false);
    const o2 = b.update(BLINK_CLOSE_DURATION / 4, false);
    // second quarter drops more than the first (accelerating).
    expect(1 - o1).toBeLessThan(o1 - o2);
  });

  it("auto-blinks within the interval range, never when disabled", () => {
    const b = new BlinkController(new Rng(11));
    expect(b.nextAutoIn).toBeGreaterThanOrEqual(AUTO_BLINK_MIN);
    expect(b.nextAutoIn).toBeLessThanOrEqual(AUTO_BLINK_MAX);
    // disabled: 20 s and nothing happens
    for (let i = 0; i < 20 / DT; i++) expect(b.update(DT, false)).toBe(1);
    // enabled: blinks before AUTO_BLINK_MAX
    let t = 0;
    let blinked = false;
    while (t < AUTO_BLINK_MAX + 0.1) {
      if (b.update(DT, true) < 1) {
        blinked = true;
        break;
      }
      t += DT;
    }
    expect(blinked).toBe(true);
  });

  it("sometimes double-blinks (about 10 % over many auto blinks)", () => {
    const b = new BlinkController(new Rng(5));
    let blinks = 0;
    let doubles = 0;
    let prevActive = false;
    let closedPhases = 0;
    // Count distinct "closed" dips per active run.
    let lastOpen = 1;
    for (let i = 0; i < 600 / DT; i++) {
      const o = b.update(DT, true);
      if (b.active && !prevActive) {
        closedPhases = 0;
      }
      if (lastOpen > 0.5 && o <= 0.5) closedPhases++;
      if (!b.active && prevActive) {
        blinks++;
        if (closedPhases >= 2) doubles++;
      }
      prevActive = b.active;
      lastOpen = o;
    }
    expect(blinks).toBeGreaterThan(100);
    const ratio = doubles / blinks;
    expect(ratio).toBeGreaterThan(0.03);
    expect(ratio).toBeLessThan(0.2);
  });

  it("reset() clears a running blink", () => {
    const b = new BlinkController(new Rng(1));
    b.trigger();
    b.update(0.05, false);
    b.reset();
    expect(b.active).toBe(false);
    expect(b.openness).toBe(1);
  });
});
