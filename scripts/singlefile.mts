/**
 * Bundle the built playground (dist-playground/) into ONE self-contained HTML
 * fragment with all JS/CSS inlined — for sharing as a static demo page where
 * external requests are blocked (e.g. an artifact viewer).
 *
 *   npm run build:playground && tsx scripts/singlefile.mts [--out path]
 *
 * The output intentionally has no <html>/<head>/<body> wrapper; it starts with
 * <title> so hosts that wrap fragments can pick it up. Open it via a host that
 * supplies the document skeleton, or prepend `<!doctype html>` yourself.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist-playground");
const outArg = process.argv.indexOf("--out");
const out = outArg >= 0 ? path.resolve(process.argv[outArg + 1]) : path.join(dist, "filly-playground.html");

const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const js = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
if (js.length === 0) throw new Error("no script tags found in dist-playground/index.html");

const read = (p: string) => fs.readFileSync(path.join(dist, p.replace(/^\//, "")), "utf8");
// Inline module scripts must not contain a literal "</script" sequence.
const safeJs = js.map((p) => read(p).replace(/<\/script/gi, "<\\/script")).join("\n;\n");
const safeCss = css.map(read).join("\n");

const page = [
  "<title>Filly Playground</title>",
  '<meta name="viewport" content="width=device-width, initial-scale=1" />',
  `<style>\n${safeCss}\n</style>`,
  '<div id="root"></div>',
  `<script type="module">\n${safeJs}\n</script>`,
].join("\n");

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`${out} (${(Buffer.byteLength(page) / 1024).toFixed(0)} kB)`);
