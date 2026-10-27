'use strict';

// Shared behaviour for every page: icons, mobile menu, navbar, scroll reveal.
// Kept in an external file so it runs under the page's Content-Security-Policy.

document.addEventListener('DOMContentLoaded', () => {
    if (globalThis.lucide) {
        globalThis.lucide.createIcons();
    }

    // Mobile menu
    const menuBtn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');

    if (menuBtn && menu) {
        const setOpen = (open) => {
            menu.classList.toggle('hidden', !open);
            menuBtn.setAttribute('aria-expanded', String(open));
        };

        menuBtn.addEventListener('click', () => {
            setOpen(menuBtn.getAttribute('aria-expanded') !== 'true');
        });
        menu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => setOpen(false));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') {
                setOpen(false);
                menuBtn.focus();
            }
        });
    }

    // Navbar shadow once the page scrolls
    const navbar = document.getElementById('navbar');
    if (navbar) {
        const onScroll = () => {
            navbar.classList.toggle('shadow-lg', window.scrollY > 24);
            navbar.classList.toggle('shadow-black/30', window.scrollY > 24);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // Highlight the nav link of the section in view (one-page index only)
    const sectionLinks = document.querySelectorAll('[data-nav-section]');
    if (sectionLinks.length) {
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                sectionLinks.forEach(link => {
                    if (link.dataset.navSection === entry.target.id) {
                        link.setAttribute('aria-current', 'true');
                    } else {
                        link.removeAttribute('aria-current');
                    }
                });
            });
        }, { rootMargin: '-45% 0px -50% 0px' });

        // Observe every section (including the hero) so the highlight clears at the top
        document.querySelectorAll('main section[id]').forEach(section => sectionObserver.observe(section));
    }

    observeReveals(document);
});

// Exposed so dynamically rendered content (GitHub repos) can opt in too.
function observeReveals(root) {
    const elements = root.querySelectorAll('.reveal:not(.active)');
    if (!('IntersectionObserver' in window)) {
        elements.forEach(el => el.classList.add('active'));
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    elements.forEach(el => observer.observe(el));
}
globalThis.observeReveals = observeReveals;
