/**
 * First-visit welcome card (Word/Verse pattern): native modal <dialog>, shown once per
 * browser until dismissed. Esc, the close button, Continue, or a backdrop click dismiss it;
 * focus is trapped while open and returns to the page afterwards.
 * Copy lives in index.html (locked by Nate, 2026-11-06).
 */
import type { KV } from "./prefs";

export const WELCOME_KEY = "bible_scroller.welcome-seen";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function welcomeSeen(storage: KV): boolean {
  try { return storage.getItem(WELCOME_KEY) === "1"; } catch { return false; }
}

export function createWelcome(dlg: HTMLDialogElement, storage: KV, returnFocusTo?: () => HTMLElement | null) {
  const startBtn = dlg.querySelector<HTMLButtonElement>(".welcome-start")!;
  const closeBtn = dlg.querySelector<HTMLButtonElement>(".welcome-close")!;

  function open() {
    if (dlg.open) return;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    startBtn.focus();
  }

  function close() {
    if (!dlg.open && !dlg.hasAttribute("open")) return;
    try { storage.setItem(WELCOME_KEY, "1"); } catch { /* storage blocked: card shows next visit */ }
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
    returnFocusTo?.()?.focus();
  }

  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.addEventListener("keydown", (e) => {
    // Keep app shortcuts (Space = Start) from acting behind the card.
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...dlg.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hidden);
    if (!f.length) return;
    const first = f[0]!, last = f[f.length - 1]!, active = document.activeElement;
    if (e.shiftKey && (active === first || !dlg.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !dlg.contains(active))) { e.preventDefault(); first.focus(); }
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  closeBtn.addEventListener("click", close);
  startBtn.addEventListener("click", close);

  /** Show on first visit only. */
  function maybeOpen() { if (!welcomeSeen(storage)) open(); }

  return { open, close, maybeOpen, isOpen: () => dlg.open };
}
