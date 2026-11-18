# Lateef

**Your agent can browse. You can keep working.**

An independent MIT-licensed Chrome extension and local MCP companion for AI agents. Use an existing signed-in Chrome profile, an explicitly chosen window, and inactive agent tabs. No Claude executable, provider account, screenshots, desktop-control tools or debugger permission are required by the runtime.

**0.2.0-beta.9 — developer beta.** The companion is on npm as `lateef`. The extension is loaded unpacked because it is not on the Chrome Web Store. macOS has everyday use; Linux and Windows pass the automated tests.

## Install

Requires Node.js 22+, Chrome, and an MCP-compatible client.

1. Register Lateef with your AI client: `npx lateef install codex` (or `claude`, or `cursor`). It uses the client's own command where there is one and keeps a copy of any config file it changes. For another client, run `npx lateef config` and paste the result into its MCP settings; add `--toml` for TOML.
2. Run `npx lateef extension`. It copies the extension to `~/lateef-extension`. In the intended Chrome profile, open `chrome://extensions`, enable Developer mode and load that folder unpacked.
3. Run `npx lateef pair`. Enter the displayed one-time code and port in Lateef's popup in the intended existing Chrome window. Do not share the code.
4. Start a new session in your client and run `npx lateef doctor`. Confirm that `browser_status` returns the expected browser and current capabilities.

`npm install -g lateef` gives you the plain `lateef` command. To work from source instead, download the source release, run `npm ci`, and use `node bin/lateef.mjs` wherever these steps say `npx lateef`. Install only the package named exactly `lateef`; do not run a similarly named package.

Lateef is not tied to one AI subscription. Each client, and each Claude Code account (every `CLAUDE_CONFIG_DIR`), keeps its own list of tools, so run `lateef install` once in each. They all share the same paired Chrome. Register Lateef natively like this rather than through a hand-made stdio-to-HTTP bridge: a bridge started as a background task can be killed by the client's time limits, and it doesn't renew the session lease, so its tabs end up orphaned. If a session was started before Lateef was installed, start a new one.

Keep the extension folder in place. The store edition is not yet available. Clients need both the local companion and extension: installing the extension alone does not configure the AI client.

## Browser tools

| Tool | Purpose |
|---|---|
| browser_status | Connection, companion/broker/extension versions and capabilities; upgrade hints |
| browser_tabs | action: list, new, close; new tabs are inactive in the paired window |
| browser_navigate | Navigate a controlled tab without activating it |
| browser_snapshot | Page text and fresh references; links include resolved href/target |
| browser_find | Label search with fresh references and explicit truncation |
| browser_text | Page as plain text, no references; the cheap way to read content |
| browser_wait | Wait in the page for text to appear or go, instead of polling |
| browser_scroll | Scroll by a screen, to top or bottom, or to an element |
| browser_hover | Pointer-over events on an element, for hover menus |
| browser_press | One key on an element as DOM events; Enter submits a form field |
| browser_history | Back, forward or reload, without activating the tab |
| browser_downloads | Files this session caused Chrome to download, with path and state |
| browser_screenshot | *Full control.* A JPEG of the tab's viewport, taken in the background |
| browser_input | *Full control.* Real mouse and keyboard: click, drag, scroll, type, keys |
| browser_evaluate | *Full control.* Run a JavaScript expression in the page |
| browser_console | *Full control.* Console messages and uncaught errors |
| browser_network | *Full control.* Requests with method, URL, type and status |
| browser_batch | Up to 20 steps on one tab in a single call; stops at the first failure |
| browser_fill | DOM-fill a field; no desktop keystrokes |
| browser_click | DOM-click a referenced element |
| browser_upload | Attach explicitly authorized local files to a referenced file input |

Start with status, create a tab, snapshot, act using its references, verify, and close the owned tab. A new snapshot/find invalidates older references. Never automatically retry a mutation after a timeout: it may already have run.

Each session sees only its own tabs and tabs explicitly shared through the popup. An agent cannot close a user-shared tab. A closed/moved selected window produces an error; there is no new-window or focus fallback. Arbitrary page scripts can still cause browser behaviour outside the bridge's guarantees.

## Attachments

Choose a `file` reference in a snapshot, including hidden file inputs. Call browser_upload with `tabId`, `ref`, the exact `expectedOrigin` (such as `https://example.com`), and 1–4 absolute local `paths` explicitly authorized by the user. Total size is capped at 2 MiB. Paths are read locally; basenames and file bytes are sent to the selected website through its input/change handlers. Uploading can immediately transmit a file. The tool does not submit the form itself, but the site's event handlers may upload or submit automatically.

