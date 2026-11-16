# Changelog

## 0.2.0-beta.7

Upgrading: as for beta 6, update the companion and the extension together.

Fixes from posting on LinkedIn, X and Slack through Lateef (16 November 2026):

- `browser_click` sends pointer and mouse down/up before the click, so controls that act on mousedown (Slack's sidebar, X's composer buttons) respond.
- `browser_find` searches the whole page instead of stopping at the snapshot's 300-element limit, so a control near the end of a long page (a thread's "Also send" checkbox) is found.
- `browser_input` takes `ref` from a snapshot instead of coordinates, aiming at the element itself; `type` with `ref` clicks the element first.
- `browser_input` type turns line breaks into Shift+Enter, which breaks the line without sending a chat message; `newline: "Enter"` types plain Enter.
- `browser_input` key: Meta or Control with A, C, X, V, Z run select all, copy, cut, paste and undo, which simulated keys did not do on macOS.

## 0.2.0-beta.6

Upgrading: close your AI client, run `npx lateef@latest stop`, re-run the install command for your client, run `npx lateef@latest extension` and reload the extension in Chrome. Update both together: a beta 6 extension will not connect to an older companion. A beta 6 companion still accepts older extensions.

Fixes from the Gmail and Google Cloud billing field report (15 November 2026):

- Custom controls get references. A `<label>` around a hidden radio or checkbox stands in for it, and elements with ARIA roles such as radio, checkbox, switch, combobox, option, menuitem and tab are actionable. Names follow aria-labelledby before aria-label. Snapshots show checked, expanded/collapsed and a custom select's current choice. `browser_fill` with true/false sets custom radios, checkboxes and switches.
- `browser_text` reads an open modal or large dialog (such as an attachment viewer) instead of the page underneath, and says which it read (`scope`). `scope: "page"` reads everything; `selector` reads one element.
- `browser_snapshot`, `browser_find` and `browser_wait` take `selector` to read inside one element, and `frames: false` to skip iframes such as chat widgets.
- `browser_wait` looks in every frame, and returns the current title and URL.
- `browser_navigate` and `browser_tabs` action:"new" take `expect`: text the new view shows. They wait up to 10 seconds for it before returning or reading, so an agent does not act on the previous view of a client-rendered app.
- Downloads are attributed for 15 seconds after an action, up from 4, including downloads from links that open in a new tab.
- `browser_find` accepts `query` as well as `text`.

Security: the extension and the companion now prove the pairing to each other. Each side answers the other's fresh challenge with a proof derived from the token, so the token itself is no longer sent. Before pairing, the companion must prove it issued the pairing code before the extension sends it. A program squatting the port can no longer capture a token or a pairing.

## 0.2.0-beta.5

Upgrading: close your AI client, run `npx lateef@latest stop`, and re-run the install command for your client. The extension is unchanged from beta 4.

- `browser_tabs` action:"new" and `browser_navigate` take `read: "text"` or `read: "snapshot"` to return the page in the same call, and `browser_batch` can end with a `close` step. The server no longer tells clients to call `browser_status` first. Together these remove two or three model turns from a simple read.

## 0.2.0-beta.4

Upgrading: close your AI client, run `npx lateef@latest stop`, re-run the install command for your client, run `npx lateef@latest extension` and reload the extension in Chrome.

- Snapshots are plain lines by default, one per element, instead of JSON that listed every element twice. On the two pages measured they are 55–80% smaller than in beta 3. `format: "json"` returns the old shape and `filter: "interactive"` keeps only actionable lines. References are shorter, radios and submit inputs have their real roles, checkboxes and radios report `checked`, and a label is no longer repeated beside its control.

- Full control, as a separate opt-in build (`lateef extension --full`): `browser_screenshot`, `browser_input` (real mouse and keyboard), `browser_evaluate`, `browser_console` and `browser_network`, through Chrome's debugger. Off until switched on in the popup; works on background tabs.
- `browser_history` (back, forward, reload) and `browser_downloads` (files a session caused Chrome to download). Adds the `downloads` permission.
- Uploads up to 25 MiB (was 2 MiB). Large files are sent to the page in pieces and arrive byte for byte.
- Six new tools: `browser_text`, `browser_wait`, `browser_scroll`, `browser_hover`, `browser_press`, and `browser_batch`, which runs up to 20 steps in one call.
- Iframes: snapshots and finds read every frame, and fill, click, press, hover and upload work inside them.
- Presence: you can now tell when an agent is working. The toolbar icon shows how many tabs an agent controls; tabs the agent opens are collected in an orange "Lateef" tab group; controlled pages show a small chip in a corner that says what the agent is doing (reading, clicking, typing, attaching) and a little flag that hops to whatever is being clicked, filled or attached. The chip steps aside when your mouse comes near. The popup has a switch to turn the tab group and page markers off. Adds the `tabGroups` permission.
- The flag is a drawing. Actions are still DOM actions; no mouse or keyboard events are produced, and background tabs are not delayed by it.
- `browser_fill` now works in rich text editors that keep their own model (the kind used by X's composer and many comment boxes): the text is offered as a paste first, with the old DOM edit as the fallback. The result says which path was used.
- Snapshots report the contents of an editable region as its `value` (up to 2,000 characters), so text placed in an editor can be read back before submitting.
- Windows: npx cache paths are recognised with either path separator. CI runs on Ubuntu, macOS and Windows.

## 0.2.0-beta.3

- First npm release. `lateef install <codex|claude|cursor>` registers the MCP server with a client; `lateef extension` copies the Chrome extension to a stable folder for Load unpacked.
- A copy run through npx registers itself as `npx -y lateef@<version> mcp`, so the client keeps working if the npx cache is cleared.
- Extension: a standing 30-second alarm reconnects after the service worker is suspended or the computer sleeps; previously it stayed disconnected until the popup was opened.
- Popup: clearer status, sharing controls only when a client is connected, stale-worker notice.

## 0.2.0-beta.2

- Breaking rename: the command is now only `lateef` (`node bin/lateef.mjs`); the state directory override is only `LATEEF_STATE_DIR`, and `LATEEF_TEST_CHROMIUM` selects the test Chromium.
- Upgrading: the state directory moved from `~/.config/quiet-chrome` to `~/.config/lateef`; move it, or pair again.
- Broker no longer exits on malformed extension frames (non-object or invalid JSON closes the socket) and survives stray unhandled rejections; commands carry an optional `deadline` so the extension skips work the client already saw time out; the extension reconnects with 1–30 s exponential backoff, avoids double connects, and stops retrying after the pairing is revoked; uploads resolve symlinks, refuse hidden paths, `~/Library` and the state directory by default, and honour an optional `LATEEF_UPLOAD_ROOTS` allowlist.

## 0.2.0-beta.1 — review build

- Lateef working brand and extension icon set; compatibility with previous CLI and state directory retained.
- Browser upload tool for 1–4 authorized regular files, 2 MiB total, with exact origin guard and hidden file-input references.
- DOM rows/cells, semantic depth, visible leaf text, link destinations and explicit truncation diagnostics.
- Setup/config/doctor commands; version/capability reporting and outdated-broker upload refusal.
- Sanitized release export, CI, product-page and store-submission drafts.

Not yet published. Live Gmail Sent/attachments, broader platform support, final publisher/contact, store approval and independent review remain release gates.
