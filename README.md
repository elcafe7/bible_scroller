<div align="center">

# Scroll

**Scroll is a leisurely Bible reading app.**
Let the Bible roll gently up your screen at the pace you choose.

### [⬇ Download for offline use](https://github.com/elcafe7/bible_scroller/releases/latest/download/bible_scroller-0.1.0.zip)

<sub>bible_scroller-0.1.0.zip · about 25 MB · free · <a href="https://github.com/elcafe7/bible_scroller/releases/latest">release page</a></sub>

[**Try it online**](https://apocalypse.press/scroll/) · [Word](https://apocalypse.press/word/) · [Verse](https://apocalypse.press/verse/)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<sub>A project of <a href="https://jesuspeoplesf.com">Jesus People SF</a> &amp; <a href="https://apocalypse.press">Apocalypse Press</a></sub>

<img src="readme-assets/scroll-phone.png" alt="Scroll on a phone: Psalm 23 in the Geneva Bible scrolling up the screen, verse by verse, fading in at the bottom and out at the top" width="300">

</div>

---

## What it is

Scroll shows the Bible one verse after another, slowly moving up the screen, so you can sit back and read without tapping or turning pages. Pick where to start, choose a speed, and let it roll.

- **Three Bibles:** Geneva Bible (1599), King James Version (1611 original), and King James Version (Oxford 1769). The Geneva and 1611 editions include the Apocrypha.
- **Commentary if you want it:** Matthew Henry or John Calvin, shown after the verses it covers.
- **Two ways to read:** a slow scroll up the screen, or a single line moving across it.
- **Your pace:** Very Slow, Slow, Medium, or Fast. Four text sizes. Light or dark.
- **Start anywhere:** choose a book, chapter, and verse. It reads to the end of the book, then starts again.
- **Stays awake:** your screen stays on while it scrolls (where your browser allows it).

## Try it online

Open **[apocalypse.press/scroll](https://apocalypse.press/scroll/)** in any browser. Nothing to install.

## Download for offline use

Want to read without the internet, or without distractions? Download Scroll once and keep it.

1. **Download** [bible_scroller-0.1.0.zip](https://github.com/elcafe7/bible_scroller/releases/latest/download/bible_scroller-0.1.0.zip) (about 25 MB).
2. **Unzip it.** You get one folder called `bible_scroller`.
3. **Open `index.html`** inside that folder by double-clicking it. It opens in Chrome, Edge, Safari, or Firefox.
4. **That's it.** It works with no internet connection. Keep `index.html` in the folder with its `assets` and `data` folders.

Your settings are saved in your browser on your own device. No account, no sign-up.

**On a phone?** The easiest way is to use [apocalypse.press/scroll](https://apocalypse.press/scroll/) online. You can save it to your home screen from your browser's Share or menu button, like any web page.

<p align="center">
  <img src="readme-assets/scroll-welcome.png" alt="The Scroll setup screen with the first-visit welcome card: Scroll is a leisurely bible reading app; add commentary from Matthew Henry or John Calvin; take Scroll offline" width="420">
</p>

## How to use it

1. Tap the passage box to choose a Bible, book, chapter, and verse.
2. Pick commentary (or none), text size, speed, scroll or ticker, and light or dark.
3. Press **Start**. The page goes full screen and the first verse rises from the bottom.
4. To stop, press **Esc** or **Space**, or double-tap the text. Press **Resume** to carry on where you left off, or **Restart** to begin the passage again.

| Action | How |
|---|---|
| Start, or carry on where you stopped | **Start** / **Resume** |
| Stop and go back to settings | **Esc**, **Space**, or double-tap the text |
| Begin the passage again | **Restart** |
| Choose a passage | Tap the passage box, then Bible, book, chapter, verse |

<p align="center">
  <img src="readme-assets/scroll-ticker.png" alt="Ticker mode: John 3:17 in the Geneva Bible moving across the screen on one line" width="720">
</p>

<p align="center">
  <img src="readme-assets/scroll-dark.png" alt="Dark theme: John Calvin's commentary on John 1 scrolling after the verses" width="600">
</p>

## Texts and commentary

Bible text: Geneva Bible (1599), King James Version (1611 original, with Apocrypha), King James Version (Oxford 1769).

Commentary: **Matthew Henry**, *Commentary on the Whole Bible*, and **John Calvin**'s commentaries. All public domain.

## More from us

- [Word](https://apocalypse.press/word/)
- [Verse](https://apocalypse.press/verse/)
- [Apocalypse Press](https://apocalypse.press) · [Jesus People SF](https://jesuspeoplesf.com)

## License

App code is under the [MIT License](LICENSE), Copyright (c) 2026 elcafe7.

---

## For developers

You only need this to change the app. To read, use the download above.

The app is TypeScript compiled to one plain JavaScript file. Rebuilding needs Node 22.13+ for the Vite build and the data export.

```bash
npm install
npm run build-data   # Lex SQLite (read-only) -> data/**/*.json; needs the Lex databases on this machine
npm run build        # tsc --noEmit + Vite -> dist/
npm test             # vitest
npm run pack         # -> bible_scroller-<version>.zip (data as data/**/*.json.js so it opens from file://)
npm run stage-web -- <out>/scroll /scroll/   # web copy (data as .json) + .htaccess for apocalypse.press/scroll/
```

- `data/` is generated and git-ignored. Without it, builds use the John 1 fixture. No `.db` files are ever committed or packed.
- Online, the app fetches `data/**/*.json`. Offline, each file ships as a small `.json.js` script so the page opens straight from disk in every browser.
- Checksums for the download: [SHA256SUMS](https://github.com/elcafe7/bible_scroller/releases/latest/download/SHA256SUMS).
- Spec: [`docs/specs/bible-scroller.md`](docs/specs/bible-scroller.md).
