/* Scroll on apocalypse.press: ONE Google Analytics page_view per page load, nothing else.
 * Hostname guard: never loads or sends from localhost, file://, poeta.icu or previews.
 * Not shipped in the offline zip (scripts/pack-zip.mjs drops it; offline-html.mjs strips the tag).
 *
 * What it does (same pattern as Verse's ga.752b4203e1a0.js):
 *  - Runs only on apocalypse.press / www.apocalypse.press.
 *  - Loads gtag.js async, config with send_page_view:false, then sends exactly one page_view with a
 *    generic page_location /scroll/ and title "Scroll" (no passage, no query, no fragment).
 *  - Right after that hit is dispatched (event_callback), sets the official opt-out flag
 *    window['ga-disable-G-0M3SF90ZGN'] = true (event_timeout 5000 as fallback), so gtag sends
 *    nothing more from this page: no history-change page views, no scroll / outbound-click /
 *    form / download / video events, no user_engagement on leave.
 *  - Google signals and ad personalization are off. Adds no listeners and exposes no window.gtag.
 *  - ?ga_internal=1 stores localStorage.ga_internal=1 (traffic_type=internal on the hit);
 *    ?ga_internal=0 clears it. ?ga_debug=1 adds debug_mode:true. Flags are read from the query
 *    or the hash's query.
 */
(function () {
  'use strict';
  var ID = 'G-0M3SF90ZGN';
  var HOST = 'apocalypse.press';
  var h = location.hostname;
  if (!/^G-[A-Z0-9]+$/.test(ID) || (h !== HOST && h !== 'www.' + HOST)) return;
  if (window['ga-disable-' + ID]) return;

  var hashQuery = (location.hash.split('?')[1] || '');
  var flags = location.search.replace(/^\?/, '') + '&' + hashQuery;
  var has = function (re) { return re.test('&' + flags + '&'); };
  var internal = false;
  try {
    if (has(/&ga_internal=1&/)) localStorage.setItem('ga_internal', '1');
    if (has(/&ga_internal=0&/)) localStorage.removeItem('ga_internal');
    internal = localStorage.getItem('ga_internal') === '1';
  } catch (e) { internal = has(/&ga_internal=1&/); }
  var debug = has(/&ga_debug=1&/);

  var dl = window.dataLayer = window.dataLayer || [];
  var gtag = function () { dl.push(arguments); };
  var sent = false;
  var stop = function () { if (!sent) { sent = true; window['ga-disable-' + ID] = true; } };

  var cfg = {
    send_page_view: false,
    page_location: location.origin + '/scroll/',
    page_path: '/scroll/',
    page_title: 'Scroll',
    content_group: 'scroll',
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  };
  if (internal) cfg.traffic_type = 'internal';
  if (debug) cfg.debug_mode = true;

  gtag('js', new Date());
  gtag('config', ID, cfg);
  gtag('event', 'page_view', { send_to: ID, event_callback: stop, event_timeout: 5000 });

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
  (document.head || document.documentElement).appendChild(s);
})();
