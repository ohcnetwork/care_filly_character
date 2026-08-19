/**
 * Export the idle-posed FillyModel to dist/filly-mascot.glb via the playground
 * (`?export=1`) running in headless Chromium.
 *
 *   npm run export:glb [-- --out dist/filly-mascot.glb] [--port 5178]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser, parseArgs, ROOT, startPlayground, wirePageLogging } from "./harness.mjs";

/** Globals set by the playground's `?export=1` page (the evaluate callbacks run in the browser). */
interface ExportWindow {
  __fillyExportGLB?: () => Promise<ArrayBuffer>;
  __fillyReady?: boolean;
}
declare const window: ExportWindow;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outFile = path.resolve(ROOT, args.out ?? "dist/filly-mascot.glb");
  const port = Number(args.port ?? 5178);

  const pg = await startPlayground(port);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    wirePageLogging(page, "export");
    await page.goto(`${pg.url}/?export=1`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__fillyReady === true, null, { timeout: 60_000 });

    // Transfer as base64 (ArrayBuffer is not serialisable across evaluate()).
    const b64 = await page.evaluate(async () => {
      const buf = await window.__fillyExportGLB!();
      const bytes = new Uint8Array(buf);
      let s = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      return btoa(s);
    });
    const data = Buffer.from(b64, "base64");
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, data);
    console.log(`${outFile} (${data.length} bytes, ${(data.length / 1024).toFixed(1)} kB)`);
    if (data.length < 50_000) console.warn("WARNING: GLB is suspiciously small");
  } finally {
    await browser.close();
    await pg.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
