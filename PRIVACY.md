# Privacy

Page Katamari operates on the current page in the browser. It reads rendered text and visual properties to make collectibles, then temporarily hides or wraps those elements while the game is active. Stop restores the changes recorded by the game.

The extension uses `activeTab` and `scripting`. Access is granted when the user invokes it. There are no persistent host permissions, automatic content scripts, storage permission, cookies API, account system, analytics or upload endpoint.

Page content is not sent to an application server. Images, video or other assets belonging to the original webpage may still be requested by the browser. Bundled local fonts are used for the controls.

The web demo is a static GitHub Pages site. Visiting it makes ordinary hosting requests to GitHub; see [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). The demo does not inspect another browser tab.

This project has no telemetry service. If you choose to report an issue on GitHub, the information you submit is visible under GitHub's issue and repository visibility settings. Avoid including private page content in a public report.
