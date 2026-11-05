import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FetchLike } from "../src/loader";

/** fetch stand-in that serves files from a directory; optional list of paths to pretend are missing. */
export function fsFetch(root: string, missing: string[] = []): FetchLike {
  return async (url: string) => {
    const rel = url.replace(/^data\//, "");
    if (missing.includes(rel)) return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
    try {
      const body = await readFile(join(root, rel), "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
    }
  };
}
