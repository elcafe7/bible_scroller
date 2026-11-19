/**
 * @vitest-environment happy-dom
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createLoader } from "../src/loader";
import { resolveRange, LoopCursor, onePass } from "../src/sequence";
import { renderItem, Scroller, SPEED_CPM } from "../src/scroller";
import { fsFetch } from "./helpers";

const FIX = resolve(import.meta.dirname, "../fixtures/john1");
const DATA = resolve(import.meta.dirname, "../data");
const root = existsSync(resolve(DATA, "geneva/john.json")) ? DATA : FIX;
const fetch = fsFetch(root);

type Spawnable = { spawnHorizontal: () => void };

function stageDom() {
  document.body.innerHTML = `<main id="stage"><div id="track"></div></main>`;
  document.body.className = "mode-horizontal size-m";
  const stage = document.getElementById("stage")!;
  const track = document.getElementById("track")!;
  Object.defineProperty(stage, "clientWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(stage, "clientHeight", { configurable: true, get: () => 400 });
  return { stage, track };
}

function spawnNext(scroller: Scroller, track: HTMLElement) {
  track.replaceChildren();
  (Object.getPrototypeOf(scroller) as Spawnable).spawnHorizontal.call(scroller);
}

describe("ticker sequencing (no simultaneous verse+commentary)", () => {
  it("renderItem(horizontal) verse has no henry-row / ticker-stack", () => {
    const el = renderItem(
      { kind: "verse", book: "John", chapter: 3, verse: 16, text: "For God so loued the world…" },
      "horizontal",
    );
    expect(el.classList.contains("verse")).toBe(true);
    expect(el.classList.contains("ticker-stack")).toBe(false);
    expect(el.querySelector(".henry-row")).toBeNull();
    expect(el.querySelector(".verse-row")).not.toBeNull();
  });

  it("renderItem(horizontal) henry uses second line (henry-row) in ticker-stack", () => {
    const el = renderItem(
      {
        kind: "henry",
        book: "John",
        chapter: 3,
        verse_start: 1,
        verse_end: 21,
        text: "Christ's interview.",
        for_verse: 21,
        section_title: "Interview",
      },
      "horizontal",
    );
    expect(el.classList.contains("henry")).toBe(true);
    expect(el.classList.contains("ticker-stack")).toBe(true);
    expect(el.querySelector(".henry-row")).not.toBeNull();
    expect(el.querySelector(".ticker-orient")).not.toBeNull();
    expect(el.querySelectorAll(".ticker-row").length).toBe(2);
  });

  it("John 3:16–21 + Henry: verses first (no line 2), then commentary on line 2", async () => {
    const loader = createLoader({ fetch });
    const meta = await loader.loadGenevaMeta();
    const john = await loader.loadGenevaBook("john");
    const henry = await loader.loadHenryBook("john");
    const verses = resolveRange(meta, john, {
      book_id: "john",
      start: { chapter: 3, verse: 16 },
      end: { chapter: 3, verse: 21 },
    });
    expect(verses.length).toBe(6);
    const pass = onePass(verses, henry, true);
    // Sequence matches vertical: all six verses, then the section note.
    expect(pass.slice(0, 6).every((i) => i.kind === "verse")).toBe(true);
    expect(pass[6]).toMatchObject({ kind: "henry", verse_start: 1, verse_end: 21 });

    const cursor = new LoopCursor(verses, henry);
    const { stage, track } = stageDom();
    const scroller = new Scroller(stage, track, { next: () => cursor.next(true) }, "fast", "horizontal");
    scroller.reset();

    const kinds: string[] = [];
    for (let i = 0; i < pass.length; i++) {
      const child = track.firstElementChild as HTMLElement;
      expect(child).not.toBeNull();
      // Never a paired verse+commentary unit.
      expect(child.classList.contains("pair")).toBe(false);
      expect(child.classList.contains("verse") && child.querySelector(".henry-row")).toBeFalsy();
      if (child.classList.contains("verse")) {
        kinds.push("verse");
        expect(child.querySelector(".henry-row")).toBeNull();
      } else if (child.classList.contains("henry")) {
        kinds.push("henry");
        expect(child.querySelector(".henry-row")).not.toBeNull();
      } else {
        kinds.push("other");
      }
      spawnNext(scroller, track);
    }
    expect(kinds).toEqual(["verse", "verse", "verse", "verse", "verse", "verse", "henry"]);
    scroller.pause();
  });

  it("multi-section range: commentary chunks successive after each section's verses (LoopCursor order)", async () => {
    const loader = createLoader({ fetch });
    const meta = await loader.loadGenevaMeta();
    const john = await loader.loadGenevaBook("john");
    const henry = await loader.loadHenryBook("john");
    // Spans Henry 1–21 and 22–36.
    const verses = resolveRange(meta, john, {
      book_id: "john",
      start: { chapter: 3, verse: 16 },
      end: { chapter: 3, verse: 36 },
    });
    const pass = onePass(verses, henry, true);
    const kinds = pass.map((i) => i.kind);
    expect(kinds.filter((k) => k === "henry").length).toBe(2);
    // First henry after v21; second after v36 (last).
    const i21 = pass.findIndex((i) => i.kind === "verse" && i.verse === 21);
    expect(pass[i21 + 1]).toMatchObject({ kind: "henry", verse_end: 21 });
    expect(pass[pass.length - 1]).toMatchObject({ kind: "henry", verse_start: 22, verse_end: 36 });

    const cursor = new LoopCursor(verses, henry);
    const { stage, track } = stageDom();
    const scroller = new Scroller(stage, track, { next: () => cursor.next(true) }, "fast", "horizontal");
    scroller.reset();
    for (let i = 0; i < pass.length; i++) {
      const child = track.firstElementChild as HTMLElement;
      expect(child.classList.contains("pair")).toBe(false);
      if (pass[i]!.kind === "verse") {
        expect(child.classList.contains("verse")).toBe(true);
        expect(child.querySelector(".henry-row")).toBeNull();
      } else {
        expect(child.classList.contains("henry")).toBe(true);
        expect(child.querySelector(".henry-row")).not.toBeNull();
      }
      spawnNext(scroller, track);
    }
    scroller.pause();
  });

  it("verse-only (commentary off) never shows line 2", async () => {
    const loader = createLoader({ fetch });
    const meta = await loader.loadGenevaMeta();
    const john = await loader.loadGenevaBook("john");
    const verses = resolveRange(meta, john, {
      book_id: "john",
      start: { chapter: 3, verse: 16 },
      end: { chapter: 3, verse: 18 },
    });
    const cursor = new LoopCursor(verses, null);
    const { stage, track } = stageDom();
    const scroller = new Scroller(stage, track, { next: () => cursor.next(false) }, "fast", "horizontal");
    scroller.reset();
    for (let i = 0; i < verses.length; i++) {
      const child = track.firstElementChild as HTMLElement;
      expect(child.classList.contains("verse")).toBe(true);
      expect(child.querySelector(".henry-row")).toBeNull();
      expect(child.classList.contains("ticker-stack")).toBe(false);
      spawnNext(scroller, track);
    }
    scroller.pause();
  });

  it("pause works mid-sequence (verse phase and after advancing to commentary)", async () => {
    const loader = createLoader({ fetch });
    const meta = await loader.loadGenevaMeta();
    const john = await loader.loadGenevaBook("john");
    const henry = await loader.loadHenryBook("john");
    const verses = resolveRange(meta, john, {
      book_id: "john",
      start: { chapter: 3, verse: 16 },
      end: { chapter: 3, verse: 21 },
    });
    const cursor = new LoopCursor(verses, henry);
    const { stage, track } = stageDom();
    const scroller = new Scroller(stage, track, { next: () => cursor.next(true) }, "fast", "horizontal");
    scroller.reset();
    scroller.play();
    expect(scroller.playing).toBe(true);
    scroller.pause();
    expect(scroller.playing).toBe(false);
    // Advance through verses to commentary phase, pause again.
    for (let i = 0; i < verses.length; i++) spawnNext(scroller, track);
    expect(track.firstElementChild?.classList.contains("henry")).toBe(true);
    scroller.play();
    scroller.pause();
    expect(scroller.playing).toBe(false);
    expect(track.firstElementChild?.classList.contains("henry")).toBe(true);
  });
});

describe("ticker font size viewport proportions", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../src/style.css"), "utf8");

  it("defines S/M/L/XL ticker sizes as vh proportions", () => {
    expect(css).toMatch(/body\.mode-horizontal\.size-s\s*\{[^}]*--ticker-verse:\s*max\([^,]+,\s*3vh\)/s);
    expect(css).toMatch(/body\.mode-horizontal\.size-m\s*\{[^}]*--ticker-verse:\s*max\([^,]+,\s*4\.25vh\)/s);
    expect(css).toMatch(/body\.mode-horizontal\.size-l\s*\{[^}]*--ticker-verse:\s*max\([^,]+,\s*5\.75vh\)/s);
    expect(css).toMatch(/body\.mode-horizontal\.size-xl\s*\{[^}]*--ticker-verse:\s*max\([^,]+,\s*7\.5vh\)/s);
    expect(css).toMatch(/--ticker-henry:\s*max\([^,]+,\s*2\.55vh\)/);
    expect(css).toMatch(/--ticker-henry:\s*max\([^,]+,\s*3\.6vh\)/);
    expect(css).toMatch(/--ticker-henry:\s*max\([^,]+,\s*4\.9vh\)/);
    expect(css).toMatch(/--ticker-henry:\s*max\([^,]+,\s*6\.4vh\)/);
    expect(css).not.toMatch(/mode-horizontal\.size-xl \.item \{ font-size: clamp\(2\.6rem/);
    // Vertical rem clamps still present.
    expect(css).toMatch(/body\.size-xl \{ --verse-size: clamp\(2rem/);
  });

  it("vh math scales across 800px and 1080px viewports", () => {
    const ratios = { s: 3, m: 4.25, l: 5.75, xl: 7.5 };
    expect(ratios.m * 800 / 100).toBeCloseTo(34, 5);
    expect(ratios.xl * 800 / 100).toBeCloseTo(60, 5);
    expect(ratios.m * 1080 / 100).toBeCloseTo(45.9, 5);
    expect(ratios.xl * 1080 / 100).toBeCloseTo(81, 5);
    expect(ratios.s * 800 / 100).toBeLessThan(ratios.xl * 800 / 100);
    expect(SPEED_CPM.medium).toBe(900);
  });
});

describe("Geneva Apocrypha ticker smoke", () => {
  it("Tobit verses spawn without commentary line (full data)", async () => {
    const DATA = resolve(import.meta.dirname, "../data");
    if (!existsSync(resolve(DATA, "geneva/tobit.json"))) return;
    const { createLoader } = await import("../src/loader");
    const { resolveRange, LoopCursor } = await import("../src/sequence");
    const { Scroller } = await import("../src/scroller");
    const { fsFetch } = await import("./helpers");
    const loader = createLoader({ fetch: fsFetch(DATA) });
    const meta = await loader.loadEditionMeta("geneva");
    const tob = await loader.loadEditionBook("geneva", "tobit");
    const verses = resolveRange(meta, tob, {
      book_id: "tobit",
      start: { chapter: 1, verse: 1 },
      end: { chapter: 1, verse: 2 },
    });
    document.body.innerHTML = `<main id="stage"><div id="track"></div></main>`;
    document.body.className = "mode-horizontal size-m";
    const stage = document.getElementById("stage")!;
    const track = document.getElementById("track")!;
    Object.defineProperty(stage, "clientWidth", { configurable: true, get: () => 800 });
    Object.defineProperty(stage, "clientHeight", { configurable: true, get: () => 400 });
    const cursor = new LoopCursor(verses, null);
    const scroller = new Scroller(stage, track, { next: () => cursor.next(false) }, "fast", "horizontal");
    scroller.reset();
    expect(track.firstElementChild?.classList.contains("verse")).toBe(true);
    expect(track.querySelector(".henry-row")).toBeNull();
    expect((track.textContent || "").toLowerCase()).toContain("tobit");
    scroller.pause();
  });
});
