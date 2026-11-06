import type { LoopItem, ScrollMode, Speed } from "./types";

let commentaryName = "Matthew Henry";
export function setCommentaryName(n: string) { commentaryName = n; }

/** Vertical reading pace in CSS lines per minute. Tuned so Fast feels brisk continuous reading (not a crawl); still far slower than a stock ticker. */
export const SPEED_LPM: Record<Speed, number> = { "very-slow": 30, slow: 48, medium: 80, fast: 130 };

/**
 * Horizontal ticker CPM — separate curve from vertical. Marquee tracking feels faster
 * than vertical LPM at the same "Slow", so Slow/Medium sit lower; Fast stays ~reading-brisk.
 * Slow/Medium/Fast kept at 480/900/1620; Very Slow is a ~0.625× step below Slow (same ratio as vertical).
 */
export const SPEED_CPM: Record<Speed, number> = { "very-slow": 300, slow: 480, medium: 900, fast: 1620 };

export interface ScrollerSource {
  next(): LoopItem | null;
}

function el(tag: string, cls?: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Collapse wrapping whitespace but keep NBSP runs (commentary double-gap after periods). */
function flattenText(text: string): string {
  return text
    .replace(/\u00A0+/g, (m) => "\u0001".repeat(m.length))
    .replace(/\s+/g, " ")
    .replace(/\u0001/g, "\u00A0")
    .trim();
}

/** Measure in a detached tree so probes never mutate the live track (avoids layout jumps). */
function measure(node: HTMLElement, track: HTMLElement): HTMLElement {
  const host = el("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
  // Match track formatting context for font metrics.
  host.className = track.className;
  document.body.append(host);
  host.append(node);
  return host;
}

export function renderItem(item: LoopItem, mode: ScrollMode = "vertical"): HTMLElement {
  if (mode === "horizontal") return renderHorizontalItem(item);
  if (item.kind === "verse") {
    const n = el("article", "item verse");
    n.append(el("span", "ref", `${item.book} ${item.chapter}:${item.verse}`), el("p", "", item.text));
    return n;
  }
  const n = el("aside", "item henry");
  n.setAttribute("aria-label", commentaryName);
  const span = item.verse_start === item.verse_end ? `${item.verse_start}` : `${item.verse_start}–${item.verse_end}`;
  const ref = el("span", "ref", `${commentaryName} · ${item.book} ${item.chapter}:${span}`);
  if (item.section_title) ref.append(" ", el("span", "title", item.section_title));
  n.append(ref);
  for (const para of item.text.split(/\n\s*\n/)) {
    const t = flattenText(para.replace(/\n/g, " "));
    if (t) n.append(el("p", "", t));
  }
  return n;
}

/** One verse row for the horizontal ticker. */
function renderHorizontalVerse(item: Extract<LoopItem, { kind: "verse" }>): HTMLElement {
  const row = el("div", "ticker-row verse-row");
  row.append(
    el("span", "ref", `${item.book} ${item.chapter}:${item.verse}`),
    el("span", "body", flattenText(item.text)),
  );
  return row;
}

/** One commentary row (ref + body) for the horizontal ticker. */
function renderHorizontalHenry(item: Extract<LoopItem, { kind: "henry" }>): HTMLElement {
  const row = el("div", "ticker-row henry-row");
  const span = item.verse_start === item.verse_end ? `${item.verse_start}` : `${item.verse_start}–${item.verse_end}`;
  let label = `${commentaryName} · ${item.book} ${item.chapter}:${span}`;
  if (item.section_title) label += ` — ${item.section_title}`;
  row.append(el("span", "ref", label), el("span", "body", flattenText(item.text)));
  return row;
}

/**
 * Ticker item — one after another (same order as vertical LoopCursor).
 * Verses use the verse line only; commentary uses the second line after passages finish.
 */
function renderHorizontalItem(item: LoopItem): HTMLElement {
  if (item.kind === "verse") {
    const n = el("article", "item verse");
    n.append(renderHorizontalVerse(item));
    return n;
  }
  // Commentary phase: discreet range ref on line 1, note on line 2 (not paired under a live verse).
  const n = el("aside", "item henry ticker-stack");
  n.setAttribute("aria-label", commentaryName);
  const span = item.verse_start === item.verse_end ? `${item.verse_start}` : `${item.verse_start}–${item.verse_end}`;
  const orient = el("div", "ticker-row verse-row ticker-orient");
  orient.append(el("span", "ref", `${item.book} ${item.chapter}:${span}`));
  n.append(orient, renderHorizontalHenry(item));
  return n;
}

/**
 * Continuous rAF scroll. Vertical mode: virtual column of passage blocks.
 * Horizontal mode: one marquee item at a time (verse line, then commentary line after passages).
 */
export class Scroller {
  private pos = 0; // y in vertical mode, x in horizontal
  private raf = 0;
  private gen = 0; // bumps on every pause so a stale tick cannot reschedule
  private last = 0;
  private pxPerSec = 0;
  private mode: ScrollMode = "vertical";
  private lastSpeed: Speed = "medium";
  playing = false;

  constructor(
    private stage: HTMLElement,
    private track: HTMLElement,
    private source: ScrollerSource,
    speed: Speed,
    mode: ScrollMode = "vertical",
  ) {
    this.mode = mode;
    this.applyModeClass();
    this.setSpeed(speed);
  }

  get scrollMode() { return this.mode; }

  setSource(source: ScrollerSource) { this.source = source; }

  setMode(mode: ScrollMode) {
    if (this.mode === mode) return;
    this.pause();
    this.track.replaceChildren(); // clear before CSS swap to avoid one-frame layout tear
    this.pos = 0;
    this.apply();
    this.mode = mode;
    this.applyModeClass();
    this.setSpeed(this.lastSpeed);
  }

  setSpeed(speed: Speed) {
    this.lastSpeed = speed;
    if (this.mode === "horizontal") {
      const probe = el("span", "item verse");
      probe.style.whiteSpace = "nowrap";
      probe.textContent = "MMMMMMMMMM"; // 10 ch probe
      const host = measure(probe, this.track);
      const cw = (probe.offsetWidth || 120) / 10;
      host.remove();
      this.pxPerSec = (SPEED_CPM[speed] * cw) / 60;
      return;
    }
    const probe = el("div", "item verse");
    probe.textContent = "x";
    const host = measure(probe, this.track);
    // Inherit stage typography roughly via copying computed font from track if present.
    const lh = parseFloat(getComputedStyle(probe).lineHeight) || 40;
    host.remove();
    this.pxPerSec = (SPEED_LPM[speed] * lh) / 60;
  }

  /** Clear and begin again at the start of the sequence (caller resets the source). */
  reset() {
    this.pause(); // never reset mid-tick — avoids double-RAF / torn frames
    this.track.replaceChildren();
    if (this.mode === "horizontal") {
      this.pos = this.stage.clientWidth;
      this.apply();
      this.spawnHorizontal();
    } else {
      this.pos = this.stage.clientHeight * 0.42;
      this.apply();
      this.fillVertical();
    }
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.last = performance.now();
    const myGen = this.gen;
    const tick = (t: number) => {
      if (!this.playing || myGen !== this.gen) return;
      const dt = Math.min(0.05, (t - this.last) / 1000); // tighter clamp = less jump after tab-focus
      this.last = t;
      this.pos -= this.pxPerSec * dt;
      if (this.mode === "horizontal") this.tickHorizontal();
      else {
        this.recycleVertical();
        this.fillVertical();
      }
      this.apply();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    this.gen++;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private applyModeClass() {
    this.stage.classList.toggle("mode-horizontal", this.mode === "horizontal");
    this.stage.classList.toggle("mode-vertical", this.mode === "vertical");
    document.body.classList.toggle("mode-horizontal", this.mode === "horizontal");
    document.body.classList.toggle("mode-vertical", this.mode === "vertical");
  }

  private apply() {
    if (this.mode === "horizontal") {
      this.track.style.transform = `translate3d(${this.pos.toFixed(2)}px, 0, 0)`;
    } else {
      this.track.style.transform = `translate3d(0, ${this.pos.toFixed(2)}px, 0)`;
    }
  }

  private fillVertical() {
    const want = this.stage.clientHeight * 2;
    let guard = 0;
    while (this.pos + this.track.offsetHeight < want && guard++ < 50) {
      const item = this.source.next();
      if (!item) break;
      this.track.append(renderItem(item, "vertical"));
    }
  }

  private recycleVertical() {
    let first = this.track.firstElementChild as HTMLElement | null;
    while (first) {
      const h = first.offsetHeight + parseFloat(getComputedStyle(first).marginBottom || "0");
      if (this.pos + h >= -this.stage.clientHeight * 0.25) break;
      first.remove();
      this.pos += h;
      first = this.track.firstElementChild as HTMLElement | null;
    }
  }

  /** Place the next item at the right edge (pos already = stage width on first spawn). */
  private spawnHorizontal() {
    if (this.track.childElementCount > 0) return;
    const item = this.source.next();
    if (!item) return;
    // Same LoopCursor order as vertical: verses first, then commentary chunks one-after-another.
    // Do not pair commentary under a verse — line 2 is unused until a henry item arrives.
    this.track.append(renderItem(item, "horizontal"));
  }

  /**
   * One line at a time: when the sole item has fully exited left, clear it and
   * spawn the next at the right edge. No multi-item strip → no recycle jumps.
   */
  private tickHorizontal() {
    const first = this.track.firstElementChild as HTMLElement | null;
    if (!first) {
      this.pos = this.stage.clientWidth;
      this.spawnHorizontal();
      return;
    }
    const w = first.offsetWidth;
    // Fully past the left edge (with a small cushion).
    if (this.pos + w < -24) {
      first.remove();
      this.pos = this.stage.clientWidth;
      this.spawnHorizontal();
    }
  }
}
