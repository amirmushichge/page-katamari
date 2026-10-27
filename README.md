# Page Katamari

Roll through a webpage and collect its words, images, links and buttons. Stop the game to put them back.

**[Play the demo](https://amirmushichge.github.io/page-katamari/) · [Download the extension](https://github.com/amirmushichge/page-katamari/releases/latest) · [Report an issue](https://github.com/amirmushichge/page-katamari/issues)**

The demo runs on its own sample page. To play over a website you have open, install the desktop Chrome extension.

## Install the extension

1. Download `page-katamari-v1.9.0.zip` from [Releases](https://github.com/amirmushichge/page-katamari/releases/latest).
2. Unzip it into a permanent location. Keep the `page-katamari` folder.
3. Open `chrome://extensions` in desktop Chrome and turn on **Developer mode**.
4. Choose **Load unpacked** and select that `page-katamari` folder.
5. Pin **Page Katamari** from Chrome's Extensions menu.
6. Open a regular website, click the extension, then choose **Start collecting**.

This is an experimental unpacked extension, installed manually. It is not a Chrome Web Store listing. When updating, replace the files in the same folder and click Reload on `chrome://extensions`.

For a local `file://` page, enable **Allow access to file URLs** in the extension's Details screen.

## Controls

| Action | Control |
| --- | --- |
| Steer | Cursor, WASD, or arrow keys |
| Jump | Space or the on-page ↑ button |
| Stop and restore | Esc, on-page ×, or the extension's Stop button |
| Toggle extension | Ctrl+Shift+K; Command+Shift+K on macOS, if available |

In the web demo, a touch drag also steers the ball. Installing the extension requires desktop Chrome. Browser or operating-system shortcuts can override the suggested shortcut; change it at `chrome://extensions/shortcuts`.

## What to expect

Page Katamari reads and temporarily changes the rendered DOM of the active page. Collected elements retain a representation of their appearance. The game rescans when content is added or you scroll. Stop restores the text and element styles the game changed.

Complex live sites may rerender while you play. Restoration preserves original Text nodes and updates to their text, but arbitrary application changes cannot be guaranteed. Reload the tab if a site does not recover as expected. Use on ordinary browsing pages, and stop before editing or submitting anything.

Protected browser pages, the Chrome Web Store and the built-in PDF viewer cannot be modified. Embedded frames and shadow DOM are not traversed. Large canvases, videos and complex cards may have approximate representations. The playable demo uses the same game core, with original local artwork.

## Privacy

The extension requests only `activeTab` and `scripting`. It injects its code after you invoke the popup or keyboard shortcut. It does not register scripts to run on every site and does not request persistent host permissions.

There are no accounts, analytics, remote code or upload endpoints in this project. Fonts are bundled. The browser may still load assets belonging to the page you are playing on. The public demo is hosted on GitHub Pages; hosting requests are subject to GitHub's policies. See [PRIVACY.md](PRIVACY.md).

## Run or adapt with a coding agent

Give Codex or Claude Code this repository and ask:

> Set up Page Katamari locally, run its checks, and open the playable demo. Then help me customize the sample page. Keep work local until I approve publication.

The agent guide is [AGENTS.md](AGENTS.md). No package installation is needed. With Node.js 20 or newer:

```sh
npm run build
npm run check
npm run serve
```

Open the Local URL printed by the server. Run the browser regression suite at `/tests/fixture.html?pkqa`. `extension/` can also be loaded directly with **Load unpacked**. The web demo cannot inject the game into an unrelated website; that requires the extension.

## Source layout

- `extension/` — Manifest V3 extension, popup, game core and styles.
- `docs/` — GitHub Pages site, synchronized core, font, artwork and ready-to-use ZIP.
- `scripts/build.mjs` — dependency-free deterministic ZIP packager and demo synchronization.
- `scripts/check.mjs` — source, permissions, asset and package validation.
- `tests/` — browser regressions for collection and restoration, plus popup/background integration tests.

Edit `extension/content.js` and `extension/overlay.css`, then run the build. Their copies in `docs/assets/` are generated. The downloadable ZIP includes a single `page-katamari/` directory ready for Load unpacked.

## Credits and license

Published by [Amir Mušić](https://amirmushich.com). Original extension prototype by Alex. Public demo and release improvements prepared with Codex.

Inspired by [@measure_plan's Weball experiment](https://x.com/measure_plan/status/2106500440380600626), [playable here](https://www.funwithcomputervision.com/weball/). The reference is an inspiration credit; this repository does not claim ownership of that project.

Application code and original demo artwork: [MIT](LICENSE). The bundled Manrope font retains its [SIL Open Font License](extension/assets/OFL.txt).
