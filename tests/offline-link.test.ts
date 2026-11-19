import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string };
const LINE = "Take Scroll offline for distraction-free reading.";

describe("offline download link", () => {
  it("index.html: card and footer both link the same release-page placeholder without download", () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
    const links = [...html.matchAll(/<a ([^>]*data-offline-link[^>]*)>([^<]*)<\/a>/g)];
    expect(links).toHaveLength(2);
    for (const [, attrs, text] of links) {
      expect(text).toBe(LINE);
      expect(attrs).toContain('href="%OFFLINE_ZIP_URL%"');
      expect(attrs).not.toMatch(/\bdownload\b/);
    }
    expect(html).toContain('<p class="offline-dl" data-offline-line>');
  });
  it("vite fills the placeholder with the public GitHub release page", async () => {
    const { OFFLINE_ZIP_URL } = await import("../vite.config");
    expect(OFFLINE_ZIP_URL).toBe(`https://github.com/elcafe7/bible_scroller/releases/tag/v${version}`);
    expect(version).toBe("0.1.0");
  });
  it("footer credits line links the MIT LICENSE shipped next to index.html", () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
    expect(html).toMatch(/<p class="offline-note">a project of [\s\S]*<a href="\.\/LICENSE">MIT License<\/a><\/p>/);
    const lic = readFileSync(resolve(ROOT, "LICENSE"), "utf8");
    expect(lic.startsWith("MIT License\n\nCopyright (c) 2026 elcafe7\n")).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { license: string };
    expect(pkg.license).toBe("MIT");
  });
});
