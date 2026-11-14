// Shared Tailwind (CDN) theme. Loaded right after cdn.tailwindcss.com on every page.
// Colours point at CSS variables (assets/css/extra.css) so the light and dark
// themes can swap them without touching the markup.
const themed = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

tailwind.config = {
    theme: {
        extend: {
            colors: {
                paper: themed('paper'),
                surface: themed('surface'),
                ink: themed('ink'),
                body: themed('body'),
                muted: themed('muted'),
                faint: themed('faint'),
                line: themed('line'),
                brand: themed('brand')
            },
            fontFamily: {
                sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                mono: ['IBM Plex Mono', 'ui-monospace', 'monospace']
            }
        }
    }
};

// Pick the theme before first paint: the visitor's saved choice, else their OS setting.
(function () {
    let theme = null;
    try { theme = localStorage.getItem('theme'); } catch (e) { /* storage blocked */ }
    if (theme !== 'light' && theme !== 'dark') {
        theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.add('js');
})();
