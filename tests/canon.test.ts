import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_STARTS,
  canonBooks,
  groupBooks,
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
  it("rejects apocrypha ids from Protestant set and keeps 66 ids", () => {
    expect(isProtestantBookId("john")).toBe(true);
    expect(isProtestantBookId("tobit")).toBe(false);
    expect(isProtestantBookId("wisdom")).toBe(false);
    expect(isProtestantBookId("1maccabees")).toBe(false);
  });

  it("canonBooks keeps all meta books in order, including Apocrypha", async () => {
    const meta = await loader.loadGenevaMeta();
    const polluted: GenevaMeta = {
      ...meta,
      books: [
        ...meta.books,
        { book_id: "tobit", book: "Tobit", order: 99, chapters: 1, verse_counts: [1] } satisfies GenevaMetaBook,
      ],
    };
    expect(canonBooks(polluted).map((b) => b.book_id)).toEqual(["john", "tobit"]);
  });

  it("groupBooks splits OT / NT / Apocrypha by Protestant ids", () => {
    const b = (id: string, order: number): GenevaMetaBook => ({ book_id: id, book: id, order, chapters: 1, verse_counts: [1] });
    expect(groupBooks([b("john", 43), b("genesis", 1), b("tobit", 67)])).toEqual({
      ot: [b("genesis", 1)],
      nt: [b("john", 43)],
      apocrypha: [b("tobit", 67)],
    });
  });

  it("OT/NT split matches Word testament groups", () => {
    expect(isOldTestament("genesis")).toBe(true);
    expect(isOldTestament("malachi")).toBe(true);
    expect(isOldTestament("matthew")).toBe(false);
  });

  it("legacy SAMPLE_STARTS helpers stay Protestant-only (Sample UI removed)", () => {
    expect(SAMPLE_STARTS.every((s) => isProtestantBookId(s.book_id))).toBe(true);
    expect(sampleKey("john", { chapter: 3, verse: 16 })).toBe("john:3:16");
  });
});

describe("resolveFromStart", async () => {
  const meta = await loader.loadGenevaMeta();
  const john = await loader.loadGenevaBook("john");
  const books = new Map<string, GenevaBook>([["john", john]]);

  it("starts at the chosen verse through end of that book only", () => {
    const seq = resolveFromStart(meta, books, { book_id: "john", chapter: 1, verse: 50 });
    expect(seq[0]).toMatchObject({ verse: 50 });
    expect(seq[1]).toMatchObject({ verse: 51 });
    expect(seq).toHaveLength(2);
    expect(seq.every((v) => v.book_id === "john")).toBe(true);
  });

  it("rejects starts outside the book / unknown book", () => {
    expect(() => resolveFromStart(meta, books, { book_id: "john", chapter: 1, verse: 99 })).toThrow(/outside/);
    expect(() => resolveFromStart(meta, books, { book_id: "tobit", chapter: 1, verse: 1 })).toThrow(/outside/);
  });

  it("does not continue into other books", () => {
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
    expect(seq.map((v) => `${v.book_id}:${v.verse}`)).toEqual(["john:2"]);
  });
});
