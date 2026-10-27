// Shared Tailwind (CDN) theme. Loaded right after cdn.tailwindcss.com on every page.
tailwind.config = {
    theme: {
        extend: {
            colors: {
                primary: '#6366f1',
                'primary-light': '#818cf8',
                secondary: '#8b5cf6',
                accent: '#22d3ee',
                dark: '#0f172a',
                darker: '#020617'
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
            }
        }
    }
};

// Runs synchronously in <head>, so .reveal content is only hidden when JS is available
// (no flash of content before main.js loads).
document.documentElement.classList.add('js');
