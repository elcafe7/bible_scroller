import { canonBooks, isProtestantBookId } from "./canon";
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

/** Word-style OT/NT only — Apocrypha never listed. */
export function groupBooks(books: GenevaMetaBook[]): [string, GenevaMetaBook[]][] {
  const protestant = books.filter((b) => isProtestantBookId(b.book_id));
  const s = [...protestant].sort((a, b) => a.order - b.order);
  return ([
    ["Old Testament", s.filter((b) => b.order >= 1 && b.order <= 39)],
    ["New Testament", s.filter((b) => b.order >= 40 && b.order <= 66)],
  ] as [string, GenevaMetaBook[]][]).filter(([, bs]) => bs.length);
}

export function defaultPrefs(meta: GenevaMeta): Prefs {
  const books = canonBooks(meta);
  const mb = books.find((b) => b.book_id === "john") ?? books[0] ?? [...meta.books].sort((a, b) => a.order - b.order)[0];
  return { range: { book_id: mb.book_id, start: { chapter: 1, verse: 1 } }, commentary: "none", fontSize: "m", speed: "medium", theme: "light", mode: "vertical" };
}

function migrateRange(meta: GenevaMeta, r: unknown): Prefs["range"] | null {
  if (!r || typeof r !== "object") return null;
  const x = r as Partial<Prefs["range"]>;
  if (typeof x.book_id !== "string" || !isProtestantBookId(x.book_id)) return null;
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
  return {
    range: migrateRange(meta, p.range) ?? d.range,
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
    commentary: prefs.commentary, fontSize: prefs.fontSize, speed: prefs.speed, theme: prefs.theme, mode: prefs.mode,
  };
  try { storage.setItem(PREFS_KEY, JSON.stringify(out)); } catch { /* */ }
}
