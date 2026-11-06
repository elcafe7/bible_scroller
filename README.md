# bible_scroller

Private ambient Bible verse scroller: pick a Geneva 1599, KJV 1611, or KJV Oxford 1769 passage, scroll it continuously (vertical or ticker), optionally followed by Matthew Henry or Calvin commentary. Ships as a downloadable offline zip (TypeScript/JS client, no PHP, no server-only features), in the same spirit as Word and Verse.

**Spec (source of truth):** [`docs/specs/bible-scroller.md`](docs/specs/bible-scroller.md)

## Requirements (author machine only)

- Node 22.13+ (uses the built-in `node:sqlite` to read Lex databases at build time)
- Lex CLI data on this machine for the full canon (see below). The shipped zip needs no Node, PHP, or server.

```bash
npm install
```

## Build the data: `npm run build-data`

Reads the Lex SQLite files **read-only** and writes consistent JSON to `data/geneva/**`, `data/kj16/**`, `data/kjv/**`, `data/henry/**`, and (via `build-calvin.mjs`) `data/calvin/**`. Geneva and KJ16 include Apocrypha from Lex; KJV stays Protestant 66. Henry chapter overviews are skipped.

Sources, first hit wins (the script prints which it used):

| Role | Path |
|---|---|
| Geneva | `$BIBLE_SCROLLER_GENEVA_DB`, then Lex `bible_versions/gen.db` |
| KJ16 | `$BIBLE_SCROLLER_KJ16_DB`, then Lex `bible_versions/kj16.db` |
| KJV | `$BIBLE_SCROLLER_KJV_DB`, then Lex `bible_versions/kjv.db` |
| Henry | `$BIBLE_SCROLLER_HENRY_DB`, then Lex `commentaries/matthew_henry.db` |

If neither is found it exits 2, prints the expected paths, and leaves `fixtures/john1/` alone. No network downloads.

`data/` is generated and git-ignored (about 39 MB of JSON). `*.db` files are never committed or packed. Without `data/`, builds fall back to the John 1 fixture in `fixtures/john1/`.

## Build, test, preview

```bash
npm run build      # type-check + Vite build to dist/ (copies data/ or the fixture into dist/data)
npm test           # vitest: loader, range resolution, Henry matching, prefs, failure cases
npx serve dist     # preview at the printed address
```

## Package the offline zip: `npm run pack`

```bash
npm run build-data   # once, for the full canon
npm run pack         # -> bible_scroller-0.1.0.zip
```

The zip unpacks to one `bible_scroller/` folder with `index.html`, `assets/`, `data/`, and a short `README.txt`. The packer refuses `.db`, `.env`, keys, `node_modules`, and `.git`.

## Open it (unzip and open)

1. Unzip `bible_scroller-0.1.0.zip` and open `bible_scroller/index.html`.
2. **Local static server fallback:** Firefox runs it from `file://`; Chrome and Edge block JSON loads from `file://`. If the page says "Bible data missing or unreadable", serve the folder (still fully offline):

   ```bash
   cd bible_scroller
   python3 -m http.server 8000   # then open http://localhost:8000/
   # or: npx serve .
   ```

## Using the scroller

- **Passage:** pick Start book + chapter:verse (OT / NT / Apocrypha groups). Scroll reads to the end of that book, then loops. Editions: **Geneva 1599** and **KJV 1611** (with Apocrypha), **KJV Oxford 1769** (Protestant 66 only, no Apocrypha group). First run starts on John 3:16 when available.
- **Settings vs scroll:** Settings is a normal page (not an overlay). **Start** / **Resume** opens a full-screen scroll (Fullscreen API when the browser allows it, otherwise a CSS full-viewport fallback). **Esc**, **Space**, or a **double-tap** on the passage returns to settings and freezes the place so Resume can continue. **Restart** resets to the start of the range and enters scroll again.
- **Mode:** Vertical (default) is the full-screen ambient column. Ticker is a horizontal marquee — verses on line 1, then commentary on line 2, one item at a time, looping the chosen range.
- **Wake lock:** the screen stays awake while scrolling where the browser supports it.
- **Speed:** Very Slow, Slow, Medium (default), Fast. Vertical is 30 / 48 / 80 / 130 lines a minute; the ticker uses 300 / 480 / 900 / 1620 characters a minute.
- **Text size:** S / M / L / XL. In ticker mode the line is a share of viewport height (3 / 4.25 / 5.75 / 7.5 vh).
- **Commentary:** No commentary (default), Matthew Henry, or Calvin. A note follows the last verse it covers in your range (each section once per loop); in ticker mode commentary runs on a second line after the verses. If the chosen commentary has no file for a book, the settings page says so and verses keep scrolling.
- **Welcome card:** first visit shows a short welcome card; Continue, ✕, Esc, or a backdrop click dismisses it and stores `bible_scroller.welcome-seen=1` so it does not show again in that browser.
- Settings are saved in this browser's localStorage (`bible_scroller.v1`) only. The app still runs if storage is blocked.

## Stage the public web copy: `npm run stage-web`

```bash
npm run stage-web -- /path/to/out/scroll /scroll/
```

Builds, then writes `index.html`, `assets/`, `data/`, and an `.htaccess` for a static app under `/scroll/` (apocalypse.press). Normal caching: hashed bundles immutable for a year, data JSON one day, `index.html` revalidates. A CSP allows only same-origin plus the inline theme script by hash (and Cloudflare Insights). No PHP. Deploying is a separate, approved step.

## Quality checks

- `npm run build` runs `tsc --noEmit` before Vite; `npm test` runs vitest (including a multi-book smoke across OT / NT / Apocrypha and edition switches when `data/` is present).
- The built `dist/index.html` and CSS are checked with the W3C Nu HTML Checker and the W3C CSS Validator (profile css3svg): 0 errors.
- Release zips are attached to GitHub releases with a `SHA256SUMS` file; the zip itself is git-ignored.

## Not included

- **No poeta deploy.** Nothing here publishes to poeta.icu. A live demo waits on Nate's yes.
- No PHP, no remote APIs, no password gate, no Lex CLI / Lex Web changes.
- Do not put secrets, tokens, or Lex SQLite databases in this repo; ship rebuilt JSON only.
