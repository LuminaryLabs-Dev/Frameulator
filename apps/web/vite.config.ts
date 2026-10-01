import { defineConfig } from "vite";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

export default defineConfig({
  root: import.meta.dirname,
  base: "/Frameulator/",
  build: {
    outDir: resolve(import.meta.dirname, "../../docs"),
    emptyOutDir: true,
    // CSP allows same-origin kernel fetches, never data: URLs.
    assetsInlineLimit: 0,
    target: "es2022",
  },
  plugins: [{
    name: "frameulator-pages-marker",
    closeBundle() {
      writeFileSync(resolve(import.meta.dirname, "../../docs/.nojekyll"), "");
    },
  }],
});

