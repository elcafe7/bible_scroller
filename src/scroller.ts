import type { LoopItem, ScrollMode, Speed } from "./types";

/** Reading pace in lines per minute (≈150 / 200 / 270 wpm at ~10 words a line). Far slower than a stock ticker. */
export const SPEED_LPM: Record<Speed, number> = { slow: 15, medium: 20, fast: 27 };

/** Horizontal ticker: characters per minute at reading pace (not flash-ticker speeds). */
export const SPEED_CPM: Record<Speed, number> = { slow: 900, medium: 1200, fast: 1620 };

export interface ScrollerSource { next(): LoopItem | null }

function el(tag: string, cls?: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function renderItem(item: LoopItem, mode: ScrollMode = "vertical"): HTMLElement {
  if (mode === "horizontal") return renderHorizontalItem(item);
  if (item.kind === "verse") {
    const n = el("article", "item verse");
    n.append(el("span", "ref", `${item.book} ${item.chapter}:${item.verse}`), el("p", "", item.text));
    return n;
  }
  const n = el("aside", "item henry");
  n.setAttribute("aria-label", "Matthew Henry");
  const span = item.verse_start === item.verse_end ? `${item.verse_start}` : `${item.verse_start}–${item.verse_end}`;
  const ref = el("span", "ref", `Matthew Henry · ${item.book} ${item.chapter}:${span}`);
  if (item.section_title) ref.append(" ", el("span", "title", item.section_title));
  n.append(ref);
  for (const para of item.text.split(/\n\s*\n/)) {
    const t = para.replace(/\s*\n\s*/g, " ").trim();
    if (t) n.append(el("p", "", t));
  }
  return n;
}

/** One-line strip: ref + body on a single nowrap row for the horizontal ticker. */
function renderHorizontalItem(item: LoopItem): HTMLElement {
  if (item.kind === "verse") {
    const n = el("article", "item verse");
    n.append(
      el("span", "ref", `${item.book} ${item.chapter}:${item.verse}`),
      el("span", "body", item.text.replace(/\s+/g, " ").trim()),
    );
    return n;
  }
  const n = el("aside", "item henry");
  n.setAttribute("aria-label", "Matthew Henry");
  const span = item.verse_start === item.verse_end ? `${item.verse_start}` : `${item.verse_start}–${item.verse_end}`;
  let label = `Matthew Henry · ${item.book} ${item.chapter}:${span}`;
  if (item.section_title) label += ` — ${item.section_title}`;
  n.append(
    el("span", "ref", label),
    el("span", "body", item.text.replace(/\s+/g, " ").trim()),
  );
  return n;
}

/**
 * Continuous rAF scroll. Vertical mode: virtual column of passage blocks.
 * Horizontal mode: single-line marquee, one verse (or Henry block) at a time.
 * Items are appended as needed and removed once off-screen so the DOM stays small.
 */
export class Scroller {
  private pos = 0; // y in vertical mode, x in horizontal
  private raf = 0;
  private gen = 0; // bumps on every pause so a stale tick cannot reschedule
  private last = 0;
  private pxPerSec = 0;
  private mode: ScrollMode = "vertical";
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
    this.mode = mode;
    this.applyModeClass();
    this.setSpeed(this.lastSpeed);
  }

  private lastSpeed: Speed = "medium";

  setSpeed(speed: Speed) {
    this.lastSpeed = speed;
    if (this.mode === "horizontal") {
      const probe = el("span", "item verse");
      probe.style.visibility = "hidden";
      probe.style.position = "absolute";
      probe.style.whiteSpace = "nowrap";
      probe.textContent = "MMMMMMMMMM"; // 10 ch probe
      this.track.append(probe);
      const cw = (probe.offsetWidth || 120) / 10;
      probe.remove();
      this.pxPerSec = (SPEED_CPM[speed] * cw) / 60;
      return;
    }
    const probe = el("div", "item verse");
    probe.style.visibility = "hidden";
    probe.style.position = "absolute";
    probe.textContent = "x";
    this.track.append(probe);
    const lh = parseFloat(getComputedStyle(probe).lineHeight) || 40;
    probe.remove();
    this.pxPerSec = (SPEED_LPM[speed] * lh) / 60;
  }

  /** Clear and begin again at the start of the sequence (caller resets the source). */
  reset() {
    this.track.replaceChildren();
    if (this.mode === "horizontal") {
      this.pos = this.stage.clientWidth;
    } else {
      this.pos = this.stage.clientHeight * 0.42;
    }
    this.apply();
    this.fill();
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.last = performance.now();
    const myGen = this.gen;
    const tick = (t: number) => {
      if (!this.playing || myGen !== this.gen) return;
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.pos -= this.pxPerSec * dt;
      this.recycle();
      this.fill();
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

  private fill() {
    if (this.mode === "horizontal") return this.fillHorizontal();
    const want = this.stage.clientHeight * 2;
    let guard = 0;
    while (this.pos + this.track.offsetHeight < want && guard++ < 50) {
      const item = this.source.next();
      if (!item) break;
      this.track.append(renderItem(item, "vertical"));
    }
  }

  private fillHorizontal() {
    // Keep enough strip to cover ~2× viewport ahead of the playhead.
    const want = this.stage.clientWidth * 2;
    let guard = 0;
    while (this.pos + this.track.scrollWidth < want && guard++ < 20) {
      const item = this.source.next();
      if (!item) break;
      this.track.append(renderItem(item, "horizontal"));
    }
  }

  private recycle() {
    if (this.mode === "horizontal") return this.recycleHorizontal();
    let first = this.track.firstElementChild as HTMLElement | null;
    while (first) {
      const h = first.offsetHeight + parseFloat(getComputedStyle(first).marginBottom || "0");
      if (this.pos + h >= -this.stage.clientHeight * 0.25) break;
      first.remove();
      this.pos += h;
      first = this.track.firstElementChild as HTMLElement | null;
    }
  }

  private recycleHorizontal() {
    let first = this.track.firstElementChild as HTMLElement | null;
    while (first) {
      const w = first.offsetWidth + parseFloat(getComputedStyle(first).marginRight || "0");
      if (this.pos + w >= -this.stage.clientWidth * 0.25) break;
      first.remove();
      this.pos += w;
      first = this.track.firstElementChild as HTMLElement | null;
    }
  }
}
