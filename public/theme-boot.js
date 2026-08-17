/**
 * Resolve the theme before the first paint.
 *
 * Loaded as a separate file rather than written inline in index.html: the
 * dashboard is served under `script-src 'self'`, and browsers refuse an inline
 * script under that directive — the console error Amir hit on 2026-08-11. A
 * same-origin file satisfies the policy without weakening it to 'unsafe-inline'
 * or introducing a nonce the static nginx config cannot mint per request.
 *
 * It must stay render-blocking and synchronous (no `defer`, no `type=module`):
 * the stylesheet and the React bundle both arrive later, so anything that waits
 * for them paints the light palette first and then corrects itself — a white
 * flash on exactly the setup that asked not to see white.
 *
 * Deliberately tiny, and duplicated in `src/hooks/useTheme.ts`, which owns the
 * same key and values from React's side.
 */
(function () {
  try {
    var stored = localStorage.getItem("linkmesh.theme");
    var dark =
      stored === "dark" ||
      ((stored === "system" || !stored) &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();
