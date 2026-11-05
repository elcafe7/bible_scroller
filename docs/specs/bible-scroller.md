# Bible scroller — app specsheet

## 1. Outcome

A stranger can unpack a zip, open the app offline, pick a Geneva 1599 book or passage, watch that range scroll continuously full-screen, and (optionally) toggle verse → Matthew Henry → next verse interchange; the chrome hides after start and returns on tap.

## 2. Decisions already made

Do not revisit.

- **Product:** Ambient downloadable Bible verse scroller (not a ticker clone, not Lex Web).
- **Default edition:** Geneva 1599 only in v1.
- **Henry:** Off by default. Optional toggle enables verse → matching Henry note → next verse interchange. If a verse has no Henry section, show the verse only and continue (do not invent commentary).
- **Range:** User picks a book or passage; the scroller **loops that range** (not whole-Bible default).
- **Access / ship shape:** First deliverable is this private repo + downloadable zip. Live demo later may sit on poeta.icu with **no password**. No poeta deploy until Nate says yes.
- **UI:** Full-screen ambient; pick range then hide chrome; controls on tap; **scroll-only** (no list mode); careful typography; reading-paced speeds (not ticker flash). At least three named speeds (e.g. slow / medium / fast), all slower than a stock ticker.
- **Stack:** TypeScript/JS client from day one. Static assets only. Runs from `file://` or a local static server after unzip. **No PHP.** No server-exclusive APIs.
- **Data at runtime:** Rebuilt **consistent JSON** for Bible and Henry. One client loader. Lex SQLite (if used) is **build-time only**, never shipped in the zip.
- **Repo:** `elcafe7/bible_scroller` (private). Spec path: `docs/specs/bible-scroller.md`.
- **Offline zip:** Same downloadability intent as Word/Verse: one zip unpacks to a folder with `index.html` + assets + `data/` and works without a network.

## 3. Non-goals

