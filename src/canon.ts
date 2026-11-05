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
export function canonBooks(meta: GenevaMeta): GenevaMetaBook[] {
  const byId = new Map(meta.books.filter((b) => isProtestantBookId(b.book_id)).map((b) => [b.book_id, b]));
  const out: GenevaMetaBook[] = [];
  for (const id of PROTESTANT_BOOK_IDS) { const b = byId.get(id); if (b) out.push(b); }
  return out;
}
export function isOldTestament(bookId: string): boolean {
  const i = PROTESTANT_BOOK_IDS.indexOf(bookId);
  return i >= 0 && i <= PROTESTANT_BOOK_IDS.indexOf("malachi");
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
export function resolveFromStart(
  meta: GenevaMeta, books: Map<string, GenevaBook>,
  start: { book_id: string; chapter: number; verse: number },
): VerseRef[] {
  const list = canonBooks(meta);
  if (!list.some((b) => b.book_id === start.book_id)) throw new DataError("range_invalid", "That passage is outside this book.");
  const ordered: VerseRef[] = [];
  for (const mb of list) {
    const book = books.get(mb.book_id);
    if (!book) continue;
    ordered.push(...resolveRange(meta, book, { book_id: mb.book_id }));
  }
  if (!ordered.length) throw new DataError("range_invalid", "No verses in that passage.");
  const i = ordered.findIndex((v) => v.book_id === start.book_id && v.chapter === start.chapter && v.verse === start.verse);
  if (i < 0) throw new DataError("range_invalid", "That passage is outside this book.");
  return [...ordered.slice(i), ...ordered.slice(0, i)];
}
