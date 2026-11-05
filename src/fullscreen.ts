/**
 * Fullscreen with CSS full-viewport fallback (ticker/news D17 pattern).
 * enter() must run synchronously inside a user-gesture handler.
 */

let exitCb: (() => void) | null = null;
let enteredFs = false;
let failed = false;

function fsEl(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function init(onExit: () => void) {
  exitCb = onExit;
  const handler = () => {
    if (fsEl()) {
      enteredFs = true;
      return;
    }
    if (enteredFs) {
      enteredFs = false;
      exitCb?.();
    }
  };
  document.addEventListener("fullscreenchange", handler);
  document.addEventListener("webkitfullscreenchange", handler);
}

function fallback() {
  failed = true;
  document.body.classList.add("is-fullviewport");
}

/** Fullscreen API when available; otherwise CSS is-fullviewport. Call from a click handler. */
export function enter(): Promise<boolean> {
  failed = false;
  document.body.classList.add("is-fullviewport");
  const de = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
  };
  let p: Promise<void> | null = null;
  try {
    if (typeof de.requestFullscreen === "function") {
      p = de.requestFullscreen({ navigationUI: "hide" });
    } else if (typeof de.webkitRequestFullscreen === "function") {
      de.webkitRequestFullscreen();
      return Promise.resolve(false);
    } else {
      fallback();
      return Promise.resolve(false);
    }
  } catch {
    fallback();
    return Promise.resolve(false);
  }
  return Promise.resolve(p).then(
    () => true,
    () => {
      fallback();
      return false;
    },
  );
}

/** CSS-only full viewport (no Fullscreen API). */
export function enterWindow() {
  failed = false;
  enteredFs = false;
  document.body.classList.add("is-fullviewport");
}

export function exit() {
  document.body.classList.remove("is-fullviewport");
  enteredFs = false;
  const el = fsEl();
  if (!el) return;
  try {
    const d = document as Document & { webkitExitFullscreen?: () => void };
    const p = document.exitFullscreen
      ? document.exitFullscreen()
      : d.webkitExitFullscreen
        ? Promise.resolve(d.webkitExitFullscreen())
        : null;
    if (p && typeof (p as Promise<void>).catch === "function") {
      (p as Promise<void>).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

export function didFail() {
  return failed;
}
