import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createLoader } from "../src/loader";
import { groupBooks } from "../src/prefs";
import { resolveRange } from "../src/sequence";
import { EDITIONS } from "../src/editions";
import { fsFetch } from "./helpers";

const DATA = resolve(import.meta.dirname, "../data");
const hasFull = existsSync(resolve(DATA, "geneva/meta.json"))
  && existsSync(resolve(DATA, "kj16/meta.json"))
  && existsSync(resolve(DATA, "kjv/meta.json"));

describe.skipIf(!hasFull)("editions + Apocrypha data", () => {
  const loader = createLoader({ fetch: fsFetch(DATA) });

  it("ships Geneva, KJ16, KJV metas", async () => {
    for (const ed of EDITIONS) {
      const meta = await loader.loadEditionMeta(ed.dir);
      expect(meta.edition_id).toBe(ed.id);
      expect(meta.books.length).toBeGreaterThanOrEqual(66);
    }
  });

  it("Geneva has Apocrypha group with loadable Tobit text", async () => {
    const meta = await loader.loadEditionMeta("geneva");
    const groups = groupBooks(meta.books);
    expect(groups.map(([l]) => l)).toEqual(["Old Testament", "New Testament", "Apocrypha"]);
    const apoc = groups.find(([l]) => l === "Apocrypha")![1].map((b) => b.book_id);
    expect(apoc).toEqual([
      "tobit", "judith", "wisdom", "sirach", "baruch", "1maccabees", "2maccabees",
    ]);
    const tob = await loader.loadEditionBook("geneva", "tobit");
    const verses = resolveRange(meta, tob, {
      book_id: "tobit",
      start: { chapter: 1, verse: 1 },
      end: { chapter: 1, verse: 3 },
    });
    expect(verses.length).toBe(3);
    expect(verses[0]!.text.toLowerCase()).toContain("tobit");
  });

  it("KJ16 has Apocrypha including 1 Esdras; text loads", async () => {
    const meta = await loader.loadEditionMeta("kj16");
    const apoc = groupBooks(meta.books).find(([l]) => l === "Apocrypha")![1].map((b) => b.book_id);
    expect(apoc).toContain("1esdras");
    expect(apoc).toContain("tobit");
    expect(apoc).toContain("prayerofmanasseh");
    expect(apoc).toHaveLength(14);
    const esd = await loader.loadEditionBook("kj16", "1esdras");
    const verses = resolveRange(meta, esd, {
      book_id: "1esdras",
      start: { chapter: 1, verse: 1 },
      end: { chapter: 1, verse: 1 },
    });
    expect(verses[0]!.text.length).toBeGreaterThan(20);
  });

  it("KJV has no Apocrypha group and no tobit file", async () => {
    const meta = await loader.loadEditionMeta("kjv");
    expect(meta.books).toHaveLength(66);
    const labels = groupBooks(meta.books).map(([l]) => l);
    expect(labels).toEqual(["Old Testament", "New Testament"]);
    expect(labels).not.toContain("Apocrypha");
    await expect(loader.loadEditionBook("kjv", "tobit")).rejects.toMatchObject({ code: "book_missing" });
  });
});
