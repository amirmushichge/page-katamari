# Page Katamari agent guide

Use this repository to run the included example before proposing changes. Keep source work local unless the user explicitly asks to publish. Do not upload browsing data or the contents of another site.

## First run

1. Discover Node.js. Version 20+ is sufficient; there are no npm dependencies to install.
2. Run `npm run build`, then `npm run check`.
3. Start `npm run serve`. The server binds only to 127.0.0.1; PORT can select a different free port.
4. Open the printed Local URL. Confirm Play creates the ball; test steering, jumping and Stop/Esc restoring the page.
5. Open `/tests/fixture.html?pkqa` on that server and run the regression suite. Read its visible JSON result; all boolean checks must pass and `errors` must be empty.
6. For extension installation use an isolated development browser profile if the available tools support it. Load `extension/` with Chrome's Load unpacked flow, invoke its popup, and check the shortcut. Do not change the user's regular browser profile without authorization. If extension integration cannot be tested, state that limit; do not call the web-core test an extension-install test.

## Editing and release

The authoritative core is `extension/content.js` and `extension/overlay.css`. Build synchronizes the copies in `docs/assets/`. Preserve the game look and physics unless the user requests a change. Scope visual edits to the demo when the task concerns the demo.

The game rewrites text temporarily. Preserve original Text-node identity and live text updates when restoring; run browser regressions after changes. Keep controls reachable at high zoom and narrow sizes. Use DOM construction rather than HTML sinks so strict Trusted Types pages do not reject the HUD.

Keep extension access limited to activeTab and scripting. Do not add persistent host permissions or automatic content scripts to solve an injection issue. Access to the original page's resources is governed by the browser.

The demo is a static page served from `docs/`. It contains original local SVG artwork, the local Manrope font and the same game engine. No build framework, cloud service, API key or paid generation is needed. Never imply it can inject into arbitrary sites from a URL field.

For release: update the manifest/package/site/README version together, build and check, verify the ZIP with an independent ZIP reader, run browser regressions and responsive checks, then publish only the intended files. Include the ZIP and SHA256SUMS in a tagged GitHub release. GitHub Pages serves `docs/` from main. Preserve all MIT and OFL notices and the inspiration credit. Keep evidence, local profiles, handoff documents and screenshots outside the public source unless expressly selected for publication.
