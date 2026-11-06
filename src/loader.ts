import type { GenevaBook, GenevaMeta, HenryBook, HenryMeta } from "./types";

export type DataErrorCode = "meta_missing" | "book_missing" | "range_invalid";

export class DataError extends Error {
  constructor(public code: DataErrorCode, message: string, public detail?: string) {
    super(message);
    this.name = "DataError";
  }
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

export interface LoaderOptions {
  /** Base URL/path of the data folder, relative to the page. */
  base?: string;
  fetch?: FetchLike;
}

const SAFE_ID = /^[a-z0-9_]+$/;

export function createLoader(opts: LoaderOptions = {}) {
  const base = (opts.base ?? "data").replace(/\/+$/, "");
  const doFetch: FetchLike = opts.fetch ?? ((url) => fetch(url));

  async function getJson(path: string): Promise<unknown | undefined> {
    let res;
    try {
      res = await doFetch(`${base}/${path}`);
    } catch {
      return undefined;
    }
    if (!res.ok) return undefined;
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }

  async function loadEditionMeta(dir: string): Promise<GenevaMeta> {
    if (!SAFE_ID.test(dir)) throw new DataError("meta_missing", "Bible data missing or unreadable.");
    const j = (await getJson(`${dir}/meta.json`)) as GenevaMeta | undefined;
    if (!j || !Array.isArray(j.books) || j.books.length === 0) {
      throw new DataError("meta_missing", "Bible data missing or unreadable.");
    }
    return j;
  }

  async function loadEditionBook(dir: string, bookId: string): Promise<GenevaBook> {
    const j = SAFE_ID.test(dir) && SAFE_ID.test(bookId)
      ? ((await getJson(`${dir}/${bookId}.json`)) as GenevaBook | undefined)
      : undefined;
    if (!j || !Array.isArray(j.chapters)) {
      throw new DataError("book_missing", `Book data not found: ${bookId}.`, bookId);
    }
    return j;
  }

  async function loadGenevaMeta(): Promise<GenevaMeta> {
    return loadEditionMeta("geneva");
  }

  async function loadGenevaBook(bookId: string): Promise<GenevaBook> {
    return loadEditionBook("geneva", bookId);
  }

  async function loadHenryMeta(): Promise<HenryMeta | null> {
    const j = (await getJson("henry/meta.json")) as HenryMeta | undefined;
    return j && Array.isArray(j.books) ? j : null;
  }

  async function loadHenryBook(bookId: string): Promise<HenryBook | null> {
    if (!SAFE_ID.test(bookId)) return null;
    const j = (await getJson(`henry/${bookId}.json`)) as HenryBook | undefined;
    return j && Array.isArray(j.sections) ? j : null;
  }

  /** Commentary source dir: "henry" | "calvin"; both share the HenryMeta/HenryBook JSON shape. */
  async function loadCommentaryMeta(dir: string): Promise<HenryMeta | null> {
    if (!SAFE_ID.test(dir)) return null;
    const j = (await getJson(`${dir}/meta.json`)) as HenryMeta | undefined;
    return j && Array.isArray(j.books) ? j : null;
  }
  async function loadCommentaryBook(dir: string, bookId: string): Promise<HenryBook | null> {
    if (!SAFE_ID.test(dir) || !SAFE_ID.test(bookId)) return null;
    const j = (await getJson(`${dir}/${bookId}.json`)) as HenryBook | undefined;
    if (!j || !Array.isArray(j.sections)) return null;
    const sections = j.sections.map((s) => ({ ...s, text: formatCommentaryText(stripRequote(s.text)) })).filter((s) => s.text);
    return { ...j, sections };
  }

  return { loadGenevaMeta, loadGenevaBook, loadEditionMeta, loadEditionBook, loadHenryMeta, loadHenryBook, loadCommentaryMeta, loadCommentaryBook };
}

export type Loader = ReturnType<typeof createLoader>;

/**
 * Drop the leading Scripture requote a commentary section opens with (Henry quotes the whole
 * passage as "¹ In the beginning… \n² The same…" before commenting). Only leading lines that
 * start with a superscript verse number are removed; the comment itself is kept.
 */
export function stripRequote(text: string): string {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && (/^\s*[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+\s/.test(lines[i]) || (i > 0 && !lines[i].trim()))) i++;
  return lines.slice(i).join("\n").trim();
}

/**
 * Commentary display polish for Henry/Calvin:
 * - keep blank-line paragraph breaks (render splits on \n\n)
 * - double gap after each period (two NBSP — never collapsed by HTML/CSS whitespace)
 */
export function formatCommentaryText(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n\s*\n/)
    .map((para) => {
      const line = para.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
      // Two NBSP after "." — \s matches NBSP, so flattenText must protect \u00A0 runs.
      return line.replace(/\.(\s+)(?=\S)/g, ".\u00A0\u00A0");
    })
    .filter(Boolean)
    .join("\n\n");
}
