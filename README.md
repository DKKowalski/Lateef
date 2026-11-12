# Lateef website

The static product website for **Lateef** (lah-TEEF), an independent Chrome extension and local MCP companion. Includes the logo, interactive SVG demonstration, installation/privacy/security pages, locally hosted Geist font and sanitized MIT-licensed beta downloads.

Repository: https://github.com/DKKowalski/Lateef

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

- `site/index.html`, `style.css`, `motion.js`, `motion-math.js`: landing page and original animated demonstration.
- `site/install.html`, `privacy.html`, `security.html`: product documentation.
- `site/assets/`: SVG/PNG logos and Geist font with its SIL OFL license.
- `site/downloads/`: beta source ZIP, unpacked extension ZIP and local npm package. Refresh all three together for a new companion release.
- `docs/MOTION_GUIDE.md`: instructions for future SVG/motion changes.

The source archive includes the independent extension and MCP companion. Downloads are review beta artifacts; the extension and companion are not on the Chrome Web Store or npm registry. This repository intentionally excludes private browser evaluations, runtime state and proprietary learning material.

Code and original artwork: MIT; Geist font: SIL OFL (included).
