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
- `assets/js/stadium.js` — animated battle-stadium background drawn on a canvas (original art, no game assets), with a floating **Stadium** picker (Arena, Neon, Crystal, Sunset, Starlight) and an effects on/off switch. Respects `prefers-reduced-motion` and pauses in background tabs.
- `_includes/nav.html` / `_includes/footer.html` — navigation and footer for Jekyll pages

### Technologies

- Tailwind CSS (via CDN) with a small custom configuration for colors, animations and fonts.
- Vanilla JavaScript for mobile navigation toggle, scroll‑reveal animations, and skill bar animations.
- Lucide icon library loaded from unpkg.
- CSP-friendly structure: no inline scripts; all JavaScript lives in `assets/js/`.


