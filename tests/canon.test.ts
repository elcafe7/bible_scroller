import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_STARTS,
  canonBooks,
  isOldTestament,
  isProtestantBookId,
  resolveFromStart,
  sampleKey,
} from "../src/canon";
import { createLoader } from "../src/loader";
import type { GenevaBook, GenevaMeta, GenevaMetaBook } from "../src/types";
import { fsFetch } from "./helpers";

const FIXTURE = resolve(__dirname, "../fixtures/john1");
const loader = createLoader({ fetch: fsFetch(FIXTURE) });

describe("canon filter", () => {
  it("rejects apocrypha ids and keeps Protestant 66", () => {
    expect(isProtestantBookId("john")).toBe(true);
    expect(isProtestantBookId("tobit")).toBe(false);
    expect(isProtestantBookId("wisdom")).toBe(false);
    expect(isProtestantBookId("1maccabees")).toBe(false);
  });

  it("canonBooks drops apocrypha rows even if meta lists them", async () => {
    const meta = await loader.loadGenevaMeta();
    const polluted: GenevaMeta = {
      ...meta,
      books: [
        ...meta.books,
        { book_id: "tobit", book: "Tobit", order: 99, chapters: 1, verse_counts: [1] } satisfies GenevaMetaBook,
      ],
    };
    expect(canonBooks(polluted).map((b) => b.book_id)).toEqual(["john"]);
  });

  it("OT/NT split matches Word testament groups", () => {
    expect(isOldTestament("genesis")).toBe(true);
    expect(isOldTestament("malachi")).toBe(true);
    expect(isOldTestament("matthew")).toBe(false);
  });

  it("sample menu has Protestant-only presets", () => {
    const labels = SAMPLE_STARTS.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(["John 1:1", "Psalm 23:1", "Genesis 1:1", "Romans 8:1"]));
    expect(SAMPLE_STARTS.every((s) => isProtestantBookId(s.book_id))).toBe(true);
    expect(sampleKey("john", { chapter: 3, verse: 16 })).toBe("john:3:16");
  });
});

describe("resolveFromStart", async () => {
  const meta = await loader.loadGenevaMeta();
  const john = await loader.loadGenevaBook("john");
  const books = new Map<string, GenevaBook>([["john", john]]);

  it("starts at the chosen verse and wraps within available canon books", () => {
    const seq = resolveFromStart(meta, books, { book_id: "john", chapter: 1, verse: 50 });
    expect(seq[0]).toMatchObject({ verse: 50 });
    expect(seq[1]).toMatchObject({ verse: 51 });
    expect(seq[2]).toMatchObject({ verse: 1 });
    expect(seq).toHaveLength(51);
  });

  it("rejects starts outside the book / apocrypha", () => {
    expect(() => resolveFromStart(meta, books, { book_id: "john", chapter: 1, verse: 99 })).toThrow(/outside/);
    expect(() => resolveFromStart(meta, books, { book_id: "tobit", chapter: 1, verse: 1 })).toThrow(/outside/);
  });

  it("orders multiple books as start→end then Genesis… before start", () => {
    const miniMeta: GenevaMeta = {
      ...meta,
      books: [
        { book_id: "john", book: "John", order: 43, chapters: 1, verse_counts: [2] },
        { book_id: "acts", book: "Acts", order: 44, chapters: 1, verse_counts: [1] },
        { book_id: "genesis", book: "Genesis", order: 1, chapters: 1, verse_counts: [1] },
      ],
    };
    const mk = (id: string, name: string, verses: string[]): GenevaBook => ({
      book_id: id, book: name, source: "test", schema_version: 1,
      chapters: [{ chapter: 1, verses: verses.map((text, i) => ({ verse: i + 1, text })) }],
    });
    const map = new Map<string, GenevaBook>([
      ["genesis", mk("genesis", "Genesis", ["g1"])],
      ["john", mk("john", "John", ["j1", "j2"])],
      ["acts", mk("acts", "Acts", ["a1"])],
    ]);
    const seq = resolveFromStart(miniMeta, map, { book_id: "john", chapter: 1, verse: 2 });
    expect(seq.map((v) => `${v.book_id}:${v.verse}`)).toEqual(["john:2", "acts:1", "genesis:1", "john:1"]);
  });
});
