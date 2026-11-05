import type { LoopItem, Speed } from "./types";

/** Reading pace in lines per minute (≈150 / 200 / 270 wpm at ~10 words a line). Far slower than a ticker. */
export const SPEED_LPM: Record<Speed, number> = { slow: 15, medium: 20, fast: 27 };

export interface ScrollerSource { next(): LoopItem | null }

function el(tag: string, cls?: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function renderItem(item: LoopItem): HTMLElement {
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

/**
 * Continuous rAF scroll of a virtual column: items are appended below the fold as needed and
 * removed once they have scrolled off the top, so the DOM stays small for any range length.
 */
export class Scroller {
  private y = 0;
  private raf = 0;
  private last = 0;
  private pxPerSec = 0;
  playing = false;

  constructor(private stage: HTMLElement, private track: HTMLElement, private source: ScrollerSource, speed: Speed) {
    this.setSpeed(speed);
  }

  setSource(source: ScrollerSource) { this.source = source; }

  setSpeed(speed: Speed) {
    const probe = el("div", "item verse");
    probe.style.visibility = "hidden";
    probe.style.position = "absolute";
    probe.textContent = "x";
    this.track.append(probe);
    const lh = parseFloat(getComputedStyle(probe).lineHeight) || 40;
    probe.remove();
    this.pxPerSec = (SPEED_LPM[speed] * lh) / 60;
  }

  /** Clear and begin again at the top of the sequence (caller resets the source). */
  reset() {
    this.track.replaceChildren();
    this.y = this.stage.clientHeight * 0.42;
    this.apply();
    this.fill();
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.last = performance.now();
    const tick = (t: number) => {
      if (!this.playing) return;
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.y -= this.pxPerSec * dt;
      this.recycle();
      this.fill();
      this.apply();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  private apply() {
    this.track.style.transform = `translate3d(0, ${this.y.toFixed(2)}px, 0)`;
  }

  private fill() {
    const want = this.stage.clientHeight * 2;
    let guard = 0;
    while (this.y + this.track.offsetHeight < want && guard++ < 50) {
      const item = this.source.next();
      if (!item) break;
      this.track.append(renderItem(item));
    }
  }

  private recycle() {
    let first = this.track.firstElementChild as HTMLElement | null;
    while (first) {
      const h = first.offsetHeight + parseFloat(getComputedStyle(first).marginBottom || "0");
      if (this.y + h >= -this.stage.clientHeight * 0.25) break;
      first.remove();
      this.y += h;
      first = this.track.firstElementChild as HTMLElement | null;
    }
  }
}
