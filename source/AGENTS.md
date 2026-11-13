# Project constraints

- This is an independent extension and MCP server. Do not add a runtime dependency on Claude, Playwright, a provider account, desktop AI apps, or a specific model/harness. Playwright is only a development browser-test driver.
- Background behavior is a product requirement: use an explicit existing window, inactive tabs, DOM actions, and no screenshot/desktop-control tools. Never use a window-creation or focus fallback.
- Preserve per-session ownership and explicit user sharing. Agents must not control guessed tabs or close user-shared tabs.
- Use isolated temporary state and browser profiles for tests. Do not connect tests to the user's everyday Chrome profile or change global MCP registrations without an explicit request.
- Keep credentials outside the repository, package, tool output, URLs, and logs. Preserve pairing/revocation and browser permissions.
- No proprietary browser-extension source or binaries belong in this repository. Research informs behavior; implementation here is original MIT-licensed code.
- Run `npm test`, `npm run check`, and the real extension test for browser changes. `LATEEF_TEST_CHROMIUM` can select an already installed test Chromium.

## Website motion

Before editing website SVGs or animations, read [MOTION_GUIDE.md](MOTION_GUIDE.md). Use original project examples and tests. Do not copy course material into the repository. Preserve keyboard/pointer parity, reduced motion, explicit pause/replay and per-scene SVG definition IDs.
