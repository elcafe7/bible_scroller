/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { createWelcome, WELCOME_KEY, welcomeSeen } from "../src/welcome";
import type { KV } from "../src/prefs";

function setup(store = new Map<string, string>()) {
  document.body.innerHTML = `<button id="opener">x</button>
    <dialog id="welcome"><div><button class="welcome-close">x</button><p>hi</p><button class="welcome-start">Continue</button></div></dialog>`;
  const kv: KV = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
  const dlg = document.getElementById("welcome") as HTMLDialogElement;
  const w = createWelcome(dlg, kv, () => document.getElementById("opener"));
  return { dlg, w, kv, store };
}

describe("welcome card", () => {
  it("opens on first visit, Continue dismisses and remembers", () => {
    const { dlg, w, kv } = setup();
    expect(welcomeSeen(kv)).toBe(false);
    w.maybeOpen();
    expect(dlg.open).toBe(true);
    (dlg.querySelector(".welcome-start") as HTMLButtonElement).click();
    expect(dlg.open).toBe(false);
    expect(kv.getItem(WELCOME_KEY)).toBe("1");
    expect(document.activeElement?.id).toBe("opener");
  });
  it("close button and Escape also dismiss", () => {
    let { dlg, w } = setup();
    w.maybeOpen();
    (dlg.querySelector(".welcome-close") as HTMLButtonElement).click();
    expect(dlg.open).toBe(false);
    ({ dlg, w } = setup());
    w.maybeOpen();
    dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dlg.open).toBe(false);
  });
  it("stays dismissed on later visits", () => {
    const { dlg, w } = setup(new Map([[WELCOME_KEY, "1"]]));
    w.maybeOpen();
    expect(dlg.open).toBe(false);
  });
});
