import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

/** Dev/preview server for the playground page (root: ./playground). */
export default defineConfig({
  root: path.resolve(__dirname, "playground"),
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5178, strictPort: true, host: "127.0.0.1" },
  preview: { port: 5179, strictPort: true, host: "127.0.0.1" },
  build: {
    outDir: path.resolve(__dirname, "dist-playground"),
    emptyOutDir: true,
    target: "es2022",
  },
});
