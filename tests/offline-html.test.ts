import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-ignore plain .mjs build script, no types
import { offlineHtml, OFFLINE_CARD_SENTENCE, ONLINE_OFFLINE_SENTENCE } from "../scripts/offline-html.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const ZIP = "https://github.com/elcafe7/bible_scroller/releases/download/v0.1.0/bible_scroller-0.1.0.zip";
const built = readFileSync(resolve(ROOT, "index.html"), "utf8").replaceAll("%OFFLINE_ZIP_URL%", ZIP);

describe("offline zip index.html rewrite", () => {
  const out: string = offlineHtml(built, "0.1.0");
  const card = out.match(/<dialog class="welcome"[\s\S]*?<\/dialog>/)![0];
  const footer = out.match(/<footer id="site-footer">[\s\S]*?<\/footer>/)![0];

  it("card keeps title, P1, P2, Continue; P3 becomes plain on-device text", () => {
    const ps = [...card.matchAll(/<(h2|p)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
    expect(ps).toEqual([
      "Scroll",
      "Scroll is a leisurely bible reading app. Let the Bible roll open past your screen at the pace you choose.",
      "Add commentary after each section from Matthew Henry or John Calvin should you wish.",
      OFFLINE_CARD_SENTENCE,
    ]);
    expect(OFFLINE_CARD_SENTENCE).toBe("This copy is already on your device for distraction-free reading.");
    expect(card).toContain(">Continue</button>");
    expect(card).not.toContain("<a ");
  });

  it("no take-offline sentence or download link anywhere; footer shows the version", () => {
    expect(out).not.toContain(ONLINE_OFFLINE_SENTENCE);
    expect(out).not.toContain(ZIP);
    expect(footer).toContain('<p class="offline-dl offline-version">Scroll 0.1.0</p>');
    expect(footer).toContain('<a href="./LICENSE">MIT License</a> · <a href="https://jesuspeoplesf.com/donate/" target="_blank" rel="noopener noreferrer">Donate</a></p>');
  });

  it("online index.html is untouched: card + footer link the GitHub zip", () => {
    expect(built.split(`href="${ZIP}"`).length - 1).toBe(2);
    expect(built).toContain(ONLINE_OFFLINE_SENTENCE);
    expect(built).not.toContain("donate");
  });

  it("refuses input without the online card link", () => {
    expect(() => offlineHtml(out, "0.1.0")).toThrow();
  });
});
