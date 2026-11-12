# Lateef website

This repository contains the public static website and sanitized beta downloads.
Edit `site/`; `npm run build` creates the ignored `dist/` directory.

- Keep every page, asset and download link relative so the site works at both `/` and `/Lateef/` on GitHub Pages.
- Read `docs/MOTION_GUIDE.md` before changing SVGs or motion. Preserve reduced motion, pause/replay, keyboard support and independent SVG IDs.
- Use the locally included Geist font and preserve its SIL OFL license.
- Keep private evaluation reports, browser state, personal files, credentials and proprietary course material out of this repository and its downloads.
- Run `npm run build` and `npm run check` before pushing. Check mobile and desktop in a browser after visual changes.
- The extension source is supplied as an MIT-licensed source download. Do not imply this website is a live browser session or that the beta is approved for the Chrome Web Store.
