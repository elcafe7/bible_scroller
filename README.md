# bible_scroller

Private ambient Bible verse scroller: pick a Geneva 1599 book or passage, scroll it continuously, optionally interchange each verse with Matthew Henry's note. Ships as a downloadable offline zip (TypeScript/JS client, no PHP, no server-only features), in the same spirit as Word and Verse.

**Spec (source of truth):** [`docs/specs/bible-scroller.md`](docs/specs/bible-scroller.md)

## Requirements (author machine only)

- Node 22.13+ (uses the built-in `node:sqlite` to read Lex databases at build time)
- Lex CLI data on this machine for the full canon (see below). The shipped zip needs no Node, PHP, or server.

```bash
npm install
```

## Build the data: `npm run build-data`

Reads the Lex SQLite files **read-only** and writes consistent JSON to `data/geneva/**` and `data/henry/**` (Protestant 66 books; Geneva apocrypha rows are skipped; Henry chapter overviews are skipped).

Sources, first hit wins (the script prints which it used):

| Role | Path |
|---|---|
| Geneva | `$BIBLE_SCROLLER_GENEVA_DB`, then `~/.local/share/lex-cli/2.6.6/runtime-data/bible_versions/gen.db`, then `/workspace/lex-*/runtime-data/bible_versions/gen.db` |
| Henry | `$BIBLE_SCROLLER_HENRY_DB`, then `~/.local/share/lex-cli/2.6.6/runtime-data/commentaries/matthew_henry.db`, then `/workspace/lex-geneva-word/runtime-data/commentaries/matthew_henry.db` |

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
2. **Local static server fallback:** Chrome, Edge, and Firefox block JSON loads from `file://`. If the page says "Bible data missing or unreadable", serve the folder (still fully offline):

   ```bash
   cd bible_scroller
   python3 -m http.server 8000   # then open http://localhost:8000/
   # or: npx serve .
   ```

## Using the scroller

- **Passage:** pick a **Sample** (Genesis 1:1, Psalm 23:1, John 1:1, Romans 8:1, …) or set Start book + chapter:verse. Scroll continues through the Protestant 66-book canon and loops. Book menu is OT/NT only (no Apocrypha). First run starts on John 1:1.
- **Settings vs scroll:** Settings is a normal page (not an overlay). **Start** / **Resume** opens a full-screen scroll (Fullscreen API when the browser allows it, otherwise a CSS full-viewport fallback). **Esc**, **Space**, or a **double-tap** on the passage returns to settings and freezes the place so Resume can continue. **Restart** resets to the start of the range and enters scroll again.
- **Mode:** Vertical (default) is the full-screen ambient column. Ticker is a one-line horizontal marquee — one verse (or Henry block) at a time, looping the chosen range.
- **Speed:** Slow, Medium (default), Fast. Vertical is about 48 / 80 / 130 lines a minute (Fast is brisk continuous reading). Horizontal ticker uses a separate character pace; both stay far slower than a stock ticker.
- **Henry toggle:** "Matthew Henry between verses" is off by default. When on, Henry's note follows the last verse it covers in your range (each section shows once per loop), then the next verse continues. Verses with no Henry section just continue. If a book has no Henry file (Henry has no Psalms in the Lex data), a one-time "Commentary data not available." notice shows and verses keep scrolling.
- Settings are saved in this browser's localStorage (`bible_scroller.v1`) only. The app still runs if storage is blocked.

## Not included

- **No poeta deploy.** Nothing here publishes to poeta.icu. A live demo waits on Nate's yes.
- No PHP, no remote APIs, no password gate, no Lex CLI / Lex Web changes.
- Do not put secrets, tokens, or Lex SQLite databases in this repo; ship rebuilt JSON only.
