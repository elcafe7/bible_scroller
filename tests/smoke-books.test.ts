/**
 * @vitest-environment happy-dom
 *
 * Multi-book smoke against the real generated data/ (skipped when data/ is absent):
 * OT, NT, Geneva Apocrypha, KJ16-only Apocrypha, edition switches, KJV without an
 * Apocrypha group, plus a full-app boot that drives the picker and Start in the DOM.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createLoader } from "../src/loader";
import { canonBooks, groupBooks, resolveFromStart } from "../src/canon";
import { LoopCursor } from "../src/sequence";
import { renderItem } from "../src/scroller";
import { fsFetch } from "./helpers";

const ROOT = resolve(import.meta.dirname, "..");
const DATA = resolve(ROOT, "data");
const hasFull = ["geneva", "kj16", "kjv", "henry", "calvin"].every((d) => existsSync(resolve(DATA, d, "meta.json")));

type Case = { dir: string; book_id: string; book: string; chapter: number; verse: number; needle: RegExp };
const CASES: Case[] = [
  { dir: "geneva", book_id: "genesis", book: "Genesis", chapter: 1, verse: 1, needle: /beginning/i },
  { dir: "geneva", book_id: "psalms", book: "Psalms", chapter: 23, verse: 1, needle: /shepheard/i },
  { dir: "geneva", book_id: "john", book: "John", chapter: 3, verse: 16, needle: /world/i },
  { dir: "geneva", book_id: "revelation", book: "Revelation", chapter: 22, verse: 21, needle: /grace/i },
  { dir: "geneva", book_id: "tobit", book: "Tobit", chapter: 1, verse: 1, needle: /tobit/i },
  { dir: "geneva", book_id: "wisdom", book: "Wisdom of Solomon", chapter: 1, verse: 1, needle: /righteous|judge/i },
  { dir: "kj16", book_id: "genesis", book: "Genesis", chapter: 1, verse: 1, needle: /beginning/i },
  { dir: "kj16", book_id: "psalms", book: "Psalms", chapter: 23, verse: 1, needle: /shepheard|shepherd/i },
  { dir: "kj16", book_id: "1esdras", book: "1 Esdras", chapter: 1, verse: 1, needle: /\w{3,}/ },
  { dir: "kj16", book_id: "susanna", book: "Susanna", chapter: 1, verse: 1, needle: /babylon/i },
  { dir: "kjv", book_id: "john", book: "John", chapter: 3, verse: 16, needle: /so loved the world/i },
  { dir: "kjv", book_id: "revelation", book: "Revelation", chapter: 22, verse: 21, needle: /grace/i },
];

describe.skipIf(!hasFull)("smoke: books across OT / NT / Apocrypha and editions", () => {
  const loader = createLoader({ fetch: fsFetch(DATA) });

  for (const c of CASES) {
    it(`${c.dir}: ${c.book} ${c.chapter}:${c.verse} resolves, renders, and loops`, async () => {
      const meta = await loader.loadEditionMeta(c.dir);
      const book = await loader.loadEditionBook(c.dir, c.book_id);
      const verses = resolveFromStart(meta, new Map([[c.book_id, book]]), { book_id: c.book_id, chapter: c.chapter, verse: c.verse });
      expect(verses.length).toBeGreaterThan(0);
      expect(verses[0]).toMatchObject({ book_id: c.book_id, chapter: c.chapter, verse: c.verse });
      expect(verses[0]!.text).toMatch(c.needle);
      // Never runs past the chosen book.
      expect(verses.every((v) => v.book_id === c.book_id)).toBe(true);
      const cur = new LoopCursor(verses, null);
      const first = cur.next(false)!;
      expect(first.kind).toBe("verse");
      for (const mode of ["vertical", "horizontal"] as const) {
        const n = renderItem(first, mode);
        expect(n.textContent).toContain(`${c.book} ${c.chapter}:${c.verse}`);
      }
      // Loop back to start after the last verse.
      for (let i = 1; i < verses.length; i++) cur.next(false);
      expect(cur.next(false)).toMatchObject({ kind: "verse", chapter: c.chapter, verse: c.verse });
    });
  }

  it("Apocrypha groups: Geneva 7 books, KJ16 14 (incl. 1 Esdras, Susanna), KJV none", async () => {
    const g = groupBooks(canonBooks(await loader.loadEditionMeta("geneva")));
    const k16 = groupBooks(canonBooks(await loader.loadEditionMeta("kj16")));
    const kjv = groupBooks(canonBooks(await loader.loadEditionMeta("kjv")));
    expect(g.apocrypha.map((b) => b.book_id)).toEqual(["tobit", "judith", "wisdom", "sirach", "baruch", "1maccabees", "2maccabees"]);
    expect(k16.apocrypha).toHaveLength(14);
    expect(k16.apocrypha.map((b) => b.book_id)).toEqual(expect.arrayContaining(["1esdras", "susanna", "tobit"]));
    expect(g.apocrypha.map((b) => b.book_id)).not.toContain("1esdras");
    expect(g.apocrypha.map((b) => b.book_id)).not.toContain("susanna");
    expect(kjv.apocrypha).toHaveLength(0);
    expect(kjv.ot).toHaveLength(39);
    expect(kjv.nt).toHaveLength(27);
  });

  it("commentary data loads for Henry and Calvin on John", async () => {
    for (const c of ["henry", "calvin"] as const) {
      const b = await loader.loadCommentaryBook(c, "john");
      expect(b?.sections.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!hasFull)("smoke: full app boot in the DOM (picker + edition switch + Start)", () => {
  it("drives picker across editions and books, then starts a scroll", async () => {
    const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
    const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!.replace(/<script[\s\S]*?<\/script>/g, "");
    document.body.className = "state-stopped mode-vertical";
    document.body.innerHTML = bodyHtml;
    localStorage.clear();
    const ff = fsFetch(DATA);
    vi.stubGlobal("fetch", (url: string) => ff(String(url)));
    await import("../src/main");
    const label = () => document.getElementById("passage-label")!.textContent;
    await vi.waitFor(() => expect(document.getElementById("boot")).toBeNull(), { timeout: 5000 });
    expect(label()).toBe("John 3:16 · Geneva 1599");

    // First visit: welcome card is open with the locked copy; Continue dismisses and remembers.
    const dlg = document.getElementById("welcome") as HTMLDialogElement;
    expect(dlg.open).toBe(true);
    expect([...dlg.querySelectorAll("h2, p")].map((n) => n.textContent)).toEqual([
      "Scroll",
      "Let the Bible roll open past your screen at the pace you choose.",
      "Add commentary after each section from Matthew Henry or John Calvin should you wish.",
      "Take Scroll offline for distraction-free reading.",
    ]);
    (dlg.querySelector(".welcome-start") as HTMLButtonElement).click();
    expect(dlg.open).toBe(false);
    expect(localStorage.getItem("bible_scroller.welcome-seen")).toBe("1");

    // Static role=radio buttons all carry aria-checked and one tab stop per group.
    for (const g of document.querySelectorAll('[role="radiogroup"]')) {
      const radios = [...g.querySelectorAll<HTMLElement>('[role="radio"]')];
      expect(radios.every((r) => r.hasAttribute("aria-checked"))).toBe(true);
      expect(radios.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
      expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    }

    const passageBtn = document.getElementById("passage-btn")!;
    const picker = document.getElementById("picker")!;
    const headings = () => [...picker.querySelectorAll(".picker-heading")].map((h) => h.textContent);
    const clickText = (sel: string, text: string) => {
      const b = [...picker.querySelectorAll<HTMLButtonElement>(sel)].find((x) => x.textContent === text);
      expect(b, `${sel} "${text}"`).toBeTruthy();
      b!.click();
    };
    const pick = (edition: string, book: string, ch: number, vs: number) => {
      passageBtn.click();
      expect(picker.hidden).toBe(false);
      clickText("#picker-editions button", edition);
      clickText("#picker-books button", book);
      clickText("#picker-numbers button", String(ch));
      clickText("#picker-numbers button", String(vs));
      expect(picker.hidden).toBe(true);
    };

    passageBtn.click();
    expect(headings()).toEqual(["Old Testament", "New Testament", "Apocrypha"]);
    clickText("#picker-editions button", "KJV Oxford 1769");
    expect(headings()).toEqual(["Old Testament", "New Testament"]); // no empty Apocrypha group
    clickText("#picker-editions button", "KJV 1611");
    expect(headings()).toEqual(["Old Testament", "New Testament", "Apocrypha"]);
    expect([...picker.querySelectorAll("#picker-books button")].map((b) => b.textContent)).toEqual(expect.arrayContaining(["1 Esdras", "Susanna"]));
    document.getElementById("picker-close")!.click();
    expect(picker.hidden).toBe(true);

    pick("Geneva 1599", "Genesis", 1, 1);
    expect(label()).toBe("Genesis 1:1 · Geneva 1599");
    pick("Geneva 1599", "Psalms", 23, 1);
    expect(label()).toBe("Psalms 23:1 · Geneva 1599");
    pick("Geneva 1599", "Revelation", 22, 21);
    expect(label()).toBe("Revelation 22:21 · Geneva 1599");
    pick("Geneva 1599", "Wisdom of Solomon", 1, 1);
    expect(label()).toBe("Wisdom of Solomon 1:1 · Geneva 1599");
    pick("KJV 1611", "Susanna", 1, 1);
    expect(label()).toBe("Susanna 1:1 · KJV 1611");
    pick("KJV 1611", "1 Esdras", 1, 1);
    expect(label()).toBe("1 Esdras 1:1 · KJV 1611");

    // Switching to KJV from an Apocrypha start falls back to John 3:16.
    passageBtn.click();
    clickText("#picker-editions button", "KJV Oxford 1769");
    clickText("#picker-books button", "John");
    clickText("#picker-numbers button", "3");
    clickText("#picker-numbers button", "16");
    expect(label()).toBe("John 3:16 · KJV Oxford 1769");

    pick("Geneva 1599", "Tobit", 1, 1);
    expect(label()).toBe("Tobit 1:1 · Geneva 1599");
    document.getElementById("play")!.click();
    await vi.waitFor(() => expect(document.body.classList.contains("state-running")).toBe(true), { timeout: 5000 });
    const track = document.getElementById("track")!;
    // happy-dom has no layout (offsetHeight 0), so the rAF loop recycles items quickly; check the book, not the exact verse.
    expect(track.textContent).toMatch(/Tobit \d+:\d+/);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.body.classList.contains("state-stopped")).toBe(true);
    expect(document.getElementById("play")!.textContent).toBe("Resume");
    vi.unstubAllGlobals();
  });
});
