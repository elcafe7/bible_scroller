/**
 * @vitest-environment happy-dom
 *
 * Settings percent inputs wired through the real main.ts boot (John 1 fixture):
 * typing applies and saves, junk reverts, out-of-range clamps, saved values restore on reload.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fsFetch } from "./helpers";

const ROOT = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(ROOT, "index.html"), "utf8");

describe("settings: text size % and speed % inputs", () => {
  it("markup: labelled number inputs 50–300, keyboard reachable, existing controls untouched", () => {
    for (const [id, text] of [["speed-pct", "Speed %"], ["size-pct", "Size %"]] as const) {
      const input = new RegExp(`<input id="${id}" type="number"[^>]*min="50" max="300"`).test(html);
      expect(input, id).toBe(true);
      expect(html).toContain(`<label class="pct" for="${id}"><span>${text}</span>`);
      expect(html).not.toMatch(new RegExp(`id="${id}"[^>]*tabindex="-1"`));
    }
    for (const label of ["Very Slow", "Slow", "Medium", "Fast", "Vertical", "Ticker"]) expect(html).toContain(`>${label}</button>`);
  });

  it("typing applies live, Enter/change clamps and saves, junk reverts, reload restores", async () => {
    const bodyHtml = html.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!.replace(/<script[\s\S]*?<\/script>/g, "");
    document.body.className = "state-stopped mode-vertical";
    document.body.innerHTML = bodyHtml;
    localStorage.clear();
    localStorage.setItem("bible_scroller.welcome-seen", "1");
    const ff = fsFetch(resolve(ROOT, "fixtures/john1"));
    vi.stubGlobal("fetch", (url: string) => ff(String(url)));
    await import("../src/main");
    await vi.waitFor(() => expect(document.getElementById("boot")).toBeNull(), { timeout: 5000 });

    const size = document.getElementById("size-pct") as HTMLInputElement;
    const speed = document.getElementById("speed-pct") as HTMLInputElement;
    const saved = () => JSON.parse(localStorage.getItem("bible_scroller.v1")!);
    const type = (el: HTMLInputElement, v: string) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
    const commit = (el: HTMLInputElement) => el.dispatchEvent(new Event("change", { bubbles: true }));

    expect(size.value).toBe("100");
    expect(speed.value).toBe("100");
    expect(document.body.style.getPropertyValue("--font-scale")).toBe("1");

    type(size, "150");
    expect(document.body.style.getPropertyValue("--font-scale")).toBe("1.5");
    expect(size.value).toBe("150");
    commit(size);
    expect(saved().fontPct).toBe(150);

    type(speed, "40"); // out of range while typing: not applied yet, field left alone
    expect(speed.value).toBe("40");
    expect(saved().speedPct).toBe(100);
    commit(speed);
    expect(speed.value).toBe("50");
    expect(saved().speedPct).toBe(50);

    type(speed, "9999");
    commit(speed);
    expect(speed.value).toBe("300");
    expect(saved().speedPct).toBe(300);

    type(size, "");
    commit(size); // empty reverts to the saved value
    expect(size.value).toBe("150");
    type(size, "abc"); // type=number yields "" for junk, same revert
    commit(size);
    expect(size.value).toBe("150");
    expect(saved().fontPct).toBe(150);

    type(size, "87");
    speed.focus();
    size.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(saved().fontPct).toBe(87);
    expect(document.body.style.getPropertyValue("--font-scale")).toBe("0.87");

    // Presets still work and keep the percent.
    (document.querySelector('[data-size="xl"]') as HTMLButtonElement).click();
    (document.querySelector('[data-speed="slow"]') as HTMLButtonElement).click();
    expect(saved()).toMatchObject({ fontSize: "xl", fontPct: 87, speed: "slow", speedPct: 300 });
    vi.unstubAllGlobals();
  });
});
