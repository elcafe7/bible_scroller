/**
 * Typed GA4 helper for Scroll. Every call is a no-op unless public/ga-ap.js defined window.gtag,
 * which it only does on apocalypse.press (never offline / file:// / localhost / poeta).
 * Never send verse or commentary text, free text, or anything personal: ids, names of books,
 * numbers and fixed enum strings only.
 */
import type { Commentary, ScrollMode, Speed } from "./types";

export type GaSpeed = "very_slow" | "slow" | "medium" | "fast";
export type GaParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** Every event Scroll may send. Never plain "scroll" (reserved by GA enhanced measurement). */
export const SCROLL_EVENTS = [
  "reader_open", "scroll_start", "scroll_resume", "scroll_restart", "scroll_stop", "scroll_range_set",
  "scroll_commentary", "scroll_speed_change", "scroll_mode_change", "scroll_fullscreen",
  "scroll_complete", "offline_download",
] as const;
export type ScrollEvent = (typeof SCROLL_EVENTS)[number];

export const gaSpeed = (s: Speed): GaSpeed => s.replace("-", "_") as GaSpeed;

export function track(name: ScrollEvent, params?: GaParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const clean: Record<string, string | number | boolean> = { content_type: "scroll" };
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) clean[k] = v;
  try { window.gtag("event", name, clean); } catch { /* analytics must never break reading */ }
}

/** Trailing-edge debounce (speed radio: fire once with the final value). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => { t = undefined; fn(...args); }, ms);
  };
}

export const SPEED_DEBOUNCE_MS = 500;
export const trackSpeedChange = debounce((speed: Speed) => {
  track("scroll_speed_change", { scroll_speed: gaSpeed(speed) });
}, SPEED_DEBOUNCE_MS);

export const trackCommentary = (c: Commentary) => track("scroll_commentary", { commentary_source: c });
export const trackMode = (m: ScrollMode) => track("scroll_mode_change", { scroll_mode: m });
