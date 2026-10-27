# FaiGiJoon.github.io

Personal portfolio website with a dark, minimal design built on Tailwind CSS. `index.html` is a one-page layout:

- **Hero** with name, role, availability badge, CV download and key stats
- **About** with an "At a glance" card and personal interests
- **Experience** timeline of past roles
- **Skills & tools** grouped by area
- **Recent projects** loaded live from the GitHub API
- **Contact** with email and GitHub links

Shared assets used by every page (index, blog, post layout):

- `assets/js/tailwind-config.js` — Tailwind theme (colors, fonts)
- `assets/css/extra.css` — shared components (buttons, cards, tags, nav, timeline) and reduced-motion support
- `assets/js/main.js` — icons, accessible mobile menu, active nav link, scroll reveal
- `assets/js/stadium3d.js` — 3D battle stadium built with three.js (vendored in `assets/vendor/`, MIT): tiered bowl with a cheering crowd, glowing battle field, light towers with sweeping beams, themed skies/props and original flying creatures, with broadcast-style camera shots. All geometry is original; no game assets are used. Loads after the page, needs WebGL.
- `assets/js/stadium.js` — the floating **Stadium** picker (Arena, Neon, Crystal, Sunset, Starlight) and effects on/off switch, plus a 2D canvas stadium used as the fallback when WebGL is unavailable. Respects `prefers-reduced-motion` (still frame) and pauses in background tabs.
- `_includes/nav.html` / `_includes/footer.html` — navigation and footer for Jekyll pages

### Technologies

- Tailwind CSS (via CDN) with a small custom configuration for colors, animations and fonts.
- Vanilla JavaScript for mobile navigation toggle, scroll‑reveal animations, and skill bar animations.
- Lucide icon library loaded from unpkg.
- CSP-friendly structure: no inline scripts; all JavaScript lives in `assets/js/`.


