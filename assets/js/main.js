'use strict';

// ============================================
// SECURITY: Configuration
// ============================================
const CONFIG = {
    FORM_TIMEOUT: 8000,
    EMAIL_ADDRESS: 'klootwijkc@gmail.com',
    MAX_MESSAGE_LENGTH: 5000,
    MAX_NAME_LENGTH: 100
};

// ============================================
// SECURITY: Input Validation & Sanitization
// ============================================
const Validator = {
    sanitizeText(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length < 254;
    },

    validateText(text, maxLength) {
        return typeof text === 'string' && text.trim().length > 0 && text.length <= maxLength;
    }
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
// FEATURE: Contact Form Submission (Formspree)
// ============================================
function setupContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    // Check if Formspree ID is configured
    if (form.action.includes('YOUR_FORMSPREE_ID')) {
        console.warn('⚠️ Formspree ID not configured! Replace YOUR_FORMSPREE_ID in the form action.');
        showAlert(
            document.getElementById('form-alert'),
            '⚠️ Contact form is not configured yet. Please check back later.',
            'error'
        );
        form.style.opacity = '0.5';
        form.style.pointerEvents = 'none';
        return;
    }

    form.addEventListener('submit', async (e) => {
        const inputs = form.querySelectorAll('input[required], textarea[required]');
        for (let input of inputs) {
            if (!validateInput(input)) {
                e.preventDefault();
                showAlert(
                    document.getElementById('form-alert'),
                    `❌ Please check your ${input.name}`,
                    'error'
                );
                return;
            }
        }

        console.log('✅ Form submitted to Formspree');
    });
}

// ============================================
// UTILITY: Form Validation
// ============================================
function validateInput(input) {
    const value = input.value.trim();
    const name = input.name;

    if (!value) return false;

    switch (name) {
        case 'name':
            return Validator.validateText(value, CONFIG.MAX_NAME_LENGTH) && value.length >= 2;
        case 'email':
            return Validator.validateEmail(value);
        case '_subject':
            return Validator.validateText(value, 200);
        case 'message':
            return Validator.validateText(value, CONFIG.MAX_MESSAGE_LENGTH) && value.length >= 10;
        default:
            return true;
    }
}

// ============================================
// UTILITY: Alert Display
// ============================================
function showAlert(alertElement, message, type) {
    alertElement.textContent = message;
    alertElement.className = `alert alert-${type}`;
    alertElement.classList.remove('hidden');

    if (type === 'success') {
        setTimeout(() => {
            alertElement.classList.add('hidden');
        }, 5000);
    }
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
