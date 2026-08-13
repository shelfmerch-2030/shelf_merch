import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";
import type { Plugin } from "vite";

const API_UPLOADS_DIR = path.resolve(__dirname, "../api/uploads");
const UPLOAD_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

/** Serve uploaded artwork from the API disk store in dev (no API proxy hop). */
function devUploadsPlugin(): Plugin {
  return {
    name: "dev-api-uploads",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/uploads/")) return next();

        const rel = decodeURIComponent(url.slice("/uploads/".length));
        const file = path.normalize(path.join(API_UPLOADS_DIR, rel));
        if (!file.startsWith(API_UPLOADS_DIR)) return next();
        if (!existsSync(file) || !statSync(file).isFile()) return next();

        const ext = path.extname(file).slice(1).toLowerCase();
        res.setHeader("Content-Type", UPLOAD_MIME[ext] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

// Plain Vite SPA — builds to static assets (dist/) for static hosting.
// The router plugin must run before the React plugin.
export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [react(), tailwindcss(), devUploadsPlugin()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
      "/uploads": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
  test: {
    // Node, not jsdom: jsdom 30 pulls undici, which throws
    // `webidl.util.markAsUncloneable is not a function` on Node 20 (GitHub Actions).
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    pool: "forks",
    maxWorkers: 1,
  },
});
