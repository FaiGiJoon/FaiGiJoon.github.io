## 2026-05-22 - [XSS Prevention and CSP Enhancement]
**Vulnerability:** Potential XSS in GitHub repository rendering via `innerHTML` and restrictive CSP blocking legitimate API calls.
**Learning:** Fetching data from external APIs like GitHub and using `innerHTML` without sanitization is a classic XSS vector. Additionally, a strict CSP that only allows `connect-src 'self'` will break legitimate external features like fetching public repos.
**Prevention:** Always implement a robust `escapeHTML` function for any data injected into the DOM. Regularly audit CSP directives to ensure they allow necessary external connections while enforcing secure protocols (HTTPS).
