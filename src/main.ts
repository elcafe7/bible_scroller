import * as fullscreen from "./fullscreen";
import { canonBooks, resolveFromStart } from "./canon";
import { createLoader, DataError } from "./loader";
import { createPassagePicker, type PickerEdition } from "./picker";
import { loadPrefs, loadTheme, peekEdition, savePrefs, safeStorage } from "./prefs";
import { DEFAULT_EDITION_ID, EDITIONS, editionById, editionDir } from "./editions";
import { setCommentaryName, Scroller } from "./scroller";
import { LoopCursor } from "./sequence";
import type { Commentary, FontSize, GenevaBook, GenevaMeta, HenryBook, Prefs, ScrollMode, Speed, Theme } from "./types";

import { gaSpeed, track as gaTrack, trackCommentary, trackMode, trackSpeedChange } from "./ga";
import * as wakelock from "./wakelock";
import { createWelcome } from "./welcome";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const body = document.body;
const stage = $<HTMLElement>("stage");
const track = $<HTMLElement>("track");
const chrome = $<HTMLElement>("chrome");
const passageBtn = $<HTMLButtonElement>("passage-btn");
const passageLabel = $<HTMLElement>("passage-label");
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
const commentaryCache = new Map<string, HenryBook | null>();
/** edition_id → meta (Geneva / KJ16 / KJV). */
const metas = new Map<string, GenevaMeta>();
/** Land-picker draft start (committed to prefs on Start / picker confirm). */
let draft: Prefs["range"] | null = null;
let picker: ReturnType<typeof createPassagePicker> | null = null;
let welcome: ReturnType<typeof createWelcome> | null = null;

/** reader_open fires once per applied range key per page lifetime. */
const readerOpened = new Set<string>();
/** Shared, non-personal GA context for the applied passage (book name + numbers + enums; never text). */
function gaContext() {
  const r = prefs.range;
  return {
    book_title: metaBook(r.book_id)?.book ?? r.book_id,
    chapter: r.start.chapter,
    edition: prefs.edition,
    scroll_speed: gaSpeed(prefs.speed),
    scroll_mode: prefs.mode,
    commentary_source: prefs.commentary,
  };
}

