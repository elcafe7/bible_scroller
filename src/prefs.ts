import { canonBooks, groupBooks as groupCanonBooks } from "./canon";
import { DEFAULT_EDITION_ID, EDITIONS } from "./editions";
import type { Commentary, FontSize, GenevaMeta, GenevaMetaBook, Prefs, VersePoint, ScrollMode, Speed, Theme } from "./types";

export const PREFS_KEY = "bible_scroller.v1";
const SPEEDS: Speed[] = ["slow", "medium", "fast"];
const THEMES: Theme[] = ["light", "dark"];
const MODES: ScrollMode[] = ["vertical", "horizontal"];
const COMMENTARIES: Commentary[] = ["none", "henry", "calvin"];
const FONT_SIZES: FontSize[] = ["s", "m", "l", "xl"];

export function loadTheme(storage: KV): Theme {
  try {
    const t = (JSON.parse(storage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null)?.theme;
    return THEMES.includes(t as Theme) ? (t as Theme) : "light";
  } catch { return "light"; }
}
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export function safeStorage(): KV {
  const mem = new Map<string, string>();
  const fallback: KV = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  try {
    const ls = window.localStorage;
    const probe = "__bible_scroller_probe";
    ls.setItem(probe, "1"); ls.removeItem(probe);
    return {
      getItem: (k) => { try { return ls.getItem(k); } catch { return fallback.getItem(k); } },
      setItem: (k, v) => { try { ls.setItem(k, v); } catch { fallback.setItem(k, v); } },
    };
  } catch { return fallback; }
}

export function startToEnd(meta: GenevaMeta, bookId: string, start: VersePoint): Prefs["range"] {
  const mb = canonBooks(meta).find((b) => b.book_id === bookId) ?? meta.books.find((b) => b.book_id === bookId)!;
  return { book_id: mb.book_id, start, end: { chapter: mb.chapters, verse: mb.verse_counts[mb.chapters - 1] || 1 } };
}

/** Word-style OT / NT / Apocrypha optgroups; empty groups dropped. */
export function groupBooks(books: GenevaMetaBook[]): [string, GenevaMetaBook[]][] {
  const { ot, nt, apocrypha } = groupCanonBooks(books);
  return ([
    ["Old Testament", ot],
    ["New Testament", nt],
    ["Apocrypha", apocrypha],
  ] as [string, GenevaMetaBook[]][]).filter(([, bs]) => bs.length);
}

export function defaultPrefs(meta: GenevaMeta): Prefs {
  const books = canonBooks(meta);
  const mb = books.find((b) => b.book_id === "john") ?? books[0] ?? [...meta.books].sort((a, b) => a.order - b.order)[0];
  const start = mb.book_id === "john" && (mb.chapters >= 3) && (mb.verse_counts[2] ?? 0) >= 16
    ? { chapter: 3, verse: 16 }
    : { chapter: 1, verse: 1 };
  return { range: { book_id: mb.book_id, start }, edition: DEFAULT_EDITION_ID, commentary: "none", fontSize: "m", speed: "medium", theme: "light", mode: "vertical" };
}

function migrateRange(meta: GenevaMeta, r: unknown): Prefs["range"] | null {
  if (!r || typeof r !== "object") return null;
  const x = r as Partial<Prefs["range"]>;
  if (typeof x.book_id !== "string") return null;
  const mb = canonBooks(meta).find((b) => b.book_id === x.book_id);
  const p = x.start;
  if (!mb || !p) return null;
  const ok = Number.isInteger(p.chapter) && Number.isInteger(p.verse) && p.chapter >= 1 && p.chapter <= mb.chapters &&
    p.verse >= 1 && p.verse <= (mb.verse_counts[p.chapter - 1] ?? 0);
  return ok ? { book_id: mb.book_id, start: { chapter: p.chapter, verse: p.verse } } : null;
}

export function loadPrefs(storage: KV, meta: GenevaMeta): Prefs {
  const d = defaultPrefs(meta);
  let raw: unknown;
  try { const s = storage.getItem(PREFS_KEY); raw = s ? JSON.parse(s) : null; } catch { return d; }
  if (!raw || typeof raw !== "object") return d;
  const p = raw as Partial<Prefs> & { henry?: unknown };
  const editionIds = new Set(EDITIONS.map((e) => e.id));
  return {
    range: migrateRange(meta, p.range) ?? d.range,
    edition: editionIds.has(p.edition as string) ? (p.edition as string) : d.edition,
    commentary: COMMENTARIES.includes(p.commentary as Commentary) ? (p.commentary as Commentary)
      : typeof p.henry === "boolean" ? (p.henry ? "henry" : "none") : d.commentary,
    fontSize: FONT_SIZES.includes(p.fontSize as FontSize) ? (p.fontSize as FontSize) : d.fontSize,
    speed: SPEEDS.includes(p.speed as Speed) ? (p.speed as Speed) : d.speed,
    theme: THEMES.includes(p.theme as Theme) ? (p.theme as Theme) : d.theme,
    mode: MODES.includes(p.mode as ScrollMode) ? (p.mode as ScrollMode) : d.mode,
  };
}

export function savePrefs(storage: KV, prefs: Prefs) {
  const out: Prefs = {
    range: { book_id: prefs.range.book_id, start: prefs.range.start },
    edition: prefs.edition,
    commentary: prefs.commentary, fontSize: prefs.fontSize, speed: prefs.speed, theme: prefs.theme, mode: prefs.mode,
  };
  try { storage.setItem(PREFS_KEY, JSON.stringify(out)); } catch { /* */ }
}

/** Read stored edition id without needing meta (boot). */
export function peekEdition(storage: KV): string {
  try {
    const raw = JSON.parse(storage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    const id = raw?.edition;
    return EDITIONS.some((e) => e.id === id) ? (id as string) : DEFAULT_EDITION_ID;
  } catch { return DEFAULT_EDITION_ID; }
}
