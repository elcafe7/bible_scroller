/**
 * @vitest-environment happy-dom
 *
 * Percent tuning (text size / speed, 50–300 on top of the preset), ticker speed units and
 * frame-rate independence, and the XL ticker size.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampPct, PCT_DEFAULT, PCT_MAX, PCT_MIN } from "../src/tune";
import { Scroller, SPEED_CPM, SPEED_LPM, type ScrollerSource } from "../src/scroller";
import { defaultPrefs, loadPrefs, savePrefs, PREFS_KEY, type KV } from "../src/prefs";
import { createLoader } from "../src/loader";
import { fsFetch } from "./helpers";
import type { LoopItem } from "../src/types";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE = resolve(ROOT, "fixtures/john1");
const mem = (init: Record<string, string> = {}): KV => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe("clampPct", () => {
  it("clamps to 50–300, rounds, and falls back to 100 for junk", () => {
    expect([PCT_MIN, PCT_MAX, PCT_DEFAULT]).toEqual([10, 300, 100]);
    expect(clampPct(5)).toBe(10);
    expect(clampPct(0)).toBe(10);
    expect(clampPct(-40)).toBe(10);
    expect(clampPct(999)).toBe(300);
    expect(clampPct(Infinity)).toBe(PCT_DEFAULT);
    expect(clampPct(125.6)).toBe(126);
    expect(clampPct("175")).toBe(175);
    expect(clampPct(" 80 ")).toBe(80);
    for (const bad of ["", "  ", "abc", "1e", NaN, null, undefined, {}, [], true]) expect(clampPct(bad)).toBe(100);
  });
});

describe("percent prefs", () => {
  it("default 100/100, round-trips, clamps stored junk, legacy prefs without them load as 100", async () => {
    const meta = await createLoader({ fetch: fsFetch(FIXTURE) }).loadGenevaMeta();
    expect(defaultPrefs(meta)).toMatchObject({ fontPct: 100, speedPct: 100 });
    const st = mem();
    savePrefs(st, { ...defaultPrefs(meta), fontPct: 175, speedPct: 60 });
    expect(loadPrefs(st, meta)).toMatchObject({ fontPct: 175, speedPct: 60 });
    expect(JSON.parse(st.getItem(PREFS_KEY)!)).toMatchObject({ fontPct: 175, speedPct: 60 });
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ fontPct: 9000, speedPct: -5 }) }), meta)).toMatchObject({ fontPct: 300, speedPct: 10 });
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ fontPct: "big", speedPct: null }) }), meta)).toMatchObject({ fontPct: 100, speedPct: 100 });
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ speed: "slow", fontSize: "xl" }) }), meta)).toMatchObject({ speed: "slow", fontSize: "xl", fontPct: 100, speedPct: 100 });
    savePrefs(st, { ...defaultPrefs(meta), fontPct: 12345, speedPct: Number.NaN });
    expect(JSON.parse(st.getItem(PREFS_KEY)!)).toMatchObject({ fontPct: 300, speedPct: 100 });
  });
});

/** Drive the rAF loop at a fixed refresh rate with synthetic timestamps. */
function runAt(hz: number, ms: number, mode: "horizontal" | "vertical", scale = 1) {
  document.body.innerHTML = `<main id="stage"><div id="track"></div></main>`;
  document.body.className = `mode-${mode} size-m`;
  const stage = document.getElementById("stage")!;
  const track = document.getElementById("track")!;
  Object.defineProperty(stage, "clientWidth", { configurable: true, get: () => 5000 });
  Object.defineProperty(stage, "clientHeight", { configurable: true, get: () => 800 });
  const src: ScrollerSource = { next: (): LoopItem => ({ kind: "verse", book: "John", chapter: 3, verse: 16, text: "For God so loued the world." }) };
  const s = new Scroller(stage, track, src, "slow", mode, scale);
  s.reset();
  let queued: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { queued = cb; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => { queued = null; });
  s.play();
  const start = s.offset;
  const t0 = performance.now();
  const step = 1000 / hz;
  for (let t = step; t <= ms; t += step) { const cb = queued; queued = null; cb?.(t0 + t); }
  s.pause();
  return Math.abs(s.offset - start) / (ms / 1000);
}

describe("speed is time-based (frame-rate independent) and percent scales it", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ticker px/s is the same at 30, 60 and 144 Hz", () => {
    const [a, b, c] = [30, 60, 144].map((hz) => runAt(hz, 2000, "horizontal"));
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(a - b) / b).toBeLessThan(0.02);
    expect(Math.abs(c - b) / b).toBeLessThan(0.02);
  });

  it("vertical px/s is the same at 30 and 144 Hz", () => {
    const a = runAt(30, 1500, "vertical");
    const c = runAt(144, 1500, "vertical");
    expect(Math.abs(a - c) / c).toBeLessThan(0.02);
  });

  it("speed percent multiplies px/s on top of the preset (both modes)", () => {
    for (const mode of ["horizontal", "vertical"] as const) {
      const base = runAt(60, 1500, mode, 1);
      expect(runAt(60, 1500, mode, 2) / base).toBeCloseTo(2, 1);
      expect(runAt(60, 1500, mode, 0.5) / base).toBeCloseTo(0.5, 1);
    }
  });

  it("ticker px/s = CPM × average char width (not the widest glyph); vertical px/s = LPM × line height", () => {
    // happy-dom has no layout: probe width falls back to 12 px/char, line height to 40 px.
    const ticker = runAt(60, 1500, "horizontal");
    const vertical = runAt(60, 1500, "vertical");
    expect(Math.abs(ticker / ((SPEED_CPM.slow * 12) / 60) - 1)).toBeLessThan(0.03);
    expect(Math.abs(vertical / ((SPEED_LPM.slow * 40) / 60) - 1)).toBeLessThan(0.03);
  });
});

describe("ticker XL is clearly large; percent hooks are in the CSS", () => {
  const css = readFileSync(resolve(ROOT, "src/style.css"), "utf8");
  const vh = (size: string) => Number(new RegExp(`mode-horizontal\\.size-${size}\\s*\\{[^}]*--ticker-verse:\\s*max\\([^,]+,\\s*([\\d.]+)vh\\)`, "s").exec(css)![1]);

  it("S < M < L < XL with XL ≥ 12vh (≥ 2.5× M, ~130px at 1080p)", () => {
    const [s, m, l, xl] = ["s", "m", "l", "xl"].map(vh) as [number, number, number, number];
    expect(s).toBeLessThan(m);
    expect(m).toBeLessThan(l);
    expect(l).toBeLessThan(xl);
    expect(xl).toBeGreaterThanOrEqual(12);
    expect(xl / m).toBeGreaterThan(2.5);
    expect((xl * 1080) / 100).toBeGreaterThan(120);
    expect((xl * 844) / 100).toBeGreaterThan(95); // 390×844 phone
  });

  it("font percent multiplies vertical and ticker text; ticker line is capped so commentary fits", () => {
    expect(css).toMatch(/\.item \{[^}]*font-size: calc\(var\(--verse-size\) \* var\(--font-scale, 1\)\)/s);
    expect(css).toMatch(/--ticker-verse-px:\s*min\(calc\(var\(--ticker-verse\) \* var\(--font-scale, 1\)\), 24vh\)/);
    expect(css).toMatch(/--ticker-henry-px:\s*min\(calc\(var\(--ticker-henry\) \* var\(--font-scale, 1\)\), 20vh\)/);
    expect(css).not.toMatch(/font-size:\s*var\(--ticker-(verse|henry)\);/);
  });
});
