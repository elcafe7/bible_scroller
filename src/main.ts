import * as fullscreen from "./fullscreen";
import { createLoader, DataError } from "./loader";
import { loadPrefs, loadTheme, savePrefs, safeStorage } from "./prefs";
import { groupBooks, startToEnd } from "./prefs";
import { setCommentaryName } from "./scroller";
import { Scroller } from "./scroller";
import { LoopCursor, resolveRange } from "./sequence";
import type { Commentary, FontSize, GenevaBook, GenevaMeta, HenryBook, Prefs, ScrollMode, Speed, Theme } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const body = document.body;
const stage = $<HTMLElement>("stage");
const track = $<HTMLElement>("track");
const chrome = $<HTMLElement>("chrome");
const bookSel = $<HTMLSelectElement>("book");
const sch = $<HTMLSelectElement>("sch");
const sv = $<HTMLSelectElement>("sv");
const henryNa = $<HTMLElement>("henry-na");
const commentaryAvail = new Map<Commentary, Set<string>>();
const commentaryBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-commentary]")];
const sizeBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-size]")];
const COMMENTARY_NAME: Record<Commentary, string> = { none: "", henry: "Matthew Henry", calvin: "Calvin" };
const playBtn = $<HTMLButtonElement>("play");
const restartBtn = $<HTMLButtonElement>("restart");
const notice = $<HTMLElement>("notice");
const errorBox = $<HTMLElement>("error");
const speedBtns = [...document.querySelectorAll<HTMLButtonElement>(".speed button")];
const themeBtns = [...document.querySelectorAll<HTMLButtonElement>(".theme button")];
const modeBtns = [...document.querySelectorAll<HTMLButtonElement>(".mode button")];

const loader = createLoader();
const storage = safeStorage();
const IDLE_MS = 3000;
const TAP_MS = 450;
const TAP_DIST = 28;

let meta: GenevaMeta | null = null;
let prefs: Prefs;
let cursor: LoopCursor | null = null;
let scroller: Scroller | null = null;
let appliedKey = "";
let henryNoticeShown = false;
let running = false;
let idleTimer = 0;
let firstTap: { t: number; x: number; y: number } | null = null;
const bookCache = new Map<string, GenevaBook>();
const henryCache = new Map<string, HenryBook | null>();