By default hidden files/directories (such as `.ssh`), `~/Library` and the Lateef state directory are refused; set `LATEEF_UPLOAD_ROOTS` (path-delimited absolute directories) to restrict uploads to specific folders.

**Full control.** Five tools use Chrome's debugger, which the standard extension does not ask for. To use them, run `lateef extension --full`, load the `~/lateef-extension-full` folder at `chrome://extensions` instead of the standard one, pair it, and tick **Full control** in its popup. Chrome shows its "started debugging this browser" bar while a tab is attached. Lateef attaches only to tabs an agent controls, only when one of these tools is first used there, and detaches when the session ends or the switch is turned off. Screenshots and real input work on background tabs; the tab is not activated. With the standard extension these tools return an error that says what to do.

**Seeing the agent at work.** The toolbar icon counts the tabs an agent controls. Tabs the agent opens are collected in an orange “Lateef” tab group; tabs you share stay where they are. A controlled page shows a small chip in a corner that says what the agent is doing, and a little flag that hops to the element being clicked, filled or attached. The chip steps aside when your mouse comes near. The flag is a drawing: actions remain DOM actions. Turn the group and page markers off in the popup. A page can detect the marker element, so sites can tell Lateef is in use on that tab.

Only regular files are supported; symlinks are rejected where the OS supports no-follow file opens. Site `accept` filters are hints, not a guarantee that the server will accept a file. The DOM FileList path is tested against an owned local HTTP upload fixture. Attaching a file to a Gmail draft was verified on macOS on 2026-11-13 (the attachment appeared in the draft, which was then discarded); a sent message with an attachment has not been re-checked with this beta. File-picker-only and trusted-event-dependent sites may not work.

## Bounds and limitations

Snapshots/find: maxChars 500–20000 (default 8000), semantic depth 1–30 (default 12), 300 reference nodes and 20000 scanned elements. Layout wrappers do not consume semantic depth. Results include truncated, truncationReasons and effective limits. Find accepts maxChars/depth. Virtualized content absent from the DOM cannot be captured.

Navigation waits up to ten seconds for document load, which does not imply SPA render completion. Poll for expected page content. Snapshots include iframes, and a reference that starts with `f<number>.` acts inside its frame. Closed shadow roots, password entry, downloads, arbitrary page JavaScript, canvas-only UI and trusted hardware events are unsupported. DOM fill on contenteditable offers the text to the editor as a plain-text paste, and falls back to replacing the element's contents; it does not preserve rich formatting, and in an editor that already has text the paste may be inserted rather than replace it. The grid/deep-wrapper changes passed local regressions, and a live snapshot of Gmail’s Sent list returned its rows and cells on 2026-11-13.

## Updates, privacy and lifecycle

The local broker persists across MCP sessions. Session closure cleans owned tabs; `node bin/lateef.mjs stop` stops the shared broker. To upgrade from npm: close active MCP clients, run `npx lateef@latest stop`, `npx lateef@latest install <client>` and `npx lateef@latest extension`, reload the extension, and reconnect clients. From source: stop the broker, replace source, run npm ci, reload the extension, and reconnect clients. Moving from unpacked to a store extension may require pairing again because extension IDs differ.

State defaults to ~/.config/lateef; LATEEF_STATE_DIR overrides it. Pairing codes/tokens are kept outside the source release. Doctor reports mismatched versions without stopping another session or silently replacing the broker.

The bridge has no analytics or hosted backend. Selected page content and attached files pass to your MCP client and may be sent to its AI provider. **Local bridge does not mean all browser data stays on your device.** See [privacy](PRIVACY.md) and [security](SECURITY.md).

## Development

Run `npm test`, `npm run check`, and `npm run test:browser`. Playwright is only a development driver and uses temporary isolated profiles. Supply an installed extension-capable test Chromium with LATEEF_TEST_CHROMIUM, or install one using `npx playwright-core install chromium`. Run `npm run release:prepare` to assemble the sanitized review export and packages. See [contributing](CONTRIBUTING.md) and the [model-facing SVG motion guide](MOTION_GUIDE.md).

The implementation is original and independent. No proprietary extension source/binaries, browser profiles or provider credentials are included. The runtime has no dependency on another AI provider's browser integration.
