import { createLoader, DataError } from "./loader";
import { loadPrefs, loadTheme, savePrefs, safeStorage } from "./prefs";
import { Scroller } from "./scroller";
import { LoopCursor, resolveRange } from "./sequence";
import type { GenevaBook, GenevaMeta, HenryBook, Prefs, Speed, Theme } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const body = document.body;
const stage = $<HTMLElement>("stage");
const track = $<HTMLElement>("track");
const chrome = $<HTMLElement>("chrome");
const bookSel = $<HTMLSelectElement>("book");
const sch = $<HTMLSelectElement>("sch");
const sv = $<HTMLSelectElement>("sv");
const ech = $<HTMLSelectElement>("ech");
const ev = $<HTMLSelectElement>("ev");
const henryBox = $<HTMLInputElement>("henry");
const playBtn = $<HTMLButtonElement>("play");
const restartBtn = $<HTMLButtonElement>("restart");
const notice = $<HTMLElement>("notice");
const errorBox = $<HTMLElement>("error");
const speedBtns = [...document.querySelectorAll<HTMLButtonElement>(".speed button")];
const themeBtns = [...document.querySelectorAll<HTMLButtonElement>(".theme button")];

const loader = createLoader();
const storage = safeStorage();
const IDLE_MS = 3000;

let meta: GenevaMeta | null = null;
let prefs: Prefs;
let cursor: LoopCursor | null = null;
let scroller: Scroller | null = null;
let appliedKey = "";        // range currently loaded into the cursor
let henryNoticeShown = false;
let idleTimer = 0;
const bookCache = new Map<string, GenevaBook>();
const henryCache = new Map<string, HenryBook | null>();

// ---------- messages ----------
function showError(msg: string, help = "") {
  errorBox.querySelector(".error-msg")!.textContent = msg;
  errorBox.querySelector(".error-help")!.textContent = help;
  errorBox.hidden = false;
  body.classList.add("has-error");
  stop();
  showChrome();
}
function clearError() {
  errorBox.hidden = true;
  body.classList.remove("has-error");
}
let noticeTimer = 0;
function showNotice(msg: string) {
  notice.textContent = msg;
  notice.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => notice.classList.remove("show"), 5000);
}

// ---------- chrome visibility ----------
function showChrome() {
  body.classList.remove("chrome-hidden");
  scheduleHide();
}
function hideChrome() {
  if (scroller?.playing && errorBox.hidden) body.classList.add("chrome-hidden");
}
function scheduleHide() {
  clearTimeout(idleTimer);
  if (scroller?.playing) idleTimer = window.setTimeout(hideChrome, IDLE_MS);
}

// ---------- range picker ----------
const metaBook = (id: string) => meta!.books.find((b) => b.book_id === id)!;
function fillNums(sel: HTMLSelectElement, n: number, value: number) {
  if (sel.options.length !== n) {
    sel.replaceChildren(...Array.from({ length: n }, (_, i) => new Option(String(i + 1), String(i + 1))));
  }
  sel.value = String(Math.min(Math.max(1, value), n));
}
function syncPicker() {
  const mb = metaBook(bookSel.value);
  fillNums(sch, mb.chapters, +sch.value || 1);
  fillNums(sv, mb.verse_counts[+sch.value - 1] || 1, +sv.value || 1);
  fillNums(ech, mb.chapters, +ech.value || 1);
  if (+ech.value < +sch.value) ech.value = sch.value;
  fillNums(ev, mb.verse_counts[+ech.value - 1] || 1, +ev.value || 1);
  if (+ech.value === +sch.value && +ev.value < +sv.value) ev.value = sv.value;
}
function setPicker(r: Prefs["range"]) {
  bookSel.value = r.book_id;
  const mb = metaBook(r.book_id);
  fillNums(sch, mb.chapters, r.start.chapter);
  fillNums(sv, mb.verse_counts[r.start.chapter - 1] || 1, r.start.verse);
  fillNums(ech, mb.chapters, r.end.chapter);
  fillNums(ev, mb.verse_counts[r.end.chapter - 1] || 1, r.end.verse);
}
function pickerRange(): Prefs["range"] {
  return {
    book_id: bookSel.value,
    start: { chapter: +sch.value, verse: +sv.value },
    end: { chapter: +ech.value, verse: +ev.value },
  };
}
const rangeKey = (r: Prefs["range"]) => `${r.book_id}:${r.start.chapter}:${r.start.verse}-${r.end.chapter}:${r.end.verse}`;
function wholeChapter(ch: number) {
  const mb = metaBook(bookSel.value);
  setPicker({ book_id: mb.book_id, start: { chapter: ch, verse: 1 }, end: { chapter: ch, verse: mb.verse_counts[ch - 1] || 1 } });
}
function updatePlayLabel() {
  const dirty = rangeKey(pickerRange()) !== appliedKey;
  playBtn.textContent = !scroller || dirty ? "Start" : scroller.playing ? "Pause" : "Resume";
}

// ---------- prefs ----------
function persist() {
  savePrefs(storage, prefs);
}
function setSpeed(s: Speed) {
  prefs.speed = s;
  for (const b of speedBtns) b.setAttribute("aria-checked", String(b.dataset.speed === s));
  scroller?.setSpeed(s);
  persist();
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  for (const b of themeBtns) b.setAttribute("aria-checked", String(b.dataset.themeChoice === t));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#1c2027" : "#ffffff");
}
function setTheme(t: Theme) {
  applyTheme(t);
  if (prefs) { prefs.theme = t; persist(); }
}
applyTheme(loadTheme(storage));

