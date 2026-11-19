/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error untyped .mjs build helper
import { offlineHtml } from "../scripts/offline-html.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const LOADER = readFileSync(resolve(ROOT, "public/ga-ap.js"), "utf8");
const ID = "G-0M3SF90ZGN";

/** Run public/ga-ap.js against a fake host; returns what it did. */
function runLoader(hostname: string, search = "", hash = "") {
  const appended: { src: string }[] = [];
  const store = new Map<string, string>();
  const win: Record<string, unknown> = {};
  const doc = {
    createElement: () => ({}) as { src: string; async?: boolean },
    head: { appendChild: (n: { src: string }) => appended.push(n) },
    documentElement: { appendChild: (n: { src: string }) => appended.push(n) },
  };
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const location = { hostname, search, hash, origin: `https://${hostname}` };
  new Function("location", "window", "document", "localStorage", LOADER)(location, win, doc, ls);
  return { appended, win, store };
}

function layer(win: Record<string, unknown>): unknown[][] {
  return [...((win.dataLayer as IArguments[]) ?? [])].map((a) => [...a]);
}

describe("ga-ap.js loader (hostname guard)", () => {
  it.each([
    "localhost", "127.0.0.1", "poeta.icu", "elcafe7.github.io",
    "apocalypse.press.evil.com", "foo.apocalypse.press", "",
  ])("does nothing on %s", (h) => {
    const r = runLoader(h);
    expect(r.appended).toHaveLength(0);
    expect(r.win.dataLayer).toBeUndefined();
    expect(r.win.gtag).toBeUndefined();
    expect(r.win[`ga-disable-${ID}`]).toBeUndefined();
  });

  it("does nothing when the opt-out flag is already set", () => {
    const win: Record<string, unknown> = { [`ga-disable-${ID}`]: true };
    const appended: { src: string }[] = [];
    const doc = { createElement: () => ({}) as { src: string }, head: { appendChild: (n: { src: string }) => appended.push(n) }, documentElement: { appendChild: (n: { src: string }) => appended.push(n) } };
    const location = { hostname: "apocalypse.press", search: "", hash: "", origin: "https://apocalypse.press" };
    new Function("location", "window", "document", "localStorage", LOADER)(location, win, doc, { getItem: () => null, setItem() {}, removeItem() {} });
    expect(appended).toHaveLength(0);
    expect(win.dataLayer).toBeUndefined();
  });

  it("loads gtag and sends one generic /scroll/ page_view on apocalypse.press", () => {
    const r = runLoader("apocalypse.press", "?ga_debug=1&ga_internal=1");
    expect(r.appended[0]!.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`);
    expect(r.win.gtag).toBeUndefined();
    const dl = layer(r.win);
    const config = dl.find((a) => a[0] === "config")!;
    expect(config[1]).toBe(ID);
    expect(config[2]).toEqual({
      send_page_view: false,
      page_location: "https://apocalypse.press/scroll/",
      page_path: "/scroll/",
      page_title: "Scroll",
      content_group: "scroll",
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      traffic_type: "internal",
      debug_mode: true,
    });
    const ev = dl.find((a) => a[0] === "event")!;
    expect(ev[1]).toBe("page_view");
    expect(ev[2]).toMatchObject({ send_to: ID, event_timeout: 5000 });
    expect(typeof ev[2].event_callback).toBe("function");
    expect(dl.filter((a) => a[0] === "event")).toHaveLength(1);
    expect(r.store.get("ga_internal")).toBe("1");
    expect(runLoader("www.apocalypse.press").appended).toHaveLength(1);
  });

  it("sets ga-disable after event_callback (and is a no-op if called twice)", () => {
    const r = runLoader("apocalypse.press");
    const ev = layer(r.win).find((a) => a[0] === "event")!;
    expect(r.win[`ga-disable-${ID}`]).toBeUndefined();
    ev[2].event_callback();
    expect(r.win[`ga-disable-${ID}`]).toBe(true);
    ev[2].event_callback();
    expect(r.win[`ga-disable-${ID}`]).toBe(true);
  });

  it("reads ga_internal / ga_debug from the hash query as well", () => {
    const r = runLoader("apocalypse.press", "", "#/?ga_debug=1&ga_internal=1");
    const config = layer(r.win).find((a) => a[0] === "config")!;
    expect(config[2]).toMatchObject({ debug_mode: true, traffic_type: "internal" });
    expect(r.store.get("ga_internal")).toBe("1");
  });

  it("clears ga_internal on ?ga_internal=0", () => {
    const store = new Map<string, string>([["ga_internal", "1"]]);
    const win: Record<string, unknown> = {};
    const appended: { src: string }[] = [];
    const doc = { createElement: () => ({}) as { src: string }, head: { appendChild: (n: { src: string }) => appended.push(n) }, documentElement: { appendChild: (n: { src: string }) => appended.push(n) } };
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    new Function("location", "window", "document", "localStorage", LOADER)(
      { hostname: "apocalypse.press", search: "?ga_internal=0", hash: "", origin: "https://apocalypse.press" },
      win, doc, ls,
    );
    expect(store.get("ga_internal")).toBeUndefined();
    expect(appended).toHaveLength(1);
    const config = [...((win.dataLayer as IArguments[]) ?? [])].map((a) => [...a]).find((a) => a[0] === "config")!;
    expect(config[2].traffic_type).toBeUndefined();
  });

  it("never adds Consent Mode, a plain 'scroll' event, or window.gtag", () => {
    expect(LOADER).not.toMatch(/'consent'/);
    expect(LOADER).not.toMatch(/'event',\s*'scroll'/);
    expect(LOADER).not.toMatch(/window\.gtag\s*=/);
    expect(LOADER).toMatch(/allow_google_signals:\s*false/);
    expect(LOADER).toMatch(/allow_ad_personalization_signals:\s*false/);
  });
});

describe("offline build", () => {
  it("offline index.html has no GA loader", () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8").replaceAll("%OFFLINE_ZIP_URL%", "https://github.com/elcafe7/bible_scroller");
    expect(html).toContain('<script src="./ga-ap.js" defer></script>');
    const off = offlineHtml(html, "0.1.0") as string;
    expect(off).not.toMatch(/ga-ap|googletagmanager|G-0M3SF90ZGN|gtag/);
  });
});
