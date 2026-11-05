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

  async function loadGenevaMeta(): Promise<GenevaMeta> {
    const j = (await getJson("geneva/meta.json")) as GenevaMeta | undefined;
    if (!j || !Array.isArray(j.books) || j.books.length === 0) {
      throw new DataError("meta_missing", "Bible data missing or unreadable.");
    }
    return j;
  }

  async function loadGenevaBook(bookId: string): Promise<GenevaBook> {
    const j = SAFE_ID.test(bookId) ? ((await getJson(`geneva/${bookId}.json`)) as GenevaBook | undefined) : undefined;
    if (!j || !Array.isArray(j.chapters)) {
      throw new DataError("book_missing", `Book data not found: ${bookId}.`, bookId);
    }
    return j;
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

  return { loadGenevaMeta, loadGenevaBook, loadHenryMeta, loadHenryBook };
}

export type Loader = ReturnType<typeof createLoader>;
