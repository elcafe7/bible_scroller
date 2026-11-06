import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string };
const LINE = "Take Scroll offline for distraction-free reading.";

describe("offline download link", () => {
  it("index.html: card and footer both link the same zip placeholder with download", () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
    const links = [...html.matchAll(/<a ([^>]*data-offline-link[^>]*)>([^<]*)<\/a>/g)];
    expect(links).toHaveLength(2);
    for (const [, attrs, text] of links) {
      expect(text).toBe(LINE);
      expect(attrs).toContain('href="./%OFFLINE_ZIP%"');
      expect(attrs).toMatch(/\bdownload\b/);
      expect(attrs).not.toContain("github.com");
    }
    expect(html).toContain('<p class="offline-dl" data-offline-line>');
  });
  it("vite fills the placeholder with the versioned zip name", () => {
    const cfg = readFileSync(resolve(ROOT, "vite.config.ts"), "utf8");
    expect(cfg).toContain('replaceAll("%OFFLINE_ZIP%", `bible_scroller-${version}.zip`)');
    expect(version).toBe("0.1.0");
  });
});
