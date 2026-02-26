'use strict';

// ============================================
// Minimal site JS: mobile menu + email reveal
// ============================================
const CONFIG = {
    EMAIL_ADDRESS: 'professional@example.com'
};

// ============================================
// FEATURE: Mobile Menu Toggle
// ============================================
function setupMobileMenu() {
    const button = document.getElementById('mobile-menu-button');
    const menu = document.getElementById('mobile-menu');

    if (!button || !menu) return;

    button.addEventListener('click', () => {
        const isOpen = menu.classList.contains('hidden');
        menu.classList.toggle('hidden');
        button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close menu when clicking on a link
    const links = menu.querySelectorAll('a');
    links.forEach(link => {
        link.addEventListener('click', () => {
            menu.classList.add('hidden');
            button.setAttribute('aria-expanded', 'false');
        });
    });
}

// ============================================
// FEATURE: Email Obfuscation (Spam Prevention)
// ============================================
function setupEmailLink() {
    const emailLink = document.getElementById('email-link');
    if (!emailLink) return;

    emailLink.addEventListener('click', (e) => {
        e.preventDefault();
        emailLink.href = `mailto:${CONFIG.EMAIL_ADDRESS}`;
        emailLink.textContent = CONFIG.EMAIL_ADDRESS;
        emailLink.onclick = null; // Remove listener after click
    });
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        console.warn('⚠️ This site should use HTTPS for security');
    } else {
        console.log('✅ HTTPS Enabled');
    }

    setupMobileMenu();
    setupEmailLink();
    // UX: smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const href = a.getAttribute('href');
            if (href.length > 1 && document.querySelector(href)) {
                e.preventDefault();
                document.querySelector(href).scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Reveal on scroll (subtle)
    const reveals = document.querySelectorAll('section, .card');
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('opacity-100', 'translate-y-0');
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.12 });
    reveals.forEach(r => {
        r.classList.add('opacity-0', 'translate-y-6', 'transition', 'duration-700');
        obs.observe(r);
    });

    console.log('✅ Application initialized securely');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
