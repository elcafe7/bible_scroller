import { describe, expect, it } from "vitest";
import { createLoader, type FetchLike, type ScriptLoader } from "../src/loader";

const META = { edition_id: "geneva1599", books: [{ book_id: "john", book: "John", order: 43, chapters: 21, verse_counts: [51] }] };
const BOOK = { book_id: "john", book: "John", chapters: [{ chapter: 1, verses: [{ verse: 1, text: "In the beginning" }] }] };
const HENRY = { books: [{ book_id: "john", book: "John" }] };
const HENRY_JOHN = { book_id: "john", sections: [{ id: "s1", chapter: 1, verse_start: 1, verse_end: 5, text: "Note." }] };
const FILES: Record<string, unknown> = {
  "geneva/meta.json": META, "geneva/john.json": BOOK,
  "henry/meta.json": HENRY, "henry/john.json": HENRY_JOHN,
  "calvin/meta.json": HENRY, "calvin/john.json": HENRY_JOHN,
};

/** Only the .js wrappers exist (offline zip opened from file://): fetch always fails. */
const blockedFetch: FetchLike = async () => { throw new TypeError("Failed to fetch (file:// CORS)"); };
const wrappers = (seen: string[]): ScriptLoader => async (src, key) => {
  seen.push(src);
  return FILES[key];
};

describe("file:// script-wrapper fallback", () => {
  it("loads Bible + Henry + Calvin from data/*.json.js when fetch is blocked", async () => {
    const seen: string[] = [];
    const loader = createLoader({ fetch: blockedFetch, script: wrappers(seen), preferScript: false });
    expect((await loader.loadEditionMeta("geneva")).edition_id).toBe("geneva1599");
    expect((await loader.loadEditionBook("geneva", "john")).chapters[0]!.verses[0]!.text).toBe("In the beginning");
    for (const c of ["henry", "calvin"]) {
      expect((await loader.loadCommentaryMeta(c))!.books[0]!.book_id).toBe("john");
      expect((await loader.loadCommentaryBook(c, "john"))!.sections[0]!.text).toBe("Note.");
    }
    expect(seen).toEqual([
      "data/geneva/meta.json.js", "data/geneva/john.json.js",
      "data/henry/meta.json.js", "data/henry/john.json.js",
      "data/calvin/meta.json.js", "data/calvin/john.json.js",
    ]);
  });

  it("uses fetch (https web copy, .json only) and never touches the script loader", async () => {
    const seen: string[] = [];
    const okFetch: FetchLike = async (url) => {
      const v = FILES[url.replace(/^data\//, "")];
      return { ok: v !== undefined, json: async () => v };
    };
    const loader = createLoader({ fetch: okFetch, script: wrappers(seen), preferScript: false });
    expect((await loader.loadEditionMeta("geneva")).edition_id).toBe("geneva1599");
    expect(await loader.loadCommentaryBook("henry", "john")).not.toBeNull();
    expect(seen).toEqual([]);
  });

  it("from file:// tries the wrapper first, then fetch (Firefox with raw .json)", async () => {
    const order: string[] = [];
    const loader = createLoader({
      preferScript: true,
      script: async (src) => { order.push(`script ${src}`); return undefined; },
      fetch: async (url) => { order.push(`fetch ${url}`); return { ok: true, json: async () => META }; },
    });
    expect((await loader.loadEditionMeta("geneva")).edition_id).toBe("geneva1599");
    expect(order).toEqual(["script data/geneva/meta.json.js", "fetch data/geneva/meta.json"]);
  });

  it("missing in both formats -> same DataError / null as before", async () => {
    const loader = createLoader({ fetch: blockedFetch, script: async () => undefined, preferScript: false });
    await expect(loader.loadEditionBook("geneva", "tobit")).rejects.toMatchObject({ code: "book_missing" });
    expect(await loader.loadCommentaryBook("henry", "psalms")).toBeNull();
  });
});
