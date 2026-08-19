import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

/**
 * Library build: emits dist/index.js (ESM). Type declarations are emitted by
 * `tsc -p tsconfig.build.json` in the `build` script so we don't need an
 * extra plugin. React, three and react-three-fiber are peers — the host app
 * (care_filly_fe) already ships them, so they must not be bundled twice.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      external: (id) =>
        /^(react|react-dom|react\/jsx-runtime|three|@react-three\/fiber)($|\/)/.test(id),
    },
  },
});
