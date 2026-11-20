import { defineConfig } from "vite-plus";

// An extension is several entry points, not one page: three HTML pages and the service worker, each built to a
// stable name (the manifest points at them) with relative URLs (extension pages are not served from a domain root).
export default defineConfig({
  base: "./",
  build: {
    target: "chrome116",
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: "popup.html",
        offscreen: "offscreen.html",
        mic: "mic.html",
        background: "src/background.ts",
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
  fmt: { ignorePatterns: ["dist/**"] },
  lint: { ignorePatterns: ["dist/**"] },
  test: { include: ["src/**/*.test.ts"] },
});
