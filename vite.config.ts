import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Classic (non-module) script so the bundle also runs when index.html is opened from file://. */
function classicScript(): Plugin {
  return {
    name: "classic-script",
    apply: "build",
    enforce: "post",
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src=/g, "<script defer src=")
        .replace(/ crossorigin(?=[ >])/g, "");
    },
  };
}

/** Copy generated data/ (or the John 1 fixture when data/ is absent) into dist/data. Never copies .db files. */
function copyData(): Plugin {
  return {
    name: "copy-data",
    apply: "build",
    closeBundle() {
      const root = __dirname;
      const full = resolve(root, "data");
      const src = existsSync(resolve(full, "geneva/meta.json")) ? full : resolve(root, "fixtures/john1");
      const dest = resolve(root, "dist/data");
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true, filter: (p) => !/\.(db|env|md)$/i.test(p) && !/\/\.env/.test(p) });
      console.log(`copy-data: ${src === full ? "data/" : "fixtures/john1/"} -> dist/data`);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [classicScript(), copyData()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: { format: "iife", inlineDynamicImports: true },
    },
  },
});
