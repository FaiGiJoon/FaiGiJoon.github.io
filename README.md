# FaiGiJoon.github.io

Personal portfolio website built with a modern dark/glass design and Tailwind CSS. The current `index.html` contains a full one‑page layout including:

- **Hero** section with animated gradient text and call‑to‑action buttons
- **About** overview with availability badge
- **Skills** grid with animated progress bars (technical, cloud/tools, soft skills)
- **Experience** timeline of past roles
- **Blog** previews
- **Contact** form powered by Formspree
- **Footer** with social links and custom Lucide icons

### Technologies

- Tailwind CSS (via CDN) with a small custom configuration for colors, animations and fonts.
- Vanilla JavaScript for mobile navigation toggle, scroll‑reveal animations, and skill bar animations.
- Lucide icon library loaded from unpkg.
- CSP-friendly structure: minimal inline scripts/styles (all JS lives in the bottom of `index.html`), and assets are served locally.

### Deployment / Hosting

- The site can be hosted on GitHub Pages by serving from the `main` (or `gh-pages`) branch root. It will automatically pick up `index.html`.

### Contact Form

- The contact form at the bottom of the page posts to Formspree. Replace the placeholder `action="https://formspree.io/f/your-form-id"` with your actual form ID.
- Submissions are sent by Formspree; the page does not require a backend.

### Customization

- Update the hero text, experience entries, skills percentages, and blog links directly in `index.html`.
- Additional Tailwind configuration can be added inside the `<script>` tag near the top of `index.html`.

Feel free to edit, extend, or replace the template as needed for your personal branding.
 
