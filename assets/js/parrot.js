'use strict';

// A pixel parrot that sits on a perch in the corner of the screen. When you
// click something, it flies over to the spot, says something about what you
// clicked, and after a few seconds flies back to its perch. While the page
// scrolls it flaps and tilts a little. Decorative only: hidden from screen
// readers, and switched off on touch screens and when reduced motion is on.
(function () {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canHover || calm) return;

    // Same bird as the one in the wallpaper, facing right.
    const FRAMES = [
        [
            '...bb........',
            '...ggb.......',
            '....ggg..yy..',
            '.ggggggggykyo',
            'rggggggggyyo.',
            '..ggggggg....',
        ],
        [
            '.........yy..',
            '.ggggggggykyo',
            'rggggggggyyo.',
            '..gggggggg...',
            '....ggb......',
            '...bb........',
        ],
    ];
    const PALETTE = { g: '#2fb344', y: '#ffd23f', b: '#2f7fe0', o: '#f08a24', k: '#1b1b1b', r: '#e04f3f' };
    const PIXEL = 4;
    const BIRD_W = FRAMES[0][0].length * PIXEL;
    const BIRD_H = FRAMES[0].length * PIXEL;

    // What the parrot says, matched against the text of the thing that was clicked.
    // First match wins, so the specific ones come first.
    const LINES = [
        [/view on github|see every badge/i, 'Go on, the proof is one click away.'],
        [/switch between light and dark/i, 'Day or night? I like the sunset best.'],
        [/open menu/i, 'Everything is in there. Squawk!'],
        [/get in touch|email/i, 'Say hi! He answers faster than I fly.'],
        [/download cv|\bcv\b/i, 'The CV, in Dutch. Polly wants a PDF.'],
        [/about/i, 'Who is Casper? Have a look.'],
        [/experience/i, 'Six jobs so far. I counted.'],
        [/skills/i, 'MikroTik, Linux, Python. He collects them.'],
        [/training/i, 'Sixty-four badges. I only have feathers.'],
        [/projects/i, 'Fresh from GitHub. Still warm.'],
        [/blog/i, 'He writes too. Squawk!'],
        [/battle red/i, 'Careful. Red does not go easy on you.'],
        [/goldenrod|retro portfolio|enter/i, 'A whole town to walk around in. I would fly.'],
        [/classic portfolio/i, 'The quick way to read everything.'],
        [/github/i, 'All his code lives there.'],
        [/linkedin/i, 'The suit-and-tie version of Casper.'],
        [/what i did in this role|more about me/i, 'Open it. There is more inside.'],
        [/show less/i, 'Had enough? Fold it back up.'],
        [/casper/i, 'That is the boss. Back to the top!'],
    ];
    const EMPTY_CLICK = ['Squawk!', 'Nothing to click there.', 'Hm? Did you call me?', 'I was napping.'];

    function lineFor(el) {
        const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!label) return 'Squawk! Good choice.';
        for (const [pattern, line] of LINES) {
            if (pattern.test(label)) return line;
        }
        const short = label.length > 30 ? `${label.slice(0, 29).trim()}…` : label;
        return `"${short}"? Good choice, squawk!`;
    }

    // ---------- elements ----------
    const pet = document.createElement('div');
    pet.className = 'pet is-here';
    pet.setAttribute('aria-hidden', 'true');
    const bird = document.createElement('canvas');
    bird.className = 'pet-bird';
    bird.width = FRAMES[0][0].length;
    bird.height = FRAMES[0].length;
    bird.style.width = `${BIRD_W}px`;
    bird.style.height = `${BIRD_H}px`;
    const bubble = document.createElement('div');
    bubble.className = 'pet-bubble';
    const perchBar = document.createElement('div');
    perchBar.className = 'pet-perch';
    perchBar.setAttribute('aria-hidden', 'true');
    pet.append(bubble, bird);
    document.body.append(perchBar, pet);

    const ctx = bird.getContext('2d');
    let shownFrame = -1;
    function paint(frame) {
        if (frame === shownFrame) return;
        shownFrame = frame;
        ctx.clearRect(0, 0, bird.width, bird.height);
        FRAMES[frame].forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const colour = PALETTE[row[x]];
                if (colour) { ctx.fillStyle = colour; ctx.fillRect(x, y, 1, 1); }
            }
        });
    }
    paint(1);

    // ---------- perch ----------
    // Bottom-right corner of the screen, on a little branch.
    const perch = () => ({ x: window.innerWidth - BIRD_W - 36, y: window.innerHeight - BIRD_H - 30 });
    let home = perch();
    window.addEventListener('resize', () => { home = perch(); });

    let x = home.x, y = home.y;
    let targetX = home.x, targetY = home.y;
    let facingLeft = true; // looks into the page while perched
    let returnAt = 0;      // when to fly home again
    let hideBubbleAt = 0;

    function say(text, ms) {
        bubble.textContent = text;
        bubble.classList.add('is-open');
        hideBubbleAt = performance.now() + ms;
    }

    // ---------- clicking: fly over and talk ----------
    let emptyClicks = 0;
    document.addEventListener('click', (e) => {
        if (e.button !== 0) return;
        const el = e.target instanceof Element ? e.target.closest('a, button, summary, [role="button"]') : null;
        // land just above and beside the click so the bird does not cover what was clicked
        targetX = Math.min(Math.max(e.clientX + 14, 8), window.innerWidth - BIRD_W - 8);
        targetY = Math.min(Math.max(e.clientY - BIRD_H - 14, 70), window.innerHeight - BIRD_H - 8);
        if (el) {
            say(lineFor(el), 3200);
        } else {
            say(EMPTY_CLICK[emptyClicks++ % EMPTY_CLICK.length], 1600);
        }
        returnAt = performance.now() + 4200;
        hopStart = performance.now();
    });

    // ---------- scrolling: a few flaps and a tilt ----------
    let scrollUntil = 0, scrollDir = 0, lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
        const yNow = window.scrollY;
        scrollDir = Math.sign(yNow - lastScrollY);
        lastScrollY = yNow;
        scrollUntil = performance.now() + 260;
    }, { passive: true });

    let hopStart = -1e9;

    function frame(now) {
        if (returnAt && now > returnAt) {
            returnAt = 0;
            targetX = home.x;
            targetY = home.y;
        }
        if (hideBubbleAt && now > hideBubbleAt) {
            hideBubbleAt = 0;
            bubble.classList.remove('is-open');
        }

        const dx = targetX - x, dy = targetY - y;
        const flying = Math.abs(dx) + Math.abs(dy) > 3;
        x += dx * 0.09;
        y += dy * 0.09;
        if (Math.abs(dx) > 6) facingLeft = dx < 0;
        // once home, turn to face the page again
        if (!flying && !returnAt) facingLeft = true;

        const scrolling = now < scrollUntil;
        const hopT = (now - hopStart) / 260;
        const hop = hopT >= 0 && hopT < 1 && !flying ? -Math.sin(hopT * Math.PI) * 6 : 0;
        const lag = scrolling ? scrollDir * -3 : 0;
        const tilt = scrolling ? scrollDir * 8 : 0;
        const bob = flying || scrolling ? 0 : Math.sin(now / 420) * 1.2;

        paint(flying || scrolling || hop ? Math.floor(now / 110) % 2 : 1);

        pet.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + bob + hop + lag)}px)`;
        bird.style.transform = `${facingLeft ? 'scaleX(-1) ' : ''}rotate(${facingLeft ? -tilt : tilt}deg)`;
        // keep the bubble on screen
        pet.classList.toggle('bubble-left', x > window.innerWidth - 290);
        pet.classList.toggle('bubble-below', y < 90);
        window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
})();