// ---------- loading + playback ----------
async function getHenry(bookId: string): Promise<HenryBook | null> {
  if (!henryCache.has(bookId)) henryCache.set(bookId, await loader.loadHenryBook(bookId));
  return henryCache.get(bookId)!;
}
async function ensureHenry() {
  if (!cursor || !prefs.henry) return;
  const h = await getHenry(prefs.range.book_id);
  cursor.setHenryBook(h);
  if (!h && !henryNoticeShown) {
    henryNoticeShown = true;
    showNotice("Commentary data not available.");
  }
}

/** Load the picked range into a fresh cursor. No-op if the same range is already loaded. */
async function applyRange(force = false): Promise<boolean> {
  const r = pickerRange();
  const key = rangeKey(r);
  if (!force && key === appliedKey && cursor) return true;
  let book = bookCache.get(r.book_id);
  try {
    if (!book) {
      book = await loader.loadGenevaBook(r.book_id);
      bookCache.set(r.book_id, book);
    }
    const verses = resolveRange(meta!, book, r);
    if (!verses.length) throw new DataError("range_invalid", "No verses in that passage.");
    clearError();
    prefs.range = r;
    persist();
    cursor = new LoopCursor(verses, prefs.henry ? await getHenry(r.book_id) : null);
    appliedKey = key;
    henryNoticeShown = false;
    await ensureHenry();
    const src = { next: () => cursor!.next(prefs.henry) };
    if (!scroller) scroller = new Scroller(stage, track, src, prefs.speed);
    else scroller.setSource(src);
    scroller.reset();
    return true;
  } catch (e) {
    showError(e instanceof DataError ? e.message : "Book data not found: " + r.book_id + ".");
    return false;
  }
}

function stop() {
  scroller?.pause();
  body.classList.remove("playing");
  clearTimeout(idleTimer);
  updatePlayLabel();
}
function start() {
  scroller!.play();
  body.classList.add("playing");
  updatePlayLabel();
  scheduleHide();
}

async function onPlay() {
  const dirty = rangeKey(pickerRange()) !== appliedKey;
  if (!scroller || dirty) {
    if (!(await applyRange())) return;
    start();
    hideChromeSoon();
    return;
  }
  if (scroller.playing) stop();
  else start();
}
function hideChromeSoon() {
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(hideChrome, 900);
}

// ---------- wiring ----------
function wire() {
  bookSel.addEventListener("change", () => { wholeChapter(1); updatePlayLabel(); });
  for (const s of [sch, sv, ech, ev]) s.addEventListener("change", () => { syncPicker(); updatePlayLabel(); });
  $<HTMLButtonElement>("chapter-only").addEventListener("click", () => { wholeChapter(+sch.value); updatePlayLabel(); });
  $<HTMLButtonElement>("whole-book").addEventListener("click", () => {
    const mb = metaBook(bookSel.value);
    setPicker({ book_id: mb.book_id, start: { chapter: 1, verse: 1 }, end: { chapter: mb.chapters, verse: mb.verse_counts[mb.chapters - 1] || 1 } });
    updatePlayLabel();
  });
  henryBox.addEventListener("change", () => {
    prefs.henry = henryBox.checked;
    persist();
    if (prefs.henry) void ensureHenry();
  });
  for (const b of speedBtns) b.addEventListener("click", () => setSpeed(b.dataset.speed as Speed));
  for (const b of themeBtns) b.addEventListener("click", () => setTheme(b.dataset.themeChoice as Theme));
  playBtn.addEventListener("click", () => void onPlay());
  restartBtn.addEventListener("click", async () => {
    if (!(await applyRange(true))) return;
    start();
  });

  // Tap / pointer / key reveals chrome; chrome interaction keeps it up.
  stage.addEventListener("pointerdown", showChrome);
  errorBox.addEventListener("pointerdown", showChrome);
  chrome.addEventListener("pointerdown", showChrome);
  chrome.addEventListener("focusin", () => { clearTimeout(idleTimer); body.classList.remove("chrome-hidden"); });
  chrome.addEventListener("focusout", scheduleHide);
  chrome.addEventListener("pointermove", scheduleHide);
  document.addEventListener("keydown", (e) => {
    if (e.key === " " && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      void onPlay();
    } else if (e.key === "Escape") {
      hideChrome();
      return;
    }
    showChrome();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && scroller?.playing) stop(); });
  window.addEventListener("resize", () => scroller?.setSpeed(prefs.speed));
}

async function boot() {
  wire();
  try {
    meta = await loader.loadGenevaMeta();
  } catch {
    $<HTMLElement>("boot").remove();
    const fileHelp = location.protocol === "file:"
      ? "This browser blocks data files when a page is opened directly. Open the folder with a local static server instead (see README)."
      : "";
    for (const n of chrome.querySelectorAll<HTMLElement>("fieldset, .options, #play, #restart")) n.hidden = true;
    showError("Bible data missing or unreadable.", fileHelp);
    return;
  }
  $<HTMLElement>("boot").remove();
  const sorted = [...meta.books].sort((a, b) => a.order - b.order);
  bookSel.replaceChildren(...sorted.map((b) => new Option(b.book, b.book_id)));
  prefs = loadPrefs(storage, meta);
  setPicker(prefs.range);
  henryBox.checked = prefs.henry;
  setSpeed(prefs.speed);
  applyTheme(prefs.theme);
  updatePlayLabel();
  showChrome();
}

void boot();
