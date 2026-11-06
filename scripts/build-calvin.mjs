#!/usr/bin/env node
// Build-time only: Lex john_calvin.db -> data/calvin/** (same JSON shape as data/henry/**).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BOOKS } from "./books.mjs";

const OUT = join(resolve(import.meta.dirname, ".."), "data", "calvin");
const ws = (() => { try { return readdirSync("/workspace").filter((d) => d.startsWith("lex-")).map((d) => `/workspace/${d}/runtime-data/commentaries/john_calvin.db`); } catch { return []; } })();
const src = [process.env.BIBLE_SCROLLER_CALVIN_DB, "/home/box/.local/share/lex-cli/2.6.6/runtime-data/commentaries/john_calvin.db", ...ws]
  .filter(Boolean).find((p) => existsSync(p));
if (!src) { console.error("build-calvin: john_calvin.db not found (set BIBLE_SCROLLER_CALVIN_DB)"); process.exit(2); }
const SOURCE = "John Calvin's Commentaries";
const write = (p, o) => writeFileSync(p, JSON.stringify(o) + "\n");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const db = new DatabaseSync(src, { readOnly: true });
const stmt = db.prepare(`SELECT chapter, section_order, section_title, verse_start, verse_end, content FROM commentary
  WHERE book = ? AND verse_start IS NOT NULL ORDER BY chapter, section_order`);
const books = []; const missing = []; let n = 0;
for (const b of BOOKS) {
  const seen = new Set(); const sections = [];
  for (const r of stmt.all(b.book)) {
    const text = String(r.content ?? "").trim();
    if (!text) continue;
    const vs = Number(r.verse_start), ve = Number(r.verse_end ?? r.verse_start) || vs;
    const id = `calvin:${b.book}:${r.chapter}:${vs}-${ve}:${r.section_order}`;
    if (seen.has(id)) continue;
    seen.add(id);
    sections.push({ id, chapter: Number(r.chapter), verse_start: vs, verse_end: Math.max(vs, ve), section_title: String(r.section_title ?? ""), text });
  }
  if (!sections.length) { missing.push(b.book); continue; }
  n += sections.length;
  write(join(OUT, `${b.book_id}.json`), { book_id: b.book_id, book: b.book, source: SOURCE, schema_version: 1, sections });
  books.push({ book_id: b.book_id, book: b.book });
}
db.close();
write(join(OUT, "meta.json"), { source_id: "john_calvin", source: SOURCE, schema_version: 1, license: "Public Domain", books });
console.log(`build-calvin: ${books.length} books, ${n} sections from ${src}`);
if (missing.length) console.log(`build-calvin: no Calvin for: ${missing.join(", ")}`);