- No Lex CLI or Lex Web code changes in v1 (JSON export may live under this repo's `scripts/` only).
- No Strong's, no multi-edition switcher in v1 (Geneva only).
- No PHP, no Alpaca, no news/ticker feeds, no X/xAI.
- No password gate in v1.
- No poeta path creation or deploy until Nate's named yes.
- No Poole / Gill in this app v1 (tracked on Lex CLI #18 / Lex Web #5).
- No inventing missing Bible or Henry text. Stub fixture (John 1) only for client development when full rebuild is not run.
- No secrets, tokens, `.env`, Lex DB files, or `/etc/poeta-*` content in git or the zip.

## 4. Invariants and failure

**Invariants (must never happen)**

- Never ship or commit Lex `.db` files, API keys, gate credentials, or env secrets.
- Never call a remote API for verse or commentary text at runtime.
- Never invent verse text or Henry notes when data is missing.
- Never default-scroll the whole Bible; a range must be chosen (or a documented first-run default **within** one short book/passage fixture until the user picks).
- Never show Henry content when the Henry toggle is off.
- Never depend on PHP, Node, or any server process in the shipped zip (build tools may use Node on the author machine only).
- Never write user preferences to a remote store; localStorage (or equivalent) only, and the app must still run if storage is unavailable.

**Failure behavior**

| Dependency | When missing / broken | Behavior |
|---|---|---|
| `data/geneva/meta.json` | Missing or invalid JSON | Show a single full-screen error: "Bible data missing or unreadable." No blank infinite scroll. Exit controls still work. |
| Selected book JSON | File missing | Error: "Book data not found: \<id\>." Do not start scroll. |
| Verse in range | Gap in chapter/verse sequence | Skip gaps; do not pad with invented text. Log once to console. |
| Henry toggle on, book JSON missing | `data/henry/<book>.json` absent | Keep scrolling verses; treat every verse as "no note." Show a one-time non-blocking notice: "Commentary data not available." |
| Henry toggle on, verse has no matching section | No row covers that verse | Show verse only; continue. Do not stall the loop. |
| `file://` restrictions | Some browsers block module loads | Document "open via local static server" in README; prefer relative paths and a zip that also works under `npx serve` / Python `http.server`. Prefer a build that inlines or uses relative assets so `file://` works where the browser allows. |
| localStorage quota / private mode | Throws | Continue with in-memory defaults; do not crash. |
| Build script cannot find Lex DBs | Paths absent on the machine | Exit non-zero with the expected paths printed; leave `fixtures/john1/` usable for client work. Do not download from the network in v1. |

## 5. Data model

All shipped text is JSON under `data/`. Encoding UTF-8. No trailing commentary DB paths in shipped files.

### Shared field conventions

| Field | Type | Notes |
|---|---|---|
| `book` | string | Canonical English name, e.g. `"John"`. Same spelling in geneva and henry. |
| `book_id` | string | Stable slug, lowercase, e.g. `"john"`. Filename stem. |
| `chapter` | integer ≥ 1 | |
| `verse` / `verse_start` / `verse_end` | integer ≥ 1 or null | Inclusive range when both set. |
| `text` | string | Plain display text (preserve historical spelling). |
| `source` | string | Human-readable provenance, e.g. `"Geneva Bible (1599)"` or `"Matthew Henry's Commentary on the Whole Bible"`. |

### `data/geneva/meta.json`

```json
{
  "edition_id": "geneva1599",
  "edition_name": "Geneva Bible (1599)",
  "language": "en",
  "schema_version": 1,
  "license": "Public Domain",
  "books": [
    {
      "book_id": "john",
      "book": "John",
      "order": 43,
      "chapters": 21,
      "verse_counts": [51, 25]
    }
  ]
}
```

- `books`: array, required, non-empty in a full build; stub may list only John.
- `verse_counts`: array of ints, length = `chapters`; `verse_counts[i]` = verse count of chapter `i+1`. Required for range validation.
- No null books. Unknown optional fields ignored by the client.

### `data/geneva/<book_id>.json`

```json
{
  "book_id": "john",
  "book": "John",
  "source": "Geneva Bible (1599)",
  "schema_version": 1,
  "chapters": [
    {
      "chapter": 1,
      "verses": [
        { "verse": 1, "text": "In the beginning was the Worde, and the Worde was with God, and that Worde was God." }
      ]
    }
  ]
}
```

- `chapters[].verses[].verse`: required int; `text`: required non-empty string.
- Do not include empty verse placeholders for missing numbers; client skips gaps.
- One file per book. Apocrypha out of scope for v1 unless already present in the chosen Geneva build **and** explicitly enabled later; v1 canon Protestant 66 only unless Nate expands scope.

### `data/henry/meta.json`

```json
{
  "source_id": "matthew_henry",
  "source": "Matthew Henry's Commentary on the Whole Bible",
  "schema_version": 1,
  "license": "Public Domain",
  "books": [{ "book_id": "john", "book": "John" }]
}
```

### `data/henry/<book_id>.json`

```json
{
  "book_id": "john",
  "book": "John",
  "source": "Matthew Henry's Commentary on the Whole Bible",
  "schema_version": 1,
  "sections": [
    {
      "id": "mhc:John:1:1-5",
      "chapter": 1,
      "verse_start": 1,
      "verse_end": 5,
      "section_title": "",
      "text": "Plain text for scroll display...",
      "markdown": "Optional markdown twin; client may use text only in v1."
    }
  ]
}
```

- `verse_start` / `verse_end`: nullable. **Chapter overviews** (both null) are **not** shown in the verse↔Henry interchange loop. They may be omitted from export or kept for a future mode; the scroller only matches sections where `verse_start` and `verse_end` are ints and `verse_start <= V <= verse_end`.
- If multiple sections cover the same verse, use the first in `sections` order (stable export order = Lex `section_order` ascending).
- `text` required non-empty for exported verse-scoped sections; `markdown` nullable (string or omit).
- `id` required unique string within the file.

### Fixture (always in repo)

`fixtures/john1/` mirrors the same shapes for **John chapter 1 only** (subset of verses + a few Henry sections), so the client can develop without a full rebuild. Copy or symlink into `data/` during local client work when full data is absent.

### Build-time sources (author machine; not shipped)

Preferred paths (first hit wins; script prints which it used):

| Role | Path |
|---|---|
| Geneva Lex DB | `/home/box/.local/share/lex-cli/2.6.6/runtime-data/bible_versions/gen.db` (fallback: any `.../runtime-data/bible_versions/gen.db` under `/workspace/lex-*`) |
| Geneva JSON rebuild | `/workspace/geneva-rebuild/Geneva1599.json` |
| Matthew Henry Lex DB | `/home/box/.local/share/lex-cli/2.6.6/runtime-data/commentaries/matthew_henry.db` (fallback: `/workspace/lex-geneva-word/runtime-data/commentaries/matthew_henry.db`) |

Lex `gen.db` `bible.reference` form: `gen:<BookAbbr>:<chapter>:<verse>` with `text`. Henry `commentary` columns: `book`, `chapter`, `verse_start`, `verse_end`, `section_order`, `section_title`, `content`, `markdown`, `source`. Map book names to `book_id` slugs consistently (lowercase, spaces to underscores only if needed; prefer single-token Protestant names).

**Do not invent full Bible text.** Full `data/geneva/` and `data/henry/` are produced by `scripts/build-data.*` when sources exist; otherwise keep fixtures only.

## 6. Interfaces

### User → UI (sync)

| Action | Input | Result |
|---|---|---|
| Pick range | book_id + optional chapter/verse start–end | Validates against `meta` + book JSON; stores selection; starts scroll loop |
| Toggle Henry | boolean | Immediate; next item in loop respects new mode |
| Change speed | enum `slow` \| `medium` \| `fast` | Updates pixels/sec (or equivalent); no reload |
| Tap / key | pointer or keyboard | Shows chrome if hidden; Hide after idle timeout (~3s) when playing |
| Pause / resume | control | Freezes or continues scroll position |

No network requests. No auth. Idempotent: re-applying the same range/speed/Henry flag does not duplicate DOM nodes or restart from zero unless the user hits Restart.

### Loader API (in-process)

```ts
loadGenevaMeta(): Promise<GenevaMeta>
loadGenevaBook(bookId: string): Promise<GenevaBook>
loadHenryMeta(): Promise<HenryMeta | null>  // null if file missing
loadHenryBook(bookId: string): Promise<HenryBook | null>
resolveRange(meta, book, range): VerseRef[]  // ordered loop sequence
henryForVerse(henryBook, verseRef): HenrySection | null
```

All loaders: `fetch` relative JSON (or static import in bundled build). Failures throw typed errors consumed by the UI failure table above.

### Scroll loop item

Discriminated union:

```ts
{ kind: "verse"; book: string; chapter: number; verse: number; text: string }
{ kind: "henry"; book: string; chapter: number; verse_start: number; verse_end: number; text: string; for_verse: number }
```

When Henry is on: for each verse V in range, emit verse item then, if `henryForVerse` non-null, emit henry item. Then advance. Loop when the range is exhausted.

### Preferences (localStorage key `bible_scroller.v1`)

```json
{
  "range": { "book_id": "john", "start": { "chapter": 1, "verse": 1 }, "end": { "chapter": 1, "verse": 51 } },
  "henry": false,
  "speed": "medium"
}
```

Corrupt JSON → ignore and use first-run defaults (John 1 fixture range, henry false, medium).

### Zip artifact

- Build output: `dist/` (static) → packaged as `bible_scroller-<version>.zip` with top-level folder `bible_scroller/` containing `index.html`, assets, `data/`.
- Version: `0.1.0` until Nate bumps.

## 7. Surfaces

**May touch**

- `docs/specs/bible-scroller.md` (this file)
- `README.md`, `.gitignore`
- `package.json`, `tsconfig.json`, `vite.config.ts` (or equivalent static bundler)
- `index.html`, `src/**` (UI, loader, scroll, prefs)
- `scripts/build-data.ts` (or `.mjs`) — Lex/Geneva → JSON
- `scripts/pack-zip.mjs` — zip `dist/`
- `data/geneva/**`, `data/henry/**` — generated JSON only (no `.db`)
- `fixtures/john1/**` — small committed stub
- `public/**` — static assets (fonts, icons) if needed
- GitHub Issues on this repo for product bugs/features

**Must not touch**

- Lex CLI / Lex Web repositories or their release pipelines
- Poeta VPS paths, nginx, cPanel, gate.php, `/etc/poeta-*`
- `/news/`, `/ticker/`, Word, Verse production trees for deploy
- Committing `*.db`, `.env`, tokens, cookies, session files
- Adding PHP, server routes, or paid API clients

## 8. Tasks

Ordered. Each task: one outcome. On first failure: **stop**, report the command, exit code, and last lines; do not install a substitute stack, change the schema, skip verification, or invent a new approach.

### Task 1 — Repo skeleton

**Assume:** Empty `main` with this spec, README, `.gitignore`, fixtures already present or add them here.

**Steps:** Add `package.json` (name `bible_scroller`, private true), TypeScript + Vite (or esbuild) browser app entry `index.html` → `src/main.ts`. Placeholder heading "Bible scroller". No data wiring yet.

**Verify:**

```bash
cd /workspace/bible_scroller && npm install && npm run build
```

**Must show:** exit 0; `dist/index.html` exists.

**First-failure rule:** stop; report command, exit code, last lines; do not switch bundlers.

### Task 2 — Fixture data in place

**Steps:** Ensure `fixtures/john1/geneva/meta.json`, `fixtures/john1/geneva/john.json`, `fixtures/john1/henry/meta.json`, `fixtures/john1/henry/john.json` match §5 shapes with real public-domain John 1 Geneva text (from gen.db or Geneva1599.json) and at least two verse-scoped Henry sections. Document in fixture README that full data comes from Task 3.

**Verify:**

```bash
python3 -c "import json,sys; from pathlib import Path
root=Path('fixtures/john1')
for p in [root/'geneva/meta.json', root/'geneva/john.json', root/'henry/meta.json', root/'henry/john.json']:
  json.load(p.open()); print('ok', p)
j=json.load(open(root/'geneva/john.json'))
assert j['book_id']=='john' and j['chapters'][0]['chapter']==1
assert len(j['chapters'][0]['verses'])>=10
h=json.load(open(root/'henry/john.json'))
assert any(s.get('verse_start') for s in h['sections'])
print('fixture ok')"
```

**Must show:** `fixture ok` and exit 0.

### Task 3 — Build script Lex/Geneva → `data/`

**Steps:** Implement `npm run build-data` → writes full `data/geneva/**` and `data/henry/**` from the paths in §5 when present. Protestant 66 books. Skip Henry sections with null verse range (or write them but client ignores). Map references stably. If sources missing, exit 2 and print expected paths; do not wipe `fixtures/`.

**Verify:**

```bash
npm run build-data && python3 -c "import json; m=json.load(open('data/geneva/meta.json')); assert len(m['books'])>=66; print('books',len(m['books'])); j=json.load(open('data/geneva/john.json')); print('john ch1 v1', j['chapters'][0]['verses'][0]['text'][:40])"
```

**Must show:** `books` ≥ 66; John 1:1 text prefix printed; exit 0. If sources absent on CI: exit 2 is acceptable only when documented; on the box with Lex installed, exit 0 is required.

### Task 4 — Loader + range resolution

**Steps:** Implement loader module and unit tests (node or vitest): load fixture or `data/`; `resolveRange` for whole book, single chapter, and verse span; `henryForVerse` match rules from §5–6.

**Verify:**

```bash
npm test
```

**Must show:** all tests pass; at least one test asserts Henry-off sequence length equals verse count; Henry-on sequence length equals verses + matched notes for the fixture.

### Task 5 — Ambient UI shell

**Steps:** Full-screen layout; range picker (book + optional start/end); Henry toggle default off; speed control; start → hide chrome; tap → show chrome; scroll-only rendering of the loop items with reading-paced CSS animation or rAF scroll. Typography: readable serif or careful system stack; verse reference subtly labeled; Henry visually distinct (e.g. quieter weight or label "Matthew Henry") but still ambient.

**Verify:**

```bash
npm run build && npx --yes serve dist -l 4173 &
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/
kill %1 2>/dev/null || true
```

**Must show:** HTTP 200. Manual check (human or Playwright later): chrome hides after start.

**First-failure rule:** do not add list mode or ticker-style marquee flash to "fix" speed.

### Task 6 — Preferences + failure UI

**Steps:** Persist prefs; handle missing JSON per §4; Henry data missing while toggle on → notice + verses continue.

**Verify:** `npm test` includes corrupt localStorage and missing henry file cases; `npm run build` exit 0.

### Task 7 — Zip pack

**Steps:** `npm run pack` builds then zips `dist/` + needed `data/` into `bible_scroller-0.1.0.zip` with top-level folder. Zip must not contain `node_modules`, `.git`, `*.db`, or `.env`.

**Verify:**

```bash
npm run pack && unzip -l bible_scroller-0.1.0.zip | head -40 && unzip -l bible_scroller-0.1.0.zip | grep -E '\.db|\.env|node_modules' && echo 'FORBIDDEN FOUND' && exit 1 || echo 'zip clean'
```

**Must show:** `index.html` and `data/geneva/meta.json` (or fixture-copied data) listed; `zip clean`.

### Task 8 — README usage

**Steps:** README documents: how to `npm run build-data`, `npm run pack`, unzip and open, local static server fallback, Henry toggle, that poeta deploy is not included.

**Verify:** `test -f README.md && grep -q 'build-data' README.md && grep -q 'pack' README.md`

## 9. Done when

Observable checks only:

1. `npm run build` exits 0.
2. `npm test` exits 0.
3. `fixtures/john1` validates with the Task 2 python check.
4. On a machine with Lex gen.db + matthew_henry.db: `npm run build-data` exits 0 and `data/geneva/meta.json` has ≥ 66 books; `data/geneva/john.json` verse 1:1 text is non-empty; `data/henry/john.json` has ≥ 1 section with non-null `verse_start`.
5. `npm run pack` produces `bible_scroller-0.1.0.zip`; unzip listing includes `bible_scroller/index.html` and geneva meta; listing has no `.db` / `.env` / `node_modules`.
6. Diff / tree touches only allowed surfaces (§7); no Lex repo changes; no poeta deploy artifacts.
7. Default UI state: Henry toggle off; speed medium; no whole-Bible autoplay without a chosen range (first-run may preselect John 1 from fixture/meta).

## Open questions (do not block v1 skeleton)

None locked as blockers. Defer to Nate only if needed later:

1. Exact typeface (system stack vs bundled webfont in the zip).
2. Whether Protestant 66 excludes Geneva apocrypha rows present in gen.db (spec default: **exclude** apocrypha in v1).
