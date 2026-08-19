/**
 * Shared bootstrap for the QA scripts: a programmatic Vite dev server for the
 * playground and a headless Chromium with SwiftShader WebGL.
 */
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface PlaygroundServer {
  server: ViteDevServer;
  /** Base URL, e.g. http://127.0.0.1:5178 */
  url: string;
  close(): Promise<void>;
}

/** Start the playground (vite dev, config vite.playground.config.ts) on `port`. */
export async function startPlayground(port = 5178): Promise<PlaygroundServer> {
  const server = await createServer({
    configFile: path.join(ROOT, "vite.playground.config.ts"),
    logLevel: "warn",
    server: { port, strictPort: true, host: "127.0.0.1" },
  });
  await server.listen();
  const url = `http://127.0.0.1:${port}`;
  return {
    server,
    url,
    close: () => server.close(),
  };
}

/** Headless Chromium with software WebGL (works on CI / machines without a GPU). */
export function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
}

/** Forward page console errors / page errors to the terminal. */
export function wirePageLogging(page: Page, label: string): void {
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") console.log(`[${label}] console.${type}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => console.log(`[${label}] pageerror: ${err.message}`));
}

/** Parse `--flag value` pairs from argv. */
export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else out[key] = "1";
    }
  }
  return out;
}