function showError(msg: string, help = "") {
  errorBox.querySelector(".error-msg")!.textContent = msg;
  errorBox.querySelector(".error-help")!.textContent = help;
  errorBox.hidden = false;
  body.classList.add("has-error");
  stop(null);
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

const metaBook = (id: string) => canonBooks(meta!).find((b) => b.book_id === id)!;

function editionShort(id: string): string {
  return editionById(id)?.short ?? id;
}

function editionsForPicker(): PickerEdition[] {
  return EDITIONS.filter((e) => metas.has(e.id)).map((e) => ({
    id: e.id, short: e.short, name: e.name,
  }));
}

function metaFor(editionId: string): GenevaMeta {
  return metas.get(editionId) ?? meta!;
}

/** If book missing in target edition (Apocrypha → KJV), fall back to John 3:16 / first book. */
function rangeInEdition(editionId: string, range: Prefs["range"]): Prefs["range"] {
  const m = metaFor(editionId);
  const mb = canonBooks(m).find((b) => b.book_id === range.book_id);
  if (mb) {
    const ch = Math.min(Math.max(1, range.start.chapter), mb.chapters);
    const maxV = mb.verse_counts[ch - 1] || 1;
    const vs = Math.min(Math.max(1, range.start.verse), maxV);
    return { book_id: mb.book_id, start: { chapter: ch, verse: vs } };
  }
  const john = canonBooks(m).find((b) => b.book_id === "john");
  if (john && john.chapters >= 3 && (john.verse_counts[2] ?? 0) >= 16) {
    return { book_id: "john", start: { chapter: 3, verse: 16 } };
  }
  const first = canonBooks(m)[0]!;
  return { book_id: first.book_id, start: { chapter: 1, verse: 1 } };
}

function setEdition(editionId: string) {
  if (!metas.has(editionId)) return;
  meta = metas.get(editionId)!;
  const next = rangeInEdition(editionId, pickerStart());
  if (prefs) {
    prefs.edition = editionId;
    prefs.range = { book_id: next.book_id, start: { ...next.start } };
    persist();
  }
  draft = { book_id: next.book_id, start: { ...next.start } };
  syncPassageLabel();
  updateHenryNa();
  updatePlayLabel();
}

function pickerStart(): Prefs["range"] {
  return draft ?? prefs.range;
}

function syncPassageLabel() {
  const r = pickerStart();
  const mb = metaBook(r.book_id);
  const ed = editionShort(prefs?.edition ?? meta?.edition_id ?? DEFAULT_EDITION_ID);
  passageLabel.textContent = `${mb.book} ${r.start.chapter}:${r.start.verse} · ${ed}`;
  passageBtn.setAttribute("aria-label", `${passageLabel.textContent}, change passage`);
  updateHenryNa();
}

function setDraft(r: Prefs["range"]) {
  draft = { book_id: r.book_id, start: { ...r.start } };
  syncPassageLabel();
  updatePlayLabel();
}

function updateHenryNa() {
  const c = prefs?.commentary ?? "none";
  const avail = commentaryAvail.get(c);
  const bookId = pickerStart().book_id;
  const na = c !== "none" && !!avail && !avail.has(bookId);
  henryNa.textContent = na ? `${COMMENTARY_NAME[c]} isn’t available for this book.` : "";
  henryNa.hidden = !na;
}
function setCommentary(c: Commentary) {
  for (const b of commentaryBtns) b.setAttribute("aria-checked", String(b.dataset.commentary === c));
  setCommentaryName(COMMENTARY_NAME[c] || "Commentary");
  if (prefs) { prefs.commentary = c; persist(); }
  updateHenryNa();
  if (c !== "none") void ensureCommentary();
}
function setSize(z: FontSize) {
  for (const b of sizeBtns) b.setAttribute("aria-checked", String(b.dataset.size === z));
  document.body.classList.remove("size-s", "size-m", "size-l", "size-xl");
  document.body.classList.add(`size-${z}`);
  if (prefs) { prefs.fontSize = z; persist(); }
  if (prefs) scroller?.setSpeed(prefs.speed);
}
const startKey = (r: Prefs["range"], edition = prefs?.edition ?? DEFAULT_EDITION_ID) =>
  `${edition}:${r.book_id}:${r.start.chapter}:${r.start.verse}`;

function updatePlayLabel() {
  const dirty = startKey(pickerStart()) !== appliedKey;
  playBtn.textContent = !scroller || dirty ? "Start" : "Resume";
}

function persist() { savePrefs(storage, prefs); }
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

async function ensureBooks(bookId: string): Promise<Map<string, GenevaBook>> {
  const dir = editionDir(prefs.edition);
  const key = `${prefs.edition}:${bookId}`;
  if (!bookCache.has(key)) bookCache.set(key, await loader.loadEditionBook(dir, bookId));
  // Return a one-entry map keyed by book_id for resolveFromStart.
  const map = new Map<string, GenevaBook>();
  map.set(bookId, bookCache.get(key)!);
  return map;
}
async function ensureCommentaryMap(bookId: string): Promise<Map<string, HenryBook | null>> {
  const c = prefs.commentary;
  const map = new Map<string, HenryBook | null>();
  if (c === "none") return map;
  const k = `${c}:${bookId}`;
  if (!commentaryCache.has(k)) {
    // Skip the request when the commentary's meta says it has no file for this book (avoids a 404).
    const avail = commentaryAvail.get(c);
    commentaryCache.set(k, avail && !avail.has(bookId) ? null : await loader.loadCommentaryBook(c, bookId));
  }
  map.set(bookId, commentaryCache.get(k)!);
  return map;
}
async function ensureCommentary() {
  if (!cursor || prefs.commentary === "none") return;
  const bookId = prefs.range.book_id;
  const map = await ensureCommentaryMap(bookId);
  cursor.setHenryBook(map);
  if (!map.get(bookId) && !henryNoticeShown) {
    henryNoticeShown = true;
    showNotice("Commentary data not available.");
  }
}

function makeSource() {
  return {
    next: () => cursor!.next(prefs.commentary !== "none"),
  };
}

async function applyStart(force = false): Promise<boolean> {
  const r = pickerStart();
  const key = startKey(r);
  if (!force && key === appliedKey && cursor) return true;
  try {
    const books = await ensureBooks(r.book_id);
    const verses = resolveFromStart(meta!, books, { book_id: r.book_id, ...r.start });
    if (!verses.length) throw new DataError("range_invalid", "No verses in that passage.");
    clearError();
    prefs.range = { book_id: r.book_id, start: r.start };
    draft = { book_id: r.book_id, start: { ...r.start } };
    persist();
    syncPassageLabel();
    const commentary = prefs.commentary !== "none" ? await ensureCommentaryMap(r.book_id) : null;
    cursor = new LoopCursor(verses, commentary);
    appliedKey = key;
    henryNoticeShown = false;
    await ensureCommentary();
    const src = makeSource();
    if (!scroller) {
      scroller = new Scroller(stage, track, src, prefs.speed, prefs.mode);
      scroller.onLoopEnd = () => {
        const c = gaContext();
        gaTrack("scroll_complete", { book_title: c.book_title, chapter: c.chapter, percent: 100 });
      };
    }
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

function beginRun() {
  if (!scroller) return;
  running = true;
  showStage();
  scroller.play();
  void wakelock.request();
  updatePlayLabel();
  armIdle();
}
/** reason: "user" (Esc/Space/double-tap/fullscreen exit/Pause), "hidden" (tab hidden), null = not tracked (error). */
function stop(reason: "user" | "hidden" | null = "user") {
  if (running && reason) {
    gaTrack("scroll_stop", { book_title: gaContext().book_title, reason });
  }
  running = false;
  firstTap = null;
  clearTimeout(idleTimer);
  body.classList.remove("idle");
  scroller?.pause();
  void wakelock.release();
  fullscreen.exit();
  showSettings();
  updatePlayLabel();
}

async function onPlay() {
  if (running) { stop("user"); return; }
  void fullscreen.enter();
  const dirty = startKey(pickerStart()) !== appliedKey;
  const fresh = !scroller || dirty;
  if (fresh) {
    if (!(await applyStart())) {
      fullscreen.exit();
      showSettings();
      return;
    }
  }
  beginRun();
  const c = gaContext();
  if (fresh) {
    if (!readerOpened.has(appliedKey)) {
      readerOpened.add(appliedKey);
      gaTrack("reader_open", { book_title: c.book_title, reader_type: "scroll", chapter: c.chapter, edition: c.edition });
    }
    gaTrack("scroll_start", { ...c, reader_type: "scroll" });
  } else {
    gaTrack("scroll_resume", { book_title: c.book_title, scroll_speed: c.scroll_speed, scroll_mode: c.scroll_mode });
  }
}
async function onRestart() {
  void fullscreen.enter();
  if (!(await applyStart(true))) {
    fullscreen.exit();
    showSettings();
    return;
  }
  beginRun();
  const c = gaContext();
  gaTrack("scroll_restart", { book_title: c.book_title, chapter: c.chapter, scroll_speed: c.scroll_speed, scroll_mode: c.scroll_mode });
}

let lastFs: boolean | null = null;
function onFullscreenChange() {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  const on = !!(document.fullscreenElement ?? d.webkitFullscreenElement);
  if (on === lastFs || (lastFs === null && !on)) { lastFs = on; return; }
  lastFs = on;
  gaTrack("scroll_fullscreen", { fullscreen: on ? "on" : "off" });
}

function openPicker() {
  if (!picker || !meta) return;
  const r = pickerStart();
  picker.open({ book_id: r.book_id, start: r.start, edition_id: prefs.edition });
}

/**
 * WAI-ARIA radio group keyboard pattern: one tab stop per group (the checked radio),
 * Arrow keys / Home / End move and select. Call syncRovingTabs() after aria-checked changes.
 */
function syncRovingTabs() {
  for (const g of document.querySelectorAll<HTMLElement>('[role="radiogroup"]')) {
    const radios = [...g.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const checked = radios.find((r) => r.getAttribute("aria-checked") === "true") ?? radios[0];
    for (const r of radios) r.tabIndex = r === checked ? 0 : -1;
  }
}
function wireRadioKeys() {
  for (const g of document.querySelectorAll<HTMLElement>('[role="radiogroup"]')) {
    g.addEventListener("keydown", (e) => {
      const radios = [...g.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
      const i = radios.indexOf(e.target as HTMLButtonElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % radios.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + radios.length) % radios.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = radios.length - 1;
      if (j < 0) return;
      e.preventDefault();
      radios[j]!.focus();
      radios[j]!.click();
    });
  }
}

function wire() {
  fullscreen.init(() => stop("user"));
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  // Outbound "Take Scroll offline" links (GitHub repo page): track, never block navigation.
  // GA4 gtag has no transport_type field (it would be sent as a junk param); it already flushes
  // queued hits with a keepalive request when the page is hidden/unloaded.
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-offline-link]");
    if (!a) return;
    gaTrack("offline_download", {
      link_url: a.href,
      placement: a.closest("#welcome") ? "welcome" : "footer",
    });
  });
  wakelock.init();
  wireRadioKeys();
  document.addEventListener("click", (e) => {
    if ((e.target as Element | null)?.closest?.('[role="radio"]')) syncRovingTabs();
  });
  passageBtn.addEventListener("click", () => openPicker());
  for (const b of commentaryBtns) b.addEventListener("click", () => {
    henryNoticeShown = false;
    const c = b.dataset.commentary as Commentary;
    const changed = prefs && prefs.commentary !== c;
    setCommentary(c);
    if (changed) trackCommentary(c);
  });
  for (const b of sizeBtns) b.addEventListener("click", () => setSize(b.dataset.size as FontSize));
  for (const b of speedBtns) b.addEventListener("click", () => {
    const sp = b.dataset.speed as Speed;
    const changed = prefs && prefs.speed !== sp;
    setSpeed(sp);
    if (changed) trackSpeedChange(sp);
  });
  for (const b of themeBtns) b.addEventListener("click", () => setTheme(b.dataset.themeChoice as Theme));
  for (const b of modeBtns) b.addEventListener("click", () => {
    const m = b.dataset.mode as ScrollMode;
    const changed = prefs && prefs.mode !== m;
    setMode(m);
    if (changed) trackMode(m);
  });
  playBtn.addEventListener("click", () => { void onPlay(); });
  restartBtn.addEventListener("click", () => { void onRestart(); });
  stage.addEventListener("pointerup", (ev) => {
    if (!running) return;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const cur = { t: ev.timeStamp, x: ev.clientX, y: ev.clientY };
    if (firstTap && cur.t - firstTap.t <= TAP_MS && Math.hypot(cur.x - firstTap.x, cur.y - firstTap.y) <= TAP_DIST) {
      firstTap = null;
      stop("user");
      return;
    }
    firstTap = cur;
  });
  document.addEventListener("pointermove", () => { if (running) armIdle(); });
  document.addEventListener("keydown", (e) => {
    if (picker?.isOpen()) return; // picker owns Escape
    if (welcome?.isOpen()) return; // welcome card owns its keys
    if (running) {
      if (e.key === "Escape" || e.key === " " || e.code === "Space") { e.preventDefault(); stop("user"); }
      return;
    }
    const tag = e.target;
    const inField = tag instanceof HTMLSelectElement || tag instanceof HTMLButtonElement || tag instanceof HTMLInputElement || tag instanceof HTMLTextAreaElement;
    if ((e.key === " " || e.code === "Space") && !inField) { e.preventDefault(); void onPlay(); }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && running) stop("hidden"); });
  window.addEventListener("resize", () => { scroller?.setSpeed(prefs.speed); scroller?.onResize(); });
}

async function boot() {
  showSettings();
  wire();
  try {
    for (const ed of EDITIONS) {
      try {
        const m = await loader.loadEditionMeta(ed.dir);
        metas.set(ed.id, m);
      } catch {
        /* edition optional if data dir missing */
      }
    }
    const want = peekEdition(storage);
    meta = metas.get(want) ?? metas.get(DEFAULT_EDITION_ID) ?? [...metas.values()][0] ?? null;
    if (!meta) throw new Error("no editions");
  } catch {
    $<HTMLElement>("boot").remove();
    const fileHelp = location.protocol === "file:"
      ? "Keep index.html next to its data folder (unzip the whole bible_scroller folder), then open index.html again."
      : "";
    for (const n of chrome.querySelectorAll<HTMLElement>("fieldset, .options, #play, #restart")) n.hidden = true;
    showError("Bible data missing or unreadable.", fileHelp);
    return;
  }
  $<HTMLElement>("boot").remove();
  prefs = loadPrefs(storage, meta);
  if (!metas.has(prefs.edition)) prefs.edition = meta.edition_id;
  meta = metas.get(prefs.edition) ?? meta;
  // Clamp range if stored Apocrypha book isn't in this edition (e.g. switched data).
  prefs.range = rangeInEdition(prefs.edition, prefs.range);
  draft = { book_id: prefs.range.book_id, start: { ...prefs.range.start } };
  picker = createPassagePicker({
    root: $<HTMLElement>("picker"),
    getMeta: (editionId) => metaFor(editionId),
    getEditions: editionsForPicker,
    onSelect: (sel) => {
      if (sel.edition_id && sel.edition_id !== prefs.edition) setEdition(sel.edition_id);
      setDraft({ book_id: sel.book_id, start: sel.start });
      const mb = canonBooks(metaFor(prefs.edition)).find((b) => b.book_id === sel.book_id);
      if (mb) {
        gaTrack("scroll_range_set", {
          book_title: mb.book, chapter: sel.start.chapter, verse: sel.start.verse,
          end_chapter: mb.chapters, end_verse: mb.verse_counts[mb.chapters - 1] || 1, edition: prefs.edition,
        });
      }
    },
  });
  for (const c of ["henry", "calvin"] as const) {
    void loader.loadCommentaryMeta(c).then((m) => {
      commentaryAvail.set(c, new Set(m?.books.map((b) => b.book_id) ?? []));
      updateHenryNa();
    });
  }
  syncPassageLabel();
  setCommentary(prefs.commentary);
  setSize(prefs.fontSize);
  setSpeed(prefs.speed);
  applyTheme(prefs.theme);
  applyModeUi(prefs.mode);
  updatePlayLabel();
  syncRovingTabs();
  welcome = createWelcome($<HTMLDialogElement>("welcome"), storage, () => passageBtn);
  welcome.maybeOpen();
}

void boot();
