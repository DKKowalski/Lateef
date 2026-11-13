# Lateef

**Give your agent a tab of its own.** Lateef (lah-TEEF) is an open-source bridge between your AI tools and the Chrome you already use. Your agent works in background tabs, through structured tools, while you keep yours. It works with any MCP client, including Codex, Claude Code and Cursor.

- Website and install guide: https://dkkowalski.github.io/Lateef/
- npm: https://www.npmjs.com/package/lateef

```sh
npx lateef install codex     # or: claude, cursor
npx lateef extension         # then load the folder at chrome://extensions
npx lateef pair
```

If Lateef is useful to you, a star helps other people find it.

## What is in this repository

| Folder | Contents |
|---|---|
| [`source/`](source) | The extension, the local MCP companion and their tests. This is what npm installs. Start with [`source/README.md`](source/README.md). |
| `site/` | The website, as static files. |
| `site/downloads/` | The same release as zip and tgz files, with checksums. |
| `docs/` | The motion guide for the website's drawings. |

`source/` is a cleaned copy made at each release from a private development repository, so its history here is one commit per release. Issues and pull requests are welcome; changes to `source/` are applied upstream and arrive with the next release. Read [`source/SECURITY.md`](source/SECURITY.md) before reporting a vulnerability.

The tests for `source/` run here on Linux, macOS and Windows.

# The website

Public address: https://dkkowalski.github.io/Lateef/

The Actions build also writes a small redirect at `/Lateef/site/` that forwards to the main address, so an earlier shared `/site/` link keeps working.

## Work locally

Requires Node.js 22+. No dependency installation or API keys are needed.

```sh
npm run dev
```

Open http://127.0.0.1:4173/Lateef/. Edit files in `site/` and refresh. The preview supports both `/` and `/Lateef/` to check GitHub project-site paths.

```sh
npm run build
npm run check
```

The build copies only `site/` to `dist/`. Checks validate the four pages, relative links, downloads and JavaScript syntax. All browser-side code is vanilla JavaScript; the published site has no server or sign-in requirement.

## GitHub Pages

1. In this repository's **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
2. Push to `main`, or run **Build and deploy website** from the Actions tab.
3. The workflow builds, checks and deploys `dist/`. Pull requests run build/check only.

The workflow follows [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Relative links support the `/Lateef/` prefix without a framework base-URL setting. No Sites/ChatGPT hosting setup is required.

Publishing `main` directly from **Deploy from a branch → / (root)** also works: the repository's root `index.html` redirects to `site/`, which contains the complete website. Keep this entry point when updating the site. The Actions build publishes the website directly at the main Pages address, which is the public address.

## Content and assets

- `site/index.html`, `style.css`, `site.js`, `motion.js`, `motion-math.js`: landing page, theme switch and the original illustrated tool gallery.
- `site/install.html`, `privacy.html`, `security.html`: product documentation.
- `site/assets/`: SVG/PNG logos and Geist font with its SIL OFL license.
- `site/downloads/`: beta source ZIP, unpacked extension ZIP and local npm package. Refresh all three together for a new companion release.
- `docs/MOTION_GUIDE.md`: instructions for future SVG/motion changes.

The companion is on npm; the extension is not on the Chrome Web Store. This repository intentionally excludes private browser evaluations, runtime state and proprietary learning material.

Code and original artwork: MIT; Geist font: SIL OFL (included).

Button hover effects are rebuilt in this project's own CSS after [Tiny Mighty Buttons](https://tiny-mighty-buttons.webflow.io/) by Eduard Bodak. The gallery layout draws on [Minimal Gallery](https://minimal.gallery/).
