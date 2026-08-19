/**
 * Screenshot every sheet frame + the full sheet from the playground.
 *
 *   npm run snapshot [-- --out screenshots] [--port 5178]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { SHEET_FRAMES } from "../playground/frames";
import { launchBrowser, parseArgs, ROOT, startPlayground, wirePageLogging } from "./harness.mjs";

const READY_TIMEOUT = 90_000;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, args.out ?? "screenshots");
  const port = Number(args.port ?? 5178);
  await fs.mkdir(outDir, { recursive: true });

  const pg = await startPlayground(port);
  const browser = await launchBrowser();
  const written: string[] = [];
  try {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    wirePageLogging(page, "frame");

    for (let i = 0; i < SHEET_FRAMES.length; i++) {
      const f = SHEET_FRAMES[i];
      const q = new URLSearchParams({ state: f.state, t: String(f.t), size: "360" });
      if (f.audio !== undefined) q.set("audio", String(f.audio));
      if (f.freezeBlink) q.set("blink", "1");
      await page.goto(`${pg.url}/?${q.toString()}`, { waitUntil: "load" });
      const wrapper = page.locator("[data-ready='1']").first();
      await wrapper.waitFor({ state: "attached", timeout: READY_TIMEOUT });
      await page.waitForTimeout(100);
      const file = path.join(outDir, `${String(i + 1).padStart(2, "0")}-${f.id}.png`);
      await wrapper.screenshot({ path: file, omitBackground: false });
      written.push(file);
      console.log(file);
    }

    // Full sheet.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${pg.url}/?sheet=1`, { waitUntil: "load" });
    await page.locator(".sheet[data-ready='1']").waitFor({ state: "attached", timeout: READY_TIMEOUT });
    await page.waitForTimeout(200);
    const sheetFile = path.join(outDir, "sheet.png");
    await page.locator(".sheet").screenshot({ path: sheetFile });
    written.push(sheetFile);
    console.log(sheetFile);
    await context.close();
  } finally {
    await browser.close();
    await pg.close();
  }

  for (const f of written) {
    const { size } = await fs.stat(f);
    if (size < 5_000) console.warn(`WARNING: ${f} is only ${size} bytes`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
