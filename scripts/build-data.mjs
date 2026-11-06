#!/usr/bin/env node
// Build-time only: Lex bible DBs + matthew_henry.db -> data/{geneva,kj16,kjv,henry}/** (JSON).
// SQLite files are read read-only and never copied. No network access.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BOOKS, EDITIONS } from "./books.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "data");
const LEX = "/home/box/.local/share/lex-cli/2.6.6/runtime-data";

function lexWorkspaceDbs(rel) {
  const hits = [];
  try {
    for (const d of readdirSync("/workspace")) {
      if (d.startsWith("lex-")) hits.push(`/workspace/${d}/runtime-data/${rel}`);
    }
  } catch {}
  return hits;
}

function findDb(envKey, rel) {
  const cands = [
    process.env[envKey],
    `${LEX}/${rel}`,
    ...lexWorkspaceDbs(rel),
  ].filter(Boolean);
  return cands.find((p) => existsSync(p));
}

const HENRY_CANDIDATES = [
  process.env.BIBLE_SCROLLER_HENRY_DB,
  `${LEX}/commentaries/matthew_henry.db`,
  "/workspace/lex-geneva-word/runtime-data/commentaries/matthew_henry.db",
].filter(Boolean);
const henryPath = HENRY_CANDIDATES.find((p) => existsSync(p));

const HENRY_SOURCE = "Matthew Henry's Commentary on the Whole Bible";
const write = (p, obj) => writeFileSync(p, JSON.stringify(obj) + "\n");

function buildEdition(ed) {
  const dbPath = findDb(ed.dbEnv, ed.dbRel);
  if (!dbPath) {
    console.error(`build-data: ${ed.id} DB not found. Tried env ${ed.dbEnv} and Lex paths for ${ed.dbRel}.`);
    process.exit(2);
  }
  console.log(`build-data: ${ed.id} source ${dbPath}`);

  const dir = join(OUT, ed.dir);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db.prepare("SELECT reference, text FROM bible ORDER BY id").all();
  const byKey = new Map();
  let skipped = 0;
  const want = new Set(ed.books.map((b) => b.dbName));
  for (const { reference, text } of rows) {
    const parts = String(reference).split(":");
    if (parts.length !== 4) continue;
    const [, key, ch, vs] = parts;
    if (!want.has(key)) { skipped++; continue; }
    const chapter = Number(ch), verse = Number(vs);
    const t = String(text ?? "").trim();
    if (!Number.isInteger(chapter) || !Number.isInteger(verse) || chapter < 1 || verse < 1 || !t) continue;
    if (!byKey.has(key)) byKey.set(key, new Map());
    const chapters = byKey.get(key);
    if (!chapters.has(chapter)) chapters.set(chapter, []);
    chapters.get(chapter).push({ verse, text: t });
  }
  db.close();

  const metaBooks = [];
  for (const b of ed.books) {
    const chapters = byKey.get(b.dbName);
    if (!chapters) {
      console.error(`build-data: ${ed.id} book missing: ${b.dbName} (${b.book_id})`);
      process.exit(1);
    }
    const chNums = [...chapters.keys()].sort((a, z) => a - z);
    const maxCh = chNums[chNums.length - 1];
    const verse_counts = [];
    const outChapters = [];
    for (let c = 1; c <= maxCh; c++) {
      const verses = (chapters.get(c) ?? []).sort((a, z) => a.verse - z.verse);
      verse_counts.push(verses.length ? verses[verses.length - 1].verse : 0);
      if (verses.length) outChapters.push({ chapter: c, verses });
    }
    write(join(dir, `${b.book_id}.json`), {
      book_id: b.book_id, book: b.book, source: ed.name, schema_version: 1, chapters: outChapters,
    });
    metaBooks.push({ book_id: b.book_id, book: b.book, order: b.order, chapters: maxCh, verse_counts });
  }
  write(join(dir, "meta.json"), {
    edition_id: ed.id, edition_name: ed.name, language: "en", schema_version: 1,
    license: "Public Domain", books: metaBooks,
  });
  const verses = metaBooks.reduce((n, b) => n + b.verse_counts.reduce((a, c) => a + c, 0), 0);
  const apoc = metaBooks.filter((b) => b.order > 66).length;
  console.log(`build-data: ${ed.dir} ${metaBooks.length} books (${apoc} apocrypha), ~${verses} verses (unlisted rows skipped: ${skipped})`);
}

// ---- Bible editions ----
for (const ed of EDITIONS) buildEdition(ed);

// ---- Henry (Protestant 66 only; Apocrypha has no Henry) ----
if (!henryPath) {
  console.error("build-data: Henry DB not found.");
  for (const p of HENRY_CANDIDATES) console.error(`  Henry: ${p}`);
  process.exit(2);
}
console.log(`build-data: Henry source  ${henryPath}`);
rmSync(join(OUT, "henry"), { recursive: true, force: true });
mkdirSync(join(OUT, "henry"), { recursive: true });

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
console.log(`build-data: henry ${henryBooks.length} books, ${henrySections} verse-scoped sections`);
if (henryMissing.length) console.log(`build-data: no Henry sections for: ${henryMissing.join(", ")}`);
