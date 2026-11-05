import type { GenevaMeta, Prefs, ScrollMode, Speed, Theme } from "./types";

export const PREFS_KEY = "bible_scroller.v1";
const SPEEDS: Speed[] = ["slow", "medium", "fast"];
const THEMES: Theme[] = ["light", "dark"];
const MODES: ScrollMode[] = ["vertical", "horizontal"];

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

/** First-run default: John 1 (or chapter 1 of the first book if John is absent), Henry off, medium. */
export function defaultPrefs(meta: GenevaMeta): Prefs {
  const mb = meta.books.find((b) => b.book_id === "john") ?? [...meta.books].sort((a, b) => a.order - b.order)[0];
  return {
    range: { book_id: mb.book_id, start: { chapter: 1, verse: 1 }, end: { chapter: 1, verse: mb.verse_counts[0] || 1 } },
    henry: false,
    speed: "medium",
    theme: "light",
    mode: "vertical",
  };
}

function validRange(meta: GenevaMeta, r: unknown): r is Prefs["range"] {
  if (!r || typeof r !== "object") return false;
  const x = r as Prefs["range"];
  const mb = meta.books.find((b) => b.book_id === x.book_id);
  if (!mb || !x.start || !x.end) return false;
  const ok = (p: { chapter: number; verse: number }) =>
    Number.isInteger(p.chapter) && Number.isInteger(p.verse) && p.chapter >= 1 && p.chapter <= mb.chapters &&
    p.verse >= 1 && p.verse <= (mb.verse_counts[p.chapter - 1] ?? 0);
  const order = x.start.chapter - x.end.chapter || x.start.verse - x.end.verse;
  return ok(x.start) && ok(x.end) && order <= 0;
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
    range: validRange(meta, p.range) ? p.range : d.range,
    henry: typeof p.henry === "boolean" ? p.henry : d.henry,
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
