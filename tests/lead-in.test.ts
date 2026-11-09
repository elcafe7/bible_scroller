/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { leadInOffset, Scroller, type ScrollerSource } from "../src/scroller";
import type { LoopItem } from "../src/types";

/** Stage that reads 0×0 while hidden (settings view, display:none) and W×H once shown. */
function stageDom(w = 1280, h = 800) {
  document.body.innerHTML = `<main id="stage" hidden><div id="track"></div></main>`;
  document.body.className = "mode-vertical size-m";
  const stage = document.getElementById("stage")!;
  const track = document.getElementById("track")!;
  const size = { w, h };
  Object.defineProperty(stage, "clientWidth", { configurable: true, get: () => (stage.hidden ? 0 : size.w) });
  Object.defineProperty(stage, "clientHeight", { configurable: true, get: () => (stage.hidden ? 0 : size.h) });
  return { stage, track, size };
}

function genesis(): ScrollerSource {
  let v = 0;
  return {
    next: (): LoopItem => ({ kind: "verse", book: "Genesis", chapter: 1, verse: ++v, text: "In the beginning God created the heauen and the earth." }),
  };
}

describe("fresh-start lead-in (Genesis 1:1 rises from the bottom)", () => {
  it("leadInOffset sits near the bottom, above safe area, and is 0 for an unlaid stage", () => {
    expect(leadInOffset(800, 0, 46)).toBe(688); // 86% cap
    expect(leadInOffset(844, 34, 34)).toBe(726);
    expect(leadInOffset(300, 40, 60)).toBe(140); // short stage: clear safe area + 2 lines
    expect(leadInOffset(0)).toBe(0);
  });

  it("Start: reset while the stage is hidden still places the first verse near the bottom on play", () => {
    const { stage, track } = stageDom();
    const s = new Scroller(stage, track, genesis(), "medium", "vertical");
    s.reset(); // applyStart runs while settings are showing
    expect(s.offset).toBe(0);
    stage.hidden = false; // showStage()
    s.play();
    s.pause();
    expect(s.offset).toBeGreaterThan(800 * 0.5);
    expect(s.offset).toBeLessThanOrEqual(800 * 0.86);
    expect(track.style.transform).toContain(`${s.offset.toFixed(2)}px`);
    expect(track.firstElementChild?.querySelector(".ref")?.textContent).toBe("Genesis 1:1");
  });

  it("Resume keeps the saved position exactly (no second lead-in)", () => {
    const { stage, track } = stageDom(390, 844);
    const s = new Scroller(stage, track, genesis(), "very-slow", "vertical");
    s.reset();
    stage.hidden = false;
    s.play();
    s.pause();
    const saved = s.offset;
    stage.hidden = true; // stop() → settings
    stage.hidden = false; // Resume → showStage()
    s.play();
    expect(s.offset).toBe(saved);
    s.pause();
  });

  it("Restart applies the lead-in again", () => {
    const { stage, track } = stageDom();
    const s = new Scroller(stage, track, genesis(), "fast", "vertical");
    s.reset(); stage.hidden = false; s.play(); s.pause();
    const first = s.offset;
    stage.hidden = true;
    s.reset(); stage.hidden = false; s.play(); s.pause();
    expect(s.offset).toBe(first);
  });

  it("fullscreen settling: a still-rising lead-in stays bottom-anchored on resize", () => {
    const { stage, track, size } = stageDom(1280, 700);
    const s = new Scroller(stage, track, genesis(), "medium", "vertical");
    s.reset(); stage.hidden = false; s.play(); s.pause();
    const before = s.offset;
    size.h = 800;
    s.onResize();
    expect(s.offset).toBe(before + 100);
  });

  it("horizontal: fresh start enters from the right edge, not x=0", () => {
    const { stage, track } = stageDom(800, 400);
    document.body.className = "mode-horizontal size-m";
    const s = new Scroller(stage, track, genesis(), "medium", "horizontal");
    s.reset();
    stage.hidden = false;
    s.play();
    s.pause();
    expect(s.offset).toBe(800);
    expect(track.childElementCount).toBe(1);
  });
});
