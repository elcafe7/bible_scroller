import { describe, expect, it } from "vitest";
import { SPEED_CPM, SPEED_LPM, TICKER_CPM_PER_LPM } from "../src/scroller";
import { defaultPrefs, loadPrefs, savePrefs, PREFS_KEY, type KV } from "../src/prefs";
import { createLoader } from "../src/loader";
import { fsFetch } from "./helpers";
import { resolve } from "node:path";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/john1");
const mem = (init: Record<string, string> = {}): KV & { m: Map<string, string> } => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe("speed rates", () => {
  it("keeps the vertical LPM curve unchanged", () => {
    expect(SPEED_LPM.slow).toBe(48);
    expect(SPEED_LPM.medium).toBe(80);
    expect(SPEED_LPM.fast).toBe(130);
    expect(SPEED_LPM["very-slow"]).toBe(30);
  });

  it("ticker CPM is the vertical curve × one factor, so every level keeps the same ratio in both modes", () => {
    for (const k of ["very-slow", "slow", "medium", "fast"] as const) {
      expect(SPEED_CPM[k]).toBe(Math.round(SPEED_LPM[k] * TICKER_CPM_PER_LPM));
      expect(SPEED_CPM[k] / SPEED_CPM.slow).toBeCloseTo(SPEED_LPM[k] / SPEED_LPM.slow, 1);
    }
    expect(SPEED_CPM["very-slow"]).toBeLessThan(SPEED_CPM.slow);
    expect(SPEED_CPM.slow).toBeLessThan(SPEED_CPM.medium);
    expect(SPEED_CPM.medium).toBeLessThan(SPEED_CPM.fast);
  });

  it("ticker Slow is calm: ≈2 em/s (≈90 px/s at 1080p), not the old ≈7.6 em/s", () => {
    const AVG_CHAR_EM = 0.46; // average serif letter incl. spaces
    const tickerEmPerSec = (SPEED_CPM.slow * AVG_CHAR_EM) / 60;
    const verticalEmPerSec = (SPEED_LPM.slow * 1.62) / 60; // --leading: 1.62
    expect(tickerEmPerSec).toBeGreaterThan(1.5);
    expect(tickerEmPerSec).toBeLessThan(2.6);
    expect(tickerEmPerSec / verticalEmPerSec).toBeGreaterThan(1.1); // a marquee runs a bit quicker than a column…
    expect(tickerEmPerSec / verticalEmPerSec).toBeLessThan(2); // …but nowhere near the old ~5.8×
    // The old unit: 480 "characters" each as wide as "M" (≈0.9 em) = ~7.2 em/s.
    expect((480 * 0.9) / 60).toBeGreaterThan(3 * tickerEmPerSec);
  });

  it("default remains medium; legacy slow/medium/fast prefs load; unknown → medium", async () => {
    const meta = await createLoader({ fetch: fsFetch(FIXTURE) }).loadGenevaMeta();
    expect(defaultPrefs(meta).speed).toBe("medium");
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ speed: "slow" }) }), meta).speed).toBe("slow");
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ speed: "fast" }) }), meta).speed).toBe("fast");
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ speed: "very-slow" }) }), meta).speed).toBe("very-slow");
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ speed: "ludicrous" }) }), meta).speed).toBe("medium");
    const st = mem();
    savePrefs(st, { ...defaultPrefs(meta), speed: "very-slow" });
    expect(loadPrefs(st, meta).speed).toBe("very-slow");
  });
});
