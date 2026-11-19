/** Screen Wake Lock while scrolling — no-op when unsupported or denied. */

type WakeLockSentinelLike = { released: boolean; release(): Promise<void>; addEventListener(type: "release", fn: () => void): void };

let sentinel: WakeLockSentinelLike | null = null;
let want = false;

function api(): { request(type: "screen"): Promise<WakeLockSentinelLike> } | null {
  const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
  return wl ?? null;
}

async function acquire() {
  const wl = api();
  if (!wl || !want || document.hidden) return;
  if (sentinel && !sentinel.released) return;
  try {
    sentinel = await wl.request("screen");
    sentinel.addEventListener("release", () => { sentinel = null; });
  } catch {
    sentinel = null; // unsupported permission / battery / policy — fine
  }
}

/** Hold the screen awake while scrolling. Safe to call repeatedly. */
export async function request(): Promise<void> {
  want = true;
  await acquire();
}

/** Release on stop / Esc / back to settings. */
export async function release(): Promise<void> {
  want = false;
  const s = sentinel;
  sentinel = null;
  if (!s || s.released) return;
  try { await s.release(); } catch { /* ignore */ }
}

/** Re-acquire after tab focus if we still want the lock (some browsers drop it on hide). */
export function init() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (want) void acquire();
  });
}
