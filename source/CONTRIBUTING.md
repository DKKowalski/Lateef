# Contributing

Use Node.js 22+. Run npm ci, npm test, npm run check and npm run test:browser with an extension-capable Chromium. Keep browser tests in temporary isolated profiles and state directories. Do not use contributors' everyday Chrome profiles, send real emails or upload private files in automated tests.

Preserve inactive tabs, explicit window binding, per-session ownership, pairing/revocation and the absence of screenshot/debugger/desktop-control runtime permissions. Never retry browser mutations automatically. New capabilities need functional and refusal-case tests.

Use synthetic fixtures in issues and pull requests. Do not attach tokens, pairing codes, state directories, private page snapshots or user browser profiles. Include the companion/extension version, OS, expected result and a minimal reproduction. Avoid placing test artifacts in source control.

Before release run npm run release:prepare and inspect its report, packages and source export. Publication is a separate maintainer action; preparation does not publish. The project uses the MIT license. The publisher must enable a private vulnerability-reporting channel before public launch.
