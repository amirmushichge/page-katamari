# Changelog

## 1.9.0 — 2026-10-27

Public preview based on Alex's supplied 1.8.8 prototype.

- Added a playable public demo, extension download and installation instructions.
- Changed extension injection to run only after user invocation with activeTab and scripting. Removed persistent host access, automatic content scripts and unused storage access.
- Preserved original text-node identity and live text changes during restoration.
- Added Escape to stop, kept Stop reachable in the demo, and clarified controls.
- Replaced HUD HTML assignment with DOM construction for strict Trusted Types pages.
- Added local browser regressions, package checks and deterministic dependency-free packaging.

This is an experimental manually installed Chrome extension. Browser-protected pages, nested frames, shadow DOM and arbitrary live application behavior remain outside universal compatibility claims.
