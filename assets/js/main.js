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
    setupContactForm();

    console.log('✅ Application initialized securely');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
