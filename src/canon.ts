import type { GenevaBook, GenevaMeta, GenevaMetaBook, VersePoint, VerseRef } from "./types";
import { DataError } from "./loader";
import { resolveRange } from "./sequence";

export const PROTESTANT_BOOK_IDS: readonly string[] = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy", "joshua", "judges", "ruth",
  "1samuel", "2samuel", "1kings", "2kings", "1chronicles", "2chronicles", "ezra", "nehemiah",
  "esther", "job", "psalms", "proverbs", "ecclesiastes", "song", "isaiah", "jeremiah",
  "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos", "obadiah", "jonah", "micah",
  "nahum", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi", "matthew", "mark",
  "luke", "john", "acts", "romans", "1corinthians", "2corinthians", "galatians", "ephesians",
  "philippians", "colossians", "1thessalonians", "2thessalonians", "1timothy", "2timothy",
  "titus", "philemon", "hebrews", "james", "1peter", "2peter", "1john", "2john", "3john",
  "jude", "revelation",
];
const PROTESTANT = new Set(PROTESTANT_BOOK_IDS);

export function isProtestantBookId(id: string): boolean { return PROTESTANT.has(id); }

/** All meta books in edition order (Protestant + Apocrypha when present). */
export function canonBooks(meta: GenevaMeta): GenevaMetaBook[] {
  return [...meta.books].sort((a, b) => a.order - b.order);
}

export function isOldTestament(bookId: string): boolean {
  const i = PROTESTANT_BOOK_IDS.indexOf(bookId);
  return i >= 0 && i <= PROTESTANT_BOOK_IDS.indexOf("malachi");
}

/** Word-style groups; Apocrypha = any book id not in the Protestant 66. */
export function groupBooks(books: GenevaMetaBook[]): {
  ot: GenevaMetaBook[];
  nt: GenevaMetaBook[];
  apocrypha: GenevaMetaBook[];
} {
  const ot: GenevaMetaBook[] = [];
  const nt: GenevaMetaBook[] = [];
  const apocrypha: GenevaMetaBook[] = [];
  for (const b of [...books].sort((a, c) => a.order - c.order)) {
    if (!isProtestantBookId(b.book_id)) apocrypha.push(b);
    else if (isOldTestament(b.book_id)) ot.push(b);
    else nt.push(b);
  }
  return { ot, nt, apocrypha };
}

export const SAMPLE_STARTS: readonly { label: string; book_id: string; start: VersePoint }[] = [
  { label: "Genesis 1:1", book_id: "genesis", start: { chapter: 1, verse: 1 } },
  { label: "Psalm 23:1", book_id: "psalms", start: { chapter: 23, verse: 1 } },
  { label: "Isaiah 40:1", book_id: "isaiah", start: { chapter: 40, verse: 1 } },
  { label: "Matthew 5:1", book_id: "matthew", start: { chapter: 5, verse: 1 } },
  { label: "John 1:1", book_id: "john", start: { chapter: 1, verse: 1 } },
  { label: "John 3:16", book_id: "john", start: { chapter: 3, verse: 16 } },
  { label: "Romans 8:1", book_id: "romans", start: { chapter: 8, verse: 1 } },
  { label: "1 Corinthians 13:1", book_id: "1corinthians", start: { chapter: 13, verse: 1 } },
  { label: "Revelation 21:1", book_id: "revelation", start: { chapter: 21, verse: 1 } },
];

export function sampleKey(bookId: string, start: VersePoint): string {
  return `${bookId}:${start.chapter}:${start.verse}`;
}

/** Start verse through the last verse of that book only (LoopCursor wraps the sequence). */
export function resolveFromStart(
  meta: GenevaMeta, books: Map<string, GenevaBook>,
  start: { book_id: string; chapter: number; verse: number },
): VerseRef[] {
  const mb = canonBooks(meta).find((b) => b.book_id === start.book_id);
  if (!mb) throw new DataError("range_invalid", "That passage is outside this book.");
  const book = books.get(start.book_id);
  if (!book) throw new DataError("book_missing", `Book data not found: ${start.book_id}.`, start.book_id);
  return resolveRange(meta, book, {
    book_id: start.book_id,
    start: { chapter: start.chapter, verse: start.verse },
    end: { chapter: mb.chapters, verse: mb.verse_counts[mb.chapters - 1] || 1 },
  });
}