// ---------- messages ----------
function showError(msg: string, help = "") {
  errorBox.querySelector(".error-msg")!.textContent = msg;
  errorBox.querySelector(".error-help")!.textContent = help;
  errorBox.hidden = false;
  body.classList.add("has-error");
  stop();
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

// ---------- surfaces (settings page vs fullscreen stage) ----------
function showSettings() {
  body.classList.add("state-stopped");
  body.classList.remove("state-running", "idle", "is-fullviewport");
  stage.hidden = true;
  chrome.hidden = false;
}
function showStage() {
  body.classList.add("state-running");
  body.classList.remove("state-stopped");
  stage.hidden = false;
  chrome.hidden = true;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function armIdle() {
  clearTimeout(idleTimer);
  body.classList.remove("idle");
  if (running) idleTimer = window.setTimeout(() => { if (running) body.classList.add("idle"); }, IDLE_MS);
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
  updateHenryNa();
}
function updateHenryNa() {
  const c = prefs?.commentary ?? "none";
  const avail = commentaryAvail.get(c);
  const na = c !== "none" && !!avail && !avail.has(bookSel.value);
  henryNa.textContent = na ? `${COMMENTARY_NAME[c]} isn\u2019t available for this book.` : "";
  henryNa.hidden = !na;
}
function setCommentary(c: Commentary) {
  for (const b of commentaryBtns) b.setAttribute("aria-checked", String(b.dataset.commentary === c));
  setCommentaryName(COMMENTARY_NAME[c] || "Commentary");
  if (prefs) { prefs.commentary = c; persist(); }
  updateHenryNa();
  if (c !== "none") void ensureHenry();
}
function setSize(z: FontSize) {
  for (const b of sizeBtns) b.setAttribute("aria-checked", String(b.dataset.size === z));
  document.body.classList.remove("size-s", "size-m", "size-l", "size-xl");
  document.body.classList.add(`size-${z}`);
  if (prefs) { prefs.fontSize = z; persist(); }
  if (prefs) scroller?.setSpeed(prefs.speed);
}
function setPicker(r: Prefs["range"]) {
  bookSel.value = r.book_id;
  const mb = metaBook(r.book_id);
  fillNums(sch, mb.chapters, r.start.chapter);
  fillNums(sv, mb.verse_counts[r.start.chapter - 1] || 1, r.start.verse);
  updateHenryNa();
}
function pickerRange(): Prefs["range"] {
  return startToEnd(meta!, bookSel.value, { chapter: +sch.value, verse: +sv.value });
}
const rangeKey = (r: Prefs["range"]) => `${r.book_id}:${r.start.chapter}:${r.start.verse}-${r.end.chapter}:${r.end.verse}`;
function updatePlayLabel() {
  const dirty = rangeKey(pickerRange()) !== appliedKey;
  // Resume = same range already loaded (stopped mid-scroll); Start = fresh or dirty.
  playBtn.textContent = !scroller || dirty ? "Start" : "Resume";
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

function applyModeUi(m: ScrollMode) {
  for (const b of modeBtns) b.setAttribute("aria-checked", String(b.dataset.mode === m));
  body.classList.toggle("mode-horizontal", m === "horizontal");
  body.classList.toggle("mode-vertical", m === "vertical");
}
function setMode(m: ScrollMode) {
  if (prefs.mode === m && scroller?.scrollMode === m) return;
  prefs.mode = m;
  applyModeUi(m);
  persist();
  if (!scroller) return;
  const wasRunning = running;
  scroller.setMode(m);
  if (cursor) cursor.restart();
  scroller.reset();
  if (wasRunning) scroller.play();
  else updatePlayLabel();
}

// ---------- loading + playback ----------
async function getHenry(bookId: string): Promise<HenryBook | null> {
  const c = prefs.commentary;
  if (c === "none") return null;
  const k = `${c}:${bookId}`;
  if (!henryCache.has(k)) henryCache.set(k, await loader.loadCommentaryBook(c, bookId));
  return henryCache.get(k)!;
}
async function ensureHenry() {
  if (!cursor || prefs.commentary === "none") return;
  const h = await getHenry(prefs.range.book_id);
  cursor.setHenryBook(h);
  if (!h && !henryNoticeShown) {
    henryNoticeShown = true;
    showNotice("Commentary data not available.");
  }
}

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
    cursor = new LoopCursor(verses, prefs.commentary !== "none" ? await getHenry(r.book_id) : null);
    appliedKey = key;
    henryNoticeShown = false;
    await ensureHenry();
    const src = { next: () => cursor!.next(prefs.commentary !== "none") };
    if (!scroller) scroller = new Scroller(stage, track, src, prefs.speed, prefs.mode);
    else {
      scroller.pause();
      scroller.setSource(src);
      if (scroller.scrollMode !== prefs.mode) scroller.setMode(prefs.mode);
    }
    scroller.reset();
    return true;
  } catch (e) {
    showError(e instanceof DataError ? e.message : "Book data not found: " + r.book_id + ".");
    return false;
  }
}

/** Begin scroll on the fullscreen/full-viewport stage (scroller must already exist). */
function beginRun() {
  if (!scroller) return;
  running = true;
  showStage();
  scroller.play();
  updatePlayLabel();
  armIdle();
}

/** Leave scroll surface → settings page; freeze position for Resume. */
function stop() {
  running = false;
  firstTap = null;
  clearTimeout(idleTimer);
  body.classList.remove("idle");
  scroller?.pause();
  fullscreen.exit();
  showSettings();
  updatePlayLabel();
}

async function onPlay() {
  if (running) {
    stop();
    return;
  }
  // Fullscreen must start inside the user gesture — before any await.
  void fullscreen.enter();
  const dirty = rangeKey(pickerRange()) !== appliedKey;
  if (!scroller || dirty) {
    if (!(await applyRange())) {
      fullscreen.exit();
      showSettings();
      return;
    }
  }
  beginRun();
}

async function onRestart() {
  void fullscreen.enter();
  if (!(await applyRange(true))) {
    fullscreen.exit();
    showSettings();
    return;
  }
  beginRun();
}

// ---------- wiring ----------
function wire() {
  fullscreen.init(() => stop());

  bookSel.addEventListener("change", () => { setPicker(startToEnd(meta!, bookSel.value, { chapter: 1, verse: 1 })); updatePlayLabel(); });
  for (const s of [sch, sv]) s.addEventListener("change", () => { syncPicker(); updatePlayLabel(); });
  for (const b of commentaryBtns) b.addEventListener("click", () => { henryNoticeShown = false; setCommentary(b.dataset.commentary as Commentary); });
  for (const b of sizeBtns) b.addEventListener("click", () => setSize(b.dataset.size as FontSize));
  for (const b of speedBtns) b.addEventListener("click", () => setSpeed(b.dataset.speed as Speed));
  for (const b of themeBtns) b.addEventListener("click", () => setTheme(b.dataset.themeChoice as Theme));
  for (const b of modeBtns) b.addEventListener("click", () => setMode(b.dataset.mode as ScrollMode));

  // Must stay sync in the gesture so requestFullscreen is allowed.
  playBtn.addEventListener("click", () => { void onPlay(); });
  restartBtn.addEventListener("click", () => { void onRestart(); });

  // Double-tap stage → stop (news/ticker gesture).
  stage.addEventListener("pointerup", (ev) => {
    if (!running) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const cur = { t: ev.timeStamp, x: ev.clientX, y: ev.clientY };
    if (
      firstTap &&
      cur.t - firstTap.t <= TAP_MS &&
      Math.hypot(cur.x - firstTap.x, cur.y - firstTap.y) <= TAP_DIST
    ) {
      firstTap = null;
      stop();
      return;
    }
    firstTap = cur;
  });

  document.addEventListener("pointermove", () => { if (running) armIdle(); });

  document.addEventListener("keydown", (e) => {
    if (running) {
      if (e.key === "Escape" || e.key === " " || e.code === "Space") {
        e.preventDefault();
        stop();
      }
      return;
    }
    // On settings page: Space starts when not focused on a control.
    const tag = e.target;
    const inField =
      tag instanceof HTMLSelectElement ||
      tag instanceof HTMLButtonElement ||
      tag instanceof HTMLInputElement ||
      tag instanceof HTMLTextAreaElement;
    if ((e.key === " " || e.code === "Space") && !inField) {
      e.preventDefault();
      void onPlay();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && running) stop();
  });
  window.addEventListener("resize", () => scroller?.setSpeed(prefs.speed));
}

async function boot() {
  showSettings();
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
  bookSel.replaceChildren(...groupBooks(sorted).map(([label, bs]) => {
    const g = document.createElement("optgroup");
    g.label = label;
    g.append(...bs.map((b) => new Option(b.book, b.book_id)));
    return g;
  }));
  for (const c of ["henry", "calvin"] as const) {
    void loader.loadCommentaryMeta(c).then((m) => {
      commentaryAvail.set(c, new Set(m?.books.map((b) => b.book_id) ?? []));
      updateHenryNa();
    });
  }
  prefs = loadPrefs(storage, meta);
  setPicker(prefs.range);
  setCommentary(prefs.commentary);
  setSize(prefs.fontSize);
  setSpeed(prefs.speed);
  applyTheme(prefs.theme);
  applyModeUi(prefs.mode);
  updatePlayLabel();
}

void boot();
