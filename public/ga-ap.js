/* GA4 for apocalypse.press/scroll/ only (G-0M3SF90ZGN, property apocalypse.press).
 * Hostname guard: never loads or sends from localhost, file://, poeta.icu or previews.
 * Not shipped in the offline zip (scripts/pack-zip.mjs drops it; offline-html.mjs strips the tag).
 * ?ga_internal=1 / ?ga_internal=0 toggles traffic_type=internal; ?ga_debug=1 sets debug_mode.
 * No Consent Mode, no Google Signals / ad personalization (matches the rest of apocalypse.press).
 */
(function () {
  if (!/(^|\.)apocalypse\.press$/i.test(location.hostname)) return;

  var MEASUREMENT_ID = 'G-0M3SF90ZGN';
  var qs = location.search;
  try {
    if (/[?&]ga_internal=1/.test(qs)) localStorage.setItem('ga_internal', '1');
    if (/[?&]ga_internal=0/.test(qs)) localStorage.removeItem('ga_internal');
  } catch (e) { /* storage blocked */ }

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());

  var cfg = {
    content_group: 'scroll',
    content_type: 'scroll',
    section: 'scroll',
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  };
  var internal = false;
  try { internal = localStorage.getItem('ga_internal') === '1'; } catch (e) { /* ignore */ }
  if (internal) cfg.traffic_type = 'internal';
  if (/[?&]ga_debug=1/.test(qs)) cfg.debug_mode = true;

  gtag('config', MEASUREMENT_ID, cfg);
})();
