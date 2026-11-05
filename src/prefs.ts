import type { Commentary, FontSize, GenevaMeta, GenevaMetaBook, Prefs, VersePoint, ScrollMode, Speed, Theme } from "./types";

export const PREFS_KEY = "bible_scroller.v1";
const SPEEDS: Speed[] = ["slow", "medium", "fast"];
const THEMES: Theme[] = ["light", "dark"];
const MODES: ScrollMode[] = ["vertical", "horizontal"];
const COMMENTARIES: Commentary[] = ["none", "henry", "calvin"];
const FONT_SIZES: FontSize[] = ["s", "m", "l", "xl"];

/** Theme only, readable before meta loads so the page paints in the right palette. */
export function loadTheme(storage: KV): Theme {
  try {
    const t = (JSON.parse(storage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null)?.theme;
    return THEMES.includes(t as Theme) ? (t as Theme) : "light";
  } catch {
    return "light";
  }
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** localStorage if usable; otherwise an in-memory map (private mode, quota, file:// quirks). */
export function safeStorage(): KV {
  const mem = new Map<string, string>();
  const fallback: KV = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  try {
    const ls = window.localStorage;
    const probe = "__bible_scroller_probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return {
      getItem: (k) => { try { return ls.getItem(k); } catch { return fallback.getItem(k); } },
      setItem: (k, v) => { try { ls.setItem(k, v); } catch { fallback.setItem(k, v); } },
    };
  } catch {
    return fallback;
  }
}

/** Start point through the last verse of that book (implicit loop end). */
export function startToEnd(meta: GenevaMeta, bookId: string, start: VersePoint): Prefs["range"] {
  const mb = meta.books.find((b) => b.book_id === bookId)!;
  return { book_id: mb.book_id, start, end: { chapter: mb.chapters, verse: mb.verse_counts[mb.chapters - 1] || 1 } };
}

/** Word-style book menu groups: OT (order 1-39), NT (40-66), Apocrypha (anything else). Empty groups dropped. */
export function groupBooks(books: GenevaMetaBook[]): [string, GenevaMetaBook[]][] {
  const s = [...books].sort((a, b) => a.order - b.order);
  const g: [string, GenevaMetaBook[]][] = [
    ["Old Testament", s.filter((b) => b.order >= 1 && b.order <= 39)],
    ["New Testament", s.filter((b) => b.order >= 40 && b.order <= 66)],
    ["Apocrypha", s.filter((b) => !(b.order >= 1 && b.order <= 66))],
  ];
  return g.filter(([, bs]) => bs.length);
}

/** First-run default: John 1 (or chapter 1 of the first book if John is absent), Henry off, medium. */
export function defaultPrefs(meta: GenevaMeta): Prefs {
  const mb = meta.books.find((b) => b.book_id === "john") ?? [...meta.books].sort((a, b) => a.order - b.order)[0];
  return {
    range: startToEnd(meta, mb.book_id, { chapter: 1, verse: 1 }),
    commentary: "none",
    fontSize: "m",
    speed: "medium",
    theme: "light",
    mode: "vertical",
  };
}

/** Start-only: a valid stored start is kept; any stored end is ignored and recomputed to end of book. */
function migrateRange(meta: GenevaMeta, r: unknown): Prefs["range"] | null {
  if (!r || typeof r !== "object") return null;
  const x = r as Partial<Prefs["range"]>;
  const mb = meta.books.find((b) => b.book_id === x.book_id);
  const p = x.start;
  if (!mb || !p) return null;
  const ok = Number.isInteger(p.chapter) && Number.isInteger(p.verse) && p.chapter >= 1 && p.chapter <= mb.chapters &&
    p.verse >= 1 && p.verse <= (mb.verse_counts[p.chapter - 1] ?? 0);
  return ok ? startToEnd(meta, mb.book_id, { chapter: p.chapter, verse: p.verse }) : null;
}

/** Corrupt or stale prefs fall back field by field to first-run defaults; never throws. */
export function loadPrefs(storage: KV, meta: GenevaMeta): Prefs {
  const d = defaultPrefs(meta);
  let raw: unknown;
  try {
    const s = storage.getItem(PREFS_KEY);
    raw = s ? JSON.parse(s) : null;
  } catch {
    return d;
  }
  if (!raw || typeof raw !== "object") return d;
  const p = raw as Partial<Prefs>;
  return {
    range: migrateRange(meta, p.range) ?? d.range,
    // Legacy { henry: boolean } migrates to commentary "henry" / "none".
    commentary: COMMENTARIES.includes(p.commentary as Commentary) ? (p.commentary as Commentary)
      : typeof (p as { henry?: unknown }).henry === "boolean" ? ((p as { henry: boolean }).henry ? "henry" : "none") : d.commentary,
    fontSize: FONT_SIZES.includes(p.fontSize as FontSize) ? (p.fontSize as FontSize) : d.fontSize,
    speed: SPEEDS.includes(p.speed as Speed) ? (p.speed as Speed) : d.speed,
    theme: THEMES.includes(p.theme as Theme) ? (p.theme as Theme) : d.theme,
    mode: MODES.includes(p.mode as ScrollMode) ? (p.mode as ScrollMode) : d.mode,
  };
}

export function savePrefs(storage: KV, prefs: Prefs) {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: keep running in memory */
  }
}
