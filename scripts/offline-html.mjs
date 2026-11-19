// Offline-zip rewrite of the built index.html (used by pack-zip.mjs; unit-tested in tests/offline-html.test.ts).
// The online page links the GitHub zip; inside the zip that link is pointless, so:
//  - welcome card P3 becomes plain text saying this copy is already on the device;
//  - the footer download line is replaced by the version ("Scroll 0.1.0");
//  - the credit line gains a Donate link (offline copies only);
//  - the Google Analytics loader tag is removed (offline copies never send analytics).

export const ONLINE_OFFLINE_SENTENCE = "Take Scroll offline for distraction-free reading.";
export const DONATE_URL = "https://jesuspeoplesf.com/donate/";
export const OFFLINE_CARD_SENTENCE = "This copy is already on your device for distraction-free reading.";

/** @param {string} html built dist/index.html  @param {string} version package.json version */
export function offlineHtml(html, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`offline-html: bad version ${version}`);
  let card = 0, foot = 0;
  const out = html
    .replace(/\s*<script src="\.\/ga-ap\.js" defer><\/script>/g, "")
    .replace(/<p><a class="welcome-offline" data-offline-link [^>]*>[\s\S]*?<\/a><\/p>/, () => {
      card++;
      return `<p>${OFFLINE_CARD_SENTENCE}</p>`;
    })
    .replace(/<p class="offline-dl" data-offline-line>[\s\S]*?<\/p>/, () => {
      foot++;
      return `<p class="offline-dl offline-version">Scroll ${version}</p>`;
    })
    .replace(/(<a href="\.\/LICENSE">MIT License<\/a>)(<\/p>)/, (_m, lic, end) => {
      foot++;
      return `${lic} · <a href="${DONATE_URL}" target="_blank" rel="noopener noreferrer">Donate</a>${end}`;
    });
  if (card !== 1 || foot !== 2) throw new Error("offline-html: welcome-card link or footer download line not found");
  if (/ga-ap\.js|googletagmanager|G-0M3SF90ZGN|gtag/.test(out)) throw new Error("offline-html: analytics left in the offline index.html");
  if (/data-offline-link|data-offline-line/.test(out)) throw new Error("offline-html: offline download link left in index.html");
  const dialog = out.match(/<dialog class="welcome"[\s\S]*?<\/dialog>/)?.[0] ?? "";
  if (!dialog.includes(OFFLINE_CARD_SENTENCE) || out.includes(ONLINE_OFFLINE_SENTENCE)) {
    throw new Error("offline-html: the take-offline sentence would still appear in the offline copy");
  }
  return out;
}
