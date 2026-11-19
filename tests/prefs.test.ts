import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createLoader } from "../src/loader";
import { defaultPrefs, groupBooks, loadPrefs, loadTheme, PREFS_KEY, safeStorage, savePrefs, type KV } from "../src/prefs";
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

  it("first-run defaults: John 3:16 when available, else John 1:1; commentary none, medium", () => {
    const d = loadPrefs(mem(), meta);
    const john = meta.books.find((b) => b.book_id === "john");
    const expectStart = john && john.chapters >= 3 && (john.verse_counts[2] ?? 0) >= 16
      ? { chapter: 3, verse: 16 } : { chapter: 1, verse: 1 };
    expect(d).toEqual({
      range: { book_id: "john", start: expectStart },
      edition: "geneva1599",
      commentary: "none",
      fontSize: "m",
      speed: "medium",
      theme: "light",
      mode: "vertical",
    });
  });

  it("mode defaults to vertical, corrupt → vertical, toggle persists", () => {
    expect(defaultPrefs(meta).mode).toBe("vertical");
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ mode: "diagonal" }) }), meta).mode).toBe("vertical");
    const st = mem();
    savePrefs(st, { ...defaultPrefs(meta), mode: "horizontal" });
    expect(loadPrefs(st, meta).mode).toBe("horizontal");
  });

  it("theme defaults to light, corrupt → light, toggle persists", () => {
    expect(defaultPrefs(meta).theme).toBe("light");
    expect(loadTheme(mem())).toBe("light");
    expect(loadTheme(mem({ [PREFS_KEY]: "{bad" }))).toBe("light");
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ theme: "neon" }) }), meta).theme).toBe("light");
    const st = mem();
    savePrefs(st, { ...defaultPrefs(meta), theme: "dark" });
    expect(loadPrefs(st, meta).theme).toBe("dark");
    expect(loadTheme(st)).toBe("dark");
  });

  it("corrupt localStorage JSON falls back to defaults", () => {
    expect(loadPrefs(mem({ [PREFS_KEY]: "{not json" }), meta)).toEqual(defaultPrefs(meta));
    expect(loadPrefs(mem({ [PREFS_KEY]: "42" }), meta)).toEqual(defaultPrefs(meta));
  });

  it("invalid fields are replaced individually; legacy henry migrates", () => {
    const s = mem({ [PREFS_KEY]: JSON.stringify({ range: { book_id: "genesis" }, henry: "yes", speed: "ludicrous" }) });
    expect(loadPrefs(s, meta)).toEqual(defaultPrefs(meta));
    const ok = mem({ [PREFS_KEY]: JSON.stringify({ range: { book_id: "john", start: { chapter: 1, verse: 3 }, end: { chapter: 1, verse: 9 } }, henry: true, speed: "slow" }) });
    expect(loadPrefs(ok, meta)).toMatchObject({ commentary: "henry", speed: "slow", range: { book_id: "john", start: { verse: 3 } } });
    expect(loadPrefs(ok, meta).range).not.toHaveProperty("end");
  });

  it("round-trips and survives a throwing store", () => {
    const s = mem();
    const p = { ...defaultPrefs(meta), commentary: "henry" as const, speed: "fast" as const };
    savePrefs(s, p);
    expect(loadPrefs(s, meta)).toEqual(p);
    const broken: KV = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(() => savePrefs(broken, p)).not.toThrow();
    expect(loadPrefs(broken, meta)).toEqual(defaultPrefs(meta));
  });

  it("safeStorage falls back to memory when localStorage is unavailable", () => {
    const s = safeStorage();
    s.setItem("a", "1");
    expect(s.getItem("a")).toBe("1");
  });

  it("start-only: stored end is ignored and dropped on save", () => {
    const s = mem({ [PREFS_KEY]: JSON.stringify({ range: { book_id: "john", start: { chapter: 1, verse: 5 }, end: { chapter: 1, verse: 2 } } }) });
    const r = loadPrefs(s, meta).range;
    expect(r).toEqual({ book_id: "john", start: { chapter: 1, verse: 5 } });
    savePrefs(s, loadPrefs(s, meta));
    expect(JSON.parse(s.getItem(PREFS_KEY)!).range).toEqual({ book_id: "john", start: { chapter: 1, verse: 5 } });
  });

  it("groups books Word-style OT / NT / Apocrypha, empty groups dropped", () => {
    const b = (id: string, order: number) => ({ book_id: id, book: id, order, chapters: 1, verse_counts: [1] });
    expect(groupBooks([b("john", 43), b("genesis", 1)]).map(([l, bs]) => [l, bs.map((x) => x.book_id)]))
      .toEqual([["Old Testament", ["genesis"]], ["New Testament", ["john"]]]);
    expect(groupBooks([b("tobit", 67), b("genesis", 1)]).map(([l, bs]) => [l, bs.map((x) => x.book_id)]))
      .toEqual([["Old Testament", ["genesis"]], ["Apocrypha", ["tobit"]]]);
  });

  it("commentary + font size: legacy henry migrates, invalid falls back, round-trips", () => {
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ henry: true }) }), meta).commentary).toBe("henry");
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ henry: false }) }), meta).commentary).toBe("none");
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ commentary: "barth", fontSize: "huge" }) }), meta)).toMatchObject({ commentary: "none", fontSize: "m" });
    const st = mem();
    savePrefs(st, { ...defaultPrefs(meta), commentary: "calvin", fontSize: "xl" });
    expect(loadPrefs(st, meta)).toMatchObject({ commentary: "calvin", fontSize: "xl" });
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
