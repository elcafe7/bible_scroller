import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-ignore plain .mjs build script, no types
import { offlineHtml, OFFLINE_CARD_SENTENCE, ONLINE_OFFLINE_SENTENCE } from "../scripts/offline-html.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const ZIP = "https://github.com/elcafe7/bible_scroller";
const built = readFileSync(resolve(ROOT, "index.html"), "utf8").replaceAll("%OFFLINE_ZIP_URL%", ZIP);

describe("offline zip index.html rewrite", () => {
  const out: string = offlineHtml(built, "0.1.0");
  const card = out.match(/<dialog class="welcome"[\s\S]*?<\/dialog>/)![0];
  const footer = out.match(/<footer id="site-footer">[\s\S]*?<\/footer>/)![0];

  it("card keeps title, P1, P2, Continue; adds Version; P3 becomes plain on-device text", () => {
    const ps = [...card.matchAll(/<(h2|p)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
    expect(ps).toEqual([
      "Scroll",
      "Version 0.1.0",
      "Scroll is a leisurely bible reading app. Let the Bible roll open past your screen at the pace you choose.",
      "Add commentary after each section from Matthew Henry or John Calvin should you wish.",
      OFFLINE_CARD_SENTENCE,
    ]);
    expect(OFFLINE_CARD_SENTENCE).toBe("This copy is already on your device for distraction-free reading.");
    expect(card).toContain(">Continue</button>");
    expect(card).not.toContain("<a ");
  });

  it("no take-offline sentence or download link anywhere; header, welcome, and footer show the version", () => {
    expect(out).not.toContain(ONLINE_OFFLINE_SENTENCE);
    expect(out).not.toContain(ZIP);
    expect(out).toContain('<span class="app-version">Version 0.1.0</span>');
    expect(card).toContain('<p class="welcome-version">Version 0.1.0</p>');
    expect(footer).toContain('<p class="offline-dl offline-version">Scroll 0.1.0</p>');
    expect(footer).toContain('<a href="./LICENSE">MIT License</a> · <a href="https://jesuspeoplesf.com/donate/" target="_blank" rel="noopener noreferrer">Donate</a></p>');
  });

  it("online index.html is untouched: card + footer link the GitHub release page", () => {
    expect(built.split(`href="${ZIP}"`).length - 1).toBe(2);
    expect(built).toContain(ONLINE_OFFLINE_SENTENCE);
    expect(built).not.toContain("donate");
    expect(built).not.toContain("app-version");
    expect(built).not.toContain("welcome-version");
    expect(built).not.toContain("offline-version");
  });

  it("refuses input without the online card link", () => {
    expect(() => offlineHtml(out, "0.1.0")).toThrow();
  });
});

describe("version source of truth", () => {
  const { version } = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string };

  it("README shows Version <package.json> under the title and in the download line", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");
    expect(readme).toContain(`# Scroll\n\n**Version ${version}**\n`);
    expect(readme).toContain(`<sub>version ${version} · bible_scroller-${version}.zip`);
    expect(readme).toContain(`/download/bible_scroller-${version}.zip`);
    expect(readme).toContain(`/download/bible_scroller-${version}.tar.gz`);
    expect(readme).toContain(`one folder called \`scroll-${version}\``);
  });

  it("public/README.txt leads with the same version", () => {
    const txt = readFileSync(resolve(ROOT, "public/README.txt"), "utf8");
    expect(txt.startsWith(`Scroll (bible_scroller) ${version} — offline copy`)).toBe(true);
  });
});
