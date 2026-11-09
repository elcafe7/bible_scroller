/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gaSpeed, SCROLL_EVENTS, SPEED_DEBOUNCE_MS, track, trackSpeedChange } from "../src/ga";
import { renderItem } from "../src/scroller";
import { LoopCursor } from "../src/sequence";
// @ts-expect-error untyped .mjs build helper
import { offlineHtml } from "../scripts/offline-html.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const LOADER = readFileSync(resolve(ROOT, "public/ga-ap.js"), "utf8");

/** Run public/ga-ap.js against a fake host; returns what it did. */
function runLoader(hostname: string, search = "") {
  const appended: { src: string }[] = [];
  const store = new Map<string, string>();
  const win: Record<string, unknown> = {};
  const doc = { createElement: () => ({}) as { src: string }, head: { appendChild: (n: { src: string }) => appended.push(n) } };
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  new Function("location", "window", "document", "localStorage", LOADER)({ hostname, search }, win, doc, ls);
  return { appended, win, store };
}

describe("ga-ap.js loader (hostname guard)", () => {
  it.each(["localhost", "127.0.0.1", "poeta.icu", "elcafe7.github.io", "apocalypse.press.evil.com", ""])("does nothing on %s", (h) => {
    const r = runLoader(h);
    expect(r.appended).toHaveLength(0);
    expect(r.win.gtag).toBeUndefined();
  });

  it("loads gtag and configures content_group 'scroll' on apocalypse.press", () => {
    const r = runLoader("apocalypse.press", "?ga_debug=1&ga_internal=1");
    expect(r.appended[0]!.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-0M3SF90ZGN");
    const dl = r.win.dataLayer as IArguments[];
    const config = [...dl].map((a) => [...a]).find((a) => a[0] === "config")!;
    expect(config[1]).toBe("G-0M3SF90ZGN");
    expect(config[2]).toMatchObject({ content_group: "scroll", content_type: "scroll", section: "scroll", debug_mode: true, traffic_type: "internal", allow_google_signals: false });
    expect(r.store.get("ga_internal")).toBe("1");
    expect(runLoader("www.apocalypse.press").appended).toHaveLength(1);
  });

  it("never adds Consent Mode or a plain 'scroll' event", () => {
    expect(LOADER).not.toMatch(/'consent'/);
    expect(LOADER).not.toMatch(/'event',\s*'scroll'/);
  });
});

describe("track()", () => {
  let gtag: ReturnType<typeof vi.fn>;
  beforeEach(() => { gtag = vi.fn(); window.gtag = gtag; });
  afterEach(() => { delete window.gtag; vi.useRealTimers(); });

  it("is a no-op when gtag is absent (off-host / offline)", () => {
    delete window.gtag;
    expect(() => track("scroll_start", { book_title: "Genesis" })).not.toThrow();
  });

  it("sends the event with content_type 'scroll' and drops undefined params", () => {
    track("scroll_range_set", { book_title: "Genesis", chapter: 1, verse: 1, end_chapter: 50, end_verse: 26, edition: "geneva", x: undefined });
    expect(gtag).toHaveBeenCalledWith("event", "scroll_range_set", {
      content_type: "scroll", book_title: "Genesis", chapter: 1, verse: 1, end_chapter: 50, end_verse: 26, edition: "geneva",
    });
  });

  it("swallows gtag errors so reading never breaks", () => {
    window.gtag = () => { throw new Error("blocked"); };
    expect(() => track("scroll_stop", { reason: "user" })).not.toThrow();
  });

  it("event names: snake_case, <= 40 chars, never plain 'scroll'", () => {
    expect(SCROLL_EVENTS).toHaveLength(12);
    for (const n of SCROLL_EVENTS) {
      expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(n.length).toBeLessThanOrEqual(40);
      expect(n).not.toBe("scroll");
    }
  });

  it("speed values map to GA enums", () => {
    expect(gaSpeed("very-slow")).toBe("very_slow");
    expect(gaSpeed("fast")).toBe("fast");
  });

  it("scroll_speed_change is debounced 500 ms and sends only the final value", () => {
    vi.useFakeTimers();
    trackSpeedChange("slow");
    trackSpeedChange("fast");
    vi.advanceTimersByTime(SPEED_DEBOUNCE_MS - 1);
    trackSpeedChange("very-slow");
    vi.advanceTimersByTime(SPEED_DEBOUNCE_MS - 1);
    expect(gtag).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "scroll_speed_change", { content_type: "scroll", scroll_speed: "very_slow" });
  });
});

describe("scroll_complete hook + offline build", () => {
  it("marks only the last verse of the range as loopEnd (rendered as data-loop-end)", () => {
    const verses = [1, 2, 3].map((v) => ({ book: "Jude", book_id: "jude", chapter: 1, verse: v, text: "t" }));
    const c = new LoopCursor(verses, null);
    const items = [c.next(false)!, c.next(false)!, c.next(false)!, c.next(false)!];
    expect(items.map((i) => i.kind === "verse" && !!i.loopEnd)).toEqual([false, false, true, false]);
    expect(renderItem(items[2]!).dataset.loopEnd).toBe("1");
    expect(renderItem(items[0]!).dataset.loopEnd).toBeUndefined();
  });

  it("offline index.html has no GA loader", () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8").replaceAll("%OFFLINE_ZIP_URL%", "https://github.com/elcafe7/bible_scroller");
    expect(html).toContain('<script src="./ga-ap.js" defer></script>');
    const off = offlineHtml(html, "0.1.0") as string;
    expect(off).not.toMatch(/ga-ap|googletagmanager|G-0M3SF90ZGN/);
  });
});
