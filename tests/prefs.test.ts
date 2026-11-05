import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createLoader } from "../src/loader";
import { defaultPrefs, loadPrefs, PREFS_KEY, safeStorage, savePrefs, type KV } from "../src/prefs";
import { onePass, resolveRange } from "../src/sequence";
import { fsFetch } from "./helpers";

const FIXTURE = resolve(__dirname, "../fixtures/john1");
const loader = createLoader({ fetch: fsFetch(FIXTURE) });
const mem = (init: Record<string, string> = {}): KV & { m: Map<string, string> } => {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe("preferences", async () => {
  const meta = await loader.loadGenevaMeta();

  it("first-run defaults: John 1, Henry off, medium", () => {
    expect(loadPrefs(mem(), meta)).toEqual({
      range: { book_id: "john", start: { chapter: 1, verse: 1 }, end: { chapter: 1, verse: 51 } },
      henry: false,
      speed: "medium",
    });
  });

  it("corrupt localStorage JSON falls back to defaults", () => {
    expect(loadPrefs(mem({ [PREFS_KEY]: "{not json" }), meta)).toEqual(defaultPrefs(meta));
    expect(loadPrefs(mem({ [PREFS_KEY]: "42" }), meta)).toEqual(defaultPrefs(meta));
  });

  it("invalid fields are replaced individually", () => {
    const s = mem({ [PREFS_KEY]: JSON.stringify({ range: { book_id: "genesis" }, henry: "yes", speed: "ludicrous" }) });
    expect(loadPrefs(s, meta)).toEqual(defaultPrefs(meta));
    const ok = mem({ [PREFS_KEY]: JSON.stringify({ range: { book_id: "john", start: { chapter: 1, verse: 3 }, end: { chapter: 1, verse: 9 } }, henry: true, speed: "slow" }) });
    expect(loadPrefs(ok, meta)).toMatchObject({ henry: true, speed: "slow", range: { start: { verse: 3 }, end: { verse: 9 } } });
  });

  it("round-trips and survives a throwing store", () => {
    const s = mem();
    const p = { ...defaultPrefs(meta), henry: true, speed: "fast" as const };
    savePrefs(s, p);
    expect(loadPrefs(s, meta)).toEqual(p);
    const broken: KV = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(() => savePrefs(broken, p)).not.toThrow();
    expect(loadPrefs(broken, meta)).toEqual(defaultPrefs(meta));
  });

  it("safeStorage falls back to memory when localStorage is unavailable", () => {
    const s = safeStorage(); // no window in node
    s.setItem("a", "1");
    expect(s.getItem("a")).toBe("1");
  });
});

describe("missing Henry file", () => {
  it("keeps scrolling verses only when henry/<book>.json is absent", async () => {
    const l = createLoader({ fetch: fsFetch(FIXTURE, ["henry/john.json"]) });
    const meta = await l.loadGenevaMeta();
    const john = await l.loadGenevaBook("john");
    const henry = await l.loadHenryBook("john");
    expect(henry).toBeNull();
    const verses = resolveRange(meta, john, { book_id: "john" });
    const pass = onePass(verses, henry, true);
    expect(pass).toHaveLength(verses.length);
    expect(pass.every((i) => i.kind === "verse")).toBe(true);
  });
});
