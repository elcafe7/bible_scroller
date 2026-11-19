// Property-based ("fuzz") tests with fast-check for the code that reads stored or
// loaded text: saved preferences (localStorage can hold anything) and commentary
// text. They run in the normal `npm test`, with a fixed seed so a CI failure
// reproduces; set FAST_CHECK_RUNS to run many more cases locally. This is also
// what the OpenSSF Scorecard "Fuzzing" check looks for in a JavaScript project.
import { resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createLoader, formatCommentaryText, stripRequote } from "../src/loader";
import { loadPrefs, PREFS_KEY, type KV } from "../src/prefs";
import { fsFetch } from "./helpers";

const numRuns = Number(process.env.FAST_CHECK_RUNS) || 500;
const opts = { seed: 20261119, numRuns };

const loader = createLoader({ fetch: fsFetch(resolve(__dirname, "../fixtures/john1")) });
const meta = await loader.loadGenevaMeta();
const store = (value: string): KV => ({ getItem: () => value, setItem: () => {} });

describe("fuzz: stored preferences", () => {
  it("loadPrefs never throws on any stored string and always returns usable prefs", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (s) => {
        const p = loadPrefs(store(s), meta);
        expect(["light", "dark"]).toContain(p.theme);
        expect(["vertical", "horizontal"]).toContain(p.mode);
        expect(["very-slow", "slow", "medium", "fast"]).toContain(p.speed);
        expect(meta.books.some((b) => b.book_id === p.range.book_id)).toBe(true);
      }),
      opts,
    );
  });

  it("loadPrefs survives any JSON value stored under the prefs key", () => {
    fc.assert(
      fc.property(fc.json(), (j) => {
        const mem = new Map([[PREFS_KEY, j]]);
        const p = loadPrefs({ getItem: (k) => mem.get(k) ?? null, setItem: () => {} }, meta);
        expect(p.range.start.chapter).toBeGreaterThanOrEqual(1);
        expect(p.range.start.verse).toBeGreaterThanOrEqual(1);
      }),
      opts,
    );
  });
});

describe("fuzz: commentary text", () => {
  it("stripRequote and formatCommentaryText never throw and never grow the text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (t) => {
        expect(stripRequote(t).length).toBeLessThanOrEqual(t.length);
        expect(typeof formatCommentaryText(t)).toBe("string");
      }),
      opts,
    );
  });

  it("formatCommentaryText has no empty paragraphs and is stable when run twice", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (t) => {
        const once = formatCommentaryText(t);
        expect(once.split("\n\n").every((para) => para.length > 0) || once === "").toBe(true);
        expect(formatCommentaryText(once)).toBe(once);
      }),
      opts,
    );
  });
});
