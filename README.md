# FaiGiJoon.github.io
This will be a site about me: 

Hosting (GitHub Pages):

- This repository can be hosted on GitHub Pages. Ensure the repository's Pages settings are set to serve from the `main` branch (root) and the site will use `index.html` at repository root.
- I renamed the original HTML file to `index.html` and moved inline scripts to `assets/js/main.js` so CSP allows execution.
- Contact form: replace `YOUR_FORMSPREE_ID` in the form action with your Formspree form ID to enable submissions.

Security notes:
- Content-Security-Policy is set via a meta tag; inline JavaScript was moved to an external file to comply with `script-src 'self'`.
- Styles are inline and CSP permits `'unsafe-inline'` for styles; consider moving CSS to an external file to remove `'unsafe-inline'`. 
