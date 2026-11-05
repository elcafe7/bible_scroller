#!/usr/bin/env node
// Build-time only: Lex gen.db + matthew_henry.db -> data/geneva/** and data/henry/** (JSON).
// SQLite files are read read-only and never copied. No network access.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BOOKS } from "./books.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "data");
const LEX = "/home/box/.local/share/lex-cli/2.6.6/runtime-data";

function lexWorkspaceGen() {
  const hits = [];
  try {
    for (const d of readdirSync("/workspace")) {
      if (d.startsWith("lex-")) hits.push(`/workspace/${d}/runtime-data/bible_versions/gen.db`);
    }
  } catch {}
  return hits;
}

const GENEVA_CANDIDATES = [
  process.env.BIBLE_SCROLLER_GENEVA_DB,
  `${LEX}/bible_versions/gen.db`,
  ...lexWorkspaceGen(),
].filter(Boolean);
const HENRY_CANDIDATES = [
  process.env.BIBLE_SCROLLER_HENRY_DB,
  `${LEX}/commentaries/matthew_henry.db`,
  "/workspace/lex-geneva-word/runtime-data/commentaries/matthew_henry.db",
].filter(Boolean);

const genevaPath = GENEVA_CANDIDATES.find((p) => existsSync(p));
const henryPath = HENRY_CANDIDATES.find((p) => existsSync(p));
if (!genevaPath || !henryPath) {
  console.error("build-data: Lex source databases not found. Expected one of:");
  if (!genevaPath) for (const p of GENEVA_CANDIDATES) console.error(`  Geneva: ${p}`);
  if (!henryPath) for (const p of HENRY_CANDIDATES) console.error(`  Henry:  ${p}`);
  console.error("Set BIBLE_SCROLLER_GENEVA_DB / BIBLE_SCROLLER_HENRY_DB to override. fixtures/john1 is untouched.");
  process.exit(2);
}
console.log(`build-data: Geneva source ${genevaPath}`);
console.log(`build-data: Henry source  ${henryPath}`);

const GENEVA_SOURCE = "Geneva Bible (1599)";
const HENRY_SOURCE = "Matthew Henry's Commentary on the Whole Bible";
const write = (p, obj) => writeFileSync(p, JSON.stringify(obj) + "\n");

// Fresh output dirs (data/ only; fixtures/ never touched).
for (const sub of ["geneva", "henry"]) {
  rmSync(join(OUT, sub), { recursive: true, force: true });
  mkdirSync(join(OUT, sub), { recursive: true });
}

// ---- Geneva ----
const gen = new DatabaseSync(genevaPath, { readOnly: true });
const genRows = gen.prepare("SELECT reference, text FROM bible ORDER BY id").all();
const byAbbr = new Map();
let skippedNonCanon = 0;
const canonAbbr = new Set(BOOKS.map((b) => b.abbr));
for (const { reference, text } of genRows) {
  const parts = String(reference).split(":");
  if (parts.length !== 4) continue;
  const [, abbr, ch, vs] = parts;
  if (!canonAbbr.has(abbr)) { skippedNonCanon++; continue; } // apocrypha excluded in v1
  const chapter = Number(ch), verse = Number(vs);
  const t = String(text ?? "").trim();
  if (!Number.isInteger(chapter) || !Number.isInteger(verse) || chapter < 1 || verse < 1 || !t) continue;
  if (!byAbbr.has(abbr)) byAbbr.set(abbr, new Map());
  const chapters = byAbbr.get(abbr);
  if (!chapters.has(chapter)) chapters.set(chapter, []);
  chapters.get(chapter).push({ verse, text: t });
}
gen.close();

const metaBooks = [];
for (const b of BOOKS) {
  const chapters = byAbbr.get(b.abbr);
  if (!chapters) { console.error(`build-data: Geneva book missing: ${b.abbr}`); process.exit(1); }
  const chNums = [...chapters.keys()].sort((a, z) => a - z);
  const maxCh = chNums[chNums.length - 1];
  const verse_counts = [];
  const outChapters = [];
  for (let c = 1; c <= maxCh; c++) {
    const verses = (chapters.get(c) ?? []).sort((a, z) => a.verse - z.verse);
    verse_counts.push(verses.length ? verses[verses.length - 1].verse : 0);
    if (verses.length) outChapters.push({ chapter: c, verses });
  }
  write(join(OUT, "geneva", `${b.book_id}.json`), {
    book_id: b.book_id, book: b.book, source: GENEVA_SOURCE, schema_version: 1, chapters: outChapters,
  });
  metaBooks.push({ book_id: b.book_id, book: b.book, order: b.order, chapters: maxCh, verse_counts });
}
write(join(OUT, "geneva", "meta.json"), {
  edition_id: "geneva1599", edition_name: GENEVA_SOURCE, language: "en", schema_version: 1,
  license: "Public Domain", books: metaBooks,
});

// ---- Henry ----
const mh = new DatabaseSync(henryPath, { readOnly: true });
const stmt = mh.prepare(
  `SELECT chapter, section_order, section_title, verse_start, verse_end, content
     FROM commentary
    WHERE book = ? AND verse_start IS NOT NULL AND verse_end IS NOT NULL
    ORDER BY chapter, section_order`,
);
const henryBooks = [];
let henrySections = 0;
const henryMissing = [];
for (const b of BOOKS) {
  const rows = stmt.all(b.book);
  const seen = new Set();
  const sections = [];
  for (const r of rows) {
    const text = String(r.content ?? "").trim();
    if (!text) continue;
    const id = `mhc:${b.book}:${r.chapter}:${r.verse_start}-${r.verse_end}:${r.section_order}`;
    if (seen.has(id)) continue;
    seen.add(id);
    sections.push({
      id, chapter: Number(r.chapter), verse_start: Number(r.verse_start), verse_end: Number(r.verse_end),
      section_title: String(r.section_title ?? ""), text,
    });
  }
  if (!sections.length) { henryMissing.push(b.book); continue; }
  henrySections += sections.length;
  write(join(OUT, "henry", `${b.book_id}.json`), {
    book_id: b.book_id, book: b.book, source: HENRY_SOURCE, schema_version: 1, sections,
  });
  henryBooks.push({ book_id: b.book_id, book: b.book });
}
mh.close();
write(join(OUT, "henry", "meta.json"), {
  source_id: "matthew_henry", source: HENRY_SOURCE, schema_version: 1, license: "Public Domain", books: henryBooks,
});

const verses = metaBooks.reduce((n, b) => n + b.verse_counts.reduce((a, c) => a + c, 0), 0);
console.log(`build-data: geneva ${metaBooks.length} books, ~${verses} verses (apocrypha rows skipped: ${skippedNonCanon})`);
console.log(`build-data: henry ${henryBooks.length} books, ${henrySections} verse-scoped sections`);
if (henryMissing.length) console.log(`build-data: no Henry sections for: ${henryMissing.join(", ")}`);
