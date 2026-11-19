/** User percent tuning for text size and speed, applied on top of the chosen preset. */
export const PCT_MIN = 50;
export const PCT_MAX = 300;
export const PCT_DEFAULT = 100;

/** Clamp to [50, 300] and round to a whole number; anything that is not a finite number falls back to 100. */
export function clampPct(v: unknown): number {
  const n = typeof v === "string" ? (v.trim() === "" ? NaN : Number(v)) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return PCT_DEFAULT;
  return Math.min(PCT_MAX, Math.max(PCT_MIN, Math.round(n)));
}
