import { DataError } from "./loader";
import type { GenevaBook, GenevaMeta, HenryBook, HenrySection, LoopItem, Range, VerseRef } from "./types";

const cmp = (a: { chapter: number; verse: number }, b: { chapter: number; verse: number }) =>
  a.chapter - b.chapter || a.verse - b.verse;

/**
 * Ordered verse sequence for a range. Omitted start/end = start/end of book.
 * Gaps in the data are skipped (never padded); a gap is logged once per book.
 */
export function resolveRange(meta: GenevaMeta, book: GenevaBook, range: Range): VerseRef[] {
  const mb = meta.books.find((b) => b.book_id === range.book_id);
  if (!mb || book.book_id !== range.book_id) {
    throw new DataError("book_missing", `Book data not found: ${range.book_id}.`, range.book_id);
  }
  const start = range.start ?? { chapter: 1, verse: 1 };
  const end = range.end ?? { chapter: mb.chapters, verse: mb.verse_counts[mb.chapters - 1] ?? 1 };
  const valid = (p: { chapter: number; verse: number }) =>
    Number.isInteger(p.chapter) && Number.isInteger(p.verse) && p.chapter >= 1 && p.chapter <= mb.chapters &&
    p.verse >= 1 && p.verse <= (mb.verse_counts[p.chapter - 1] ?? 0);
  if (!valid(start) || !valid(end) || cmp(start, end) > 0) {
    throw new DataError("range_invalid", "That passage is outside this book.");
  }
  const out: VerseRef[] = [];
  let gap = false;
  for (const ch of book.chapters) {
    if (ch.chapter < start.chapter || ch.chapter > end.chapter) continue;
    let expect = 0;
    for (const v of ch.verses) {
      const p = { chapter: ch.chapter, verse: v.verse };
      if (cmp(p, start) < 0 || cmp(p, end) > 0) { expect = v.verse; continue; }
      if (expect && v.verse !== expect + 1) gap = true;
      expect = v.verse;
      if (!v.text) continue;
      out.push({ book: book.book, book_id: book.book_id, chapter: ch.chapter, verse: v.verse, text: v.text });
    }
  }
  if (gap) console.info(`bible_scroller: skipped verse gaps in ${book.book_id}`);
  return out;
}

/** First verse-scoped section (export order) whose range covers the verse; chapter overviews never match. */
export function henryForVerse(henryBook: HenryBook | null, ref: { chapter: number; verse: number }): HenrySection | null {
  if (!henryBook) return null;
  for (const s of henryBook.sections) {
    if (s.chapter !== ref.chapter) continue;
    if (typeof s.verse_start !== "number" || typeof s.verse_end !== "number") continue;
    if (s.verse_start <= ref.verse && ref.verse <= s.verse_end && s.text) return s;
  }
  return null;
}

/**
 * Infinite loop cursor over a verse sequence. Henry mode is read on every step, so toggling
 * takes effect on the next item. A Henry section is shown once, right after the last verse
 * of the range that it covers (sections span several verses; repeating a long note after
 * each verse would stall the loop).
 */
export class LoopCursor {
  private i = 0;
  private pendingHenry: LoopItem | null = null;

  constructor(private verses: VerseRef[], private henryBook: HenryBook | null) {}

  get length() { return this.verses.length; }

  setHenryBook(h: HenryBook | null) { this.henryBook = h; }

  hasPending() { return this.pendingHenry !== null; }

  restart() { this.i = 0; this.pendingHenry = null; }

  next(henryOn: boolean): LoopItem | null {
    if (!this.verses.length) return null;
    if (this.pendingHenry) {
      const h = this.pendingHenry;
      this.pendingHenry = null;
      if (henryOn) return h;
    }
    const v = this.verses[this.i];
    const nextV = this.verses[(this.i + 1) % this.verses.length];
    const isLast = this.i === this.verses.length - 1;
    this.i = (this.i + 1) % this.verses.length;
    if (henryOn) {
      const s = henryForVerse(this.henryBook, v);
      if (s && (isLast || henryForVerse(this.henryBook, nextV) !== s)) {
        this.pendingHenry = {
          kind: "henry", book: v.book, chapter: s.chapter, verse_start: s.verse_start as number,
          verse_end: s.verse_end as number, text: s.text, for_verse: v.verse, section_title: s.section_title,
        };
      }
    }
    return { kind: "verse", book: v.book, chapter: v.chapter, verse: v.verse, text: v.text };
  }
}

/** One full pass of the loop (used by tests and for sizing). */
export function onePass(verses: VerseRef[], henryBook: HenryBook | null, henryOn: boolean): LoopItem[] {
  const c = new LoopCursor(verses, henryBook);
  const out: LoopItem[] = [];
  for (let n = 0; n < verses.length; n++) {
    out.push(c.next(henryOn)!);
    if (henryOn && c.hasPending()) out.push(c.next(henryOn)!);
  }
  return out;
}
