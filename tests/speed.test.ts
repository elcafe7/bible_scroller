import { describe, expect, it } from "vitest";
import { SPEED_CPM, SPEED_LPM } from "../src/scroller";
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
  it("keeps Slow/Medium/Fast ticker CPM and vertical LPM unchanged", () => {
    expect(SPEED_CPM.slow).toBe(480);
    expect(SPEED_CPM.medium).toBe(900);
    expect(SPEED_CPM.fast).toBe(1620);
    expect(SPEED_LPM.slow).toBe(48);
    expect(SPEED_LPM.medium).toBe(80);
    expect(SPEED_LPM.fast).toBe(130);
  });

  it("adds Very Slow below Slow for both modes (~0.625× Slow)", () => {
    expect(SPEED_CPM["very-slow"]).toBe(300);
    expect(SPEED_LPM["very-slow"]).toBe(30);
    expect(SPEED_CPM["very-slow"]).toBeLessThan(SPEED_CPM.slow);
    expect(SPEED_LPM["very-slow"]).toBeLessThan(SPEED_LPM.slow);
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
