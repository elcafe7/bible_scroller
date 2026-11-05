import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripRequote, formatCommentaryText, createLoader, DataError } from "../src/loader";
import { henryForVerse, LoopCursor, onePass, resolveRange } from "../src/sequence";
import { fsFetch } from "./helpers";

const FIXTURE = resolve(__dirname, "../fixtures/john1");
const DATA = resolve(__dirname, "../data");
const loader = createLoader({ fetch: fsFetch(FIXTURE) });

describe("loader (fixture)", () => {
  it("loads geneva + henry meta and John", async () => {
    const meta = await loader.loadGenevaMeta();
    expect(meta.edition_id).toBe("geneva1599");
    const john = await loader.loadGenevaBook("john");
    expect(john.chapters[0].verses[0].text).toMatch(/^In the beginning/);
    expect((await loader.loadHenryMeta())?.source_id).toBe("matthew_henry");
    expect((await loader.loadHenryBook("john"))?.sections.length).toBeGreaterThan(1);
  });

  it("throws typed errors for missing meta / book", async () => {
    const empty = createLoader({ fetch: fsFetch("/nonexistent") });
    await expect(empty.loadGenevaMeta()).rejects.toMatchObject({ code: "meta_missing", message: "Bible data missing or unreadable." });
    await expect(loader.loadGenevaBook("genesis")).rejects.toMatchObject({ code: "book_missing", message: "Book data not found: genesis." });
    await expect(loader.loadGenevaBook("../x")).rejects.toBeInstanceOf(DataError);
  });

  it("returns null (not throw) for missing Henry files", async () => {
    const l = createLoader({ fetch: fsFetch(FIXTURE, ["henry/john.json", "henry/meta.json"]) });
    expect(await l.loadHenryBook("john")).toBeNull();
    expect(await l.loadHenryMeta()).toBeNull();
  });
});

describe("resolveRange / henryForVerse (fixture)", async () => {
  const meta = await loader.loadGenevaMeta();
  const john = await loader.loadGenevaBook("john");
  const henry = await loader.loadHenryBook("john");

  it("whole book, single chapter, verse span", () => {
    expect(resolveRange(meta, john, { book_id: "john" })).toHaveLength(51);
    expect(resolveRange(meta, john, { book_id: "john", start: { chapter: 1, verse: 1 }, end: { chapter: 1, verse: 51 } })).toHaveLength(51);
    const span = resolveRange(meta, john, { book_id: "john", start: { chapter: 1, verse: 3 }, end: { chapter: 1, verse: 7 } });
    expect(span.map((v) => v.verse)).toEqual([3, 4, 5, 6, 7]);
  });

  it("rejects out-of-book ranges", () => {
    expect(() => resolveRange(meta, john, { book_id: "john", start: { chapter: 1, verse: 60 }, end: { chapter: 1, verse: 61 } })).toThrow(DataError);
    expect(() => resolveRange(meta, john, { book_id: "john", start: { chapter: 1, verse: 9 }, end: { chapter: 1, verse: 2 } })).toThrow(DataError);
  });

  it("skips gaps without inventing text", () => {
    const gappy = { ...john, chapters: [{ chapter: 1, verses: john.chapters[0].verses.filter((v) => v.verse !== 4) }] };
    const seq = resolveRange(meta, gappy, { book_id: "john", start: { chapter: 1, verse: 1 }, end: { chapter: 1, verse: 6 } });
    expect(seq.map((v) => v.verse)).toEqual([1, 2, 3, 5, 6]);
  });

  it("henryForVerse matches verse-scoped sections only, first in order", () => {
    expect(henryForVerse(henry, { chapter: 1, verse: 3 })?.verse_start).toBe(1);
    expect(henryForVerse(henry, { chapter: 1, verse: 14 })?.verse_end).toBe(14);
    expect(henryForVerse(henry, { chapter: 2, verse: 1 })).toBeNull();
    const withOverview = { ...henry!, sections: [{ id: "o", chapter: 1, verse_start: null, verse_end: null, text: "overview" }, ...henry!.sections] };
    expect(henryForVerse(withOverview, { chapter: 1, verse: 1 })?.id).not.toBe("o");
    expect(henryForVerse(null, { chapter: 1, verse: 1 })).toBeNull();
  });

  it("Henry-off sequence length equals verse count", () => {
    const verses = resolveRange(meta, john, { book_id: "john" });
    const pass = onePass(verses, henry, false);
    expect(pass).toHaveLength(verses.length);
    expect(pass.every((i) => i.kind === "verse")).toBe(true);
  });

  it("Henry-on sequence length equals verses + matched notes", () => {
    const verses = resolveRange(meta, john, { book_id: "john" });
    const matched = new Set(verses.map((v) => henryForVerse(henry, v)?.id).filter(Boolean));
    const pass = onePass(verses, henry, true);
    expect(matched.size).toBe(7);
    expect(pass).toHaveLength(verses.length + matched.size);
    // note follows the last verse it covers: v5 then the 1–5 note, then v6
    const i5 = pass.findIndex((i) => i.kind === "verse" && i.verse === 5);
    expect(pass[i5 + 1]).toMatchObject({ kind: "henry", verse_start: 1, verse_end: 5 });
    expect(pass[i5 + 2]).toMatchObject({ kind: "verse", verse: 6 });
  });

  it("toggle takes effect on the next item and the loop wraps", () => {
    const verses = resolveRange(meta, john, { book_id: "john", start: { chapter: 1, verse: 4 }, end: { chapter: 1, verse: 6 } });
    const c = new LoopCursor(verses, henry);
    expect(c.next(true)).toMatchObject({ verse: 4 });
    expect(c.next(true)).toMatchObject({ verse: 5 });
    expect(c.next(false)).toMatchObject({ kind: "verse", verse: 6 }); // pending note dropped when off
    expect(c.next(false)).toMatchObject({ kind: "verse", verse: 4 }); // wrapped
  });

  it("Henry missing → verses only", () => {
    const verses = resolveRange(meta, john, { book_id: "john" });
    expect(onePass(verses, null, true)).toHaveLength(verses.length);
  });
});

describe.skipIf(!existsSync(resolve(DATA, "geneva/meta.json")))("full data/ build", () => {
  const full = createLoader({ fetch: fsFetch(DATA) });
  it("has 66 books and John 1:1", async () => {
    const meta = await full.loadGenevaMeta();
    expect(meta.books).toHaveLength(66);
    const john = await full.loadGenevaBook("john");
    expect(resolveRange(meta, john, { book_id: "john" }).length).toBeGreaterThan(800);
    expect((await full.loadHenryBook("john"))?.sections.some((s) => s.verse_start)).toBe(true);
  });
});

describe("stripRequote", () => {
  it("drops Henry's leading superscript-verse requote, keeps the comment", () => {
    expect(stripRequote("¹ In the beginning was the Word. \n² The same was in the beginning. \n\nAugustine said...")).toBe("Augustine said...");
    expect(stripRequote("¹⁰ Making request. \n\nComment.")).toBe("Comment.");
    expect(stripRequote("1. In the beginning. Calvin lemma stays.")).toBe("1. In the beginning. Calvin lemma stays.");
  });
});

describe("formatCommentaryText", () => {
  it("double-spaces after periods and keeps paragraph breaks", () => {
    const out = formatCommentaryText("First sentence. Second sentence.\n\nNew paragraph. More.");
    expect(out.split("\n\n")).toHaveLength(2);
    expect(out).toContain(".\u00A0\u00A0Second");
    expect(out).toContain(".\u00A0\u00A0More");
  });
});
