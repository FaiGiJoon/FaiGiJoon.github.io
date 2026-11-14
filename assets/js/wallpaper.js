'use strict';

// Animated 8-bit wallpaper behind the page: a Curaçao waterfront with pastel
// gabled houses, a palm, a kadushi cactus with a troupial on it, an iguana on a
// rock, a blò-blò lizard, flamingos, a goat under a divi-divi tree, a sea turtle,
// a pelican, a flock of prikichi parakeets and a parrot that flies past. Everything is original pixel art drawn in code on a
// low-resolution canvas that the browser scales up without smoothing.
(function () {
    const canvas = document.createElement('canvas');
    canvas.className = 'wallpaper';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');

    const FRAME_MS = 125; // 8 frames a second is plenty for pixel art
    let W = 0, H = 0, scale = 4, tick = 0, horizon = 0;
    let dark = false;
    let backdrop = null; // sky, sun or moon and the houses: redrawn only on resize or theme change

    // ---------- colour ----------
    const NIGHT = [10, 22, 38];
    const shaded = new Map();
    // At night every scene colour is pulled towards deep navy.
    function tone(hex) {
        if (!dark) return hex;
        let out = shaded.get(hex);
        if (!out) {
            const n = parseInt(hex.slice(1), 16);
            const mix = (c, i) => Math.round(c * 0.5 + NIGHT[i] * 0.5);
            out = `rgb(${mix(n >> 16, 0)}, ${mix((n >> 8) & 255, 1)}, ${mix(n & 255, 2)})`;
            shaded.set(hex, out);
        }
        return out;
    }
    // Repeatable pseudo-random number in [0, 1) for a given index.
    function rnd(i) {
        const x = Math.sin(i * 127.1) * 43758.5453;
        return x - Math.floor(x);
    }

    function rect(c, x, y, w, h, colour) {
        c.fillStyle = colour;
        c.fillRect(Math.round(x), Math.round(y), w, h);
    }
    function sprite(rows, palette, x, y, flip) {
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            for (let i = 0; i < row.length; i++) {
                const colour = palette[row[i]];
                if (colour) rect(ctx, flip ? x + row.length - 1 - i : x + i, y + r, 1, 1, tone(colour));
            }
        }
    }

    // ---------- sprites ----------
    const FLAMINGO_HEAD = [
        '..PP....',
        '.PPPP...',
        'kPPwP...',
        'kk.PP...',
        '...PP...',
        '...PP...',
    ];
    const FLAMINGO_BODY = [
        '....PP........',
        '....PP..PPPP..',
        '.....PPPPPPPP.',
        '.....PPPpPPPPP',
        '....PPPppPPPPP',
        '....PPPPPPPPP.',
        '.....PPPPPPP..',
        '.......l.l....',
        '.......l.l....',
        '.......l.l....',
        '.......l.l....',
        '.......l.l....',
        '.......l.l....',
        '.......l.l....',
    ];
    const FLAMINGO = { P: '#ff7fa0', p: '#ffc2d1', k: '#1b1b1b', w: '#ffffff', l: '#e8607f' };

    const IGUANA = [
        '..........s.s.s.s.......',
        '.........gggggggggg.ggg.',
        '.......ggggggggggggggegg',
        '....ggggggGgggGggggggggg',
        '..gggg..ggyyyyyyggg..yy.',
    ];
    const IGUANA_LEGS = [
        ['ggg.....gg......gg......', 'g......gg........gg.....'],
        ['.ggg....gg......gg......', '..g....gg........gg.....'],
    ];
    const IGUANA_PAL = { g: '#5aa469', G: '#3d7a4d', y: '#c9d66b', s: '#9bd18b', e: '#1b1b1b' };

    const PARROT = [
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
    const PARROT_PAL = { g: '#2fb344', y: '#ffd23f', b: '#2f7fe0', o: '#f08a24', k: '#1b1b1b', r: '#e04f3f' };

    // Venezuelan troupial, the national bird: orange and black, perched facing left.
    const TROUPIAL = [
        '..kk.....',
        '.kekk....',
        'bkkkk....',
        '..OOkk...',
        '..OOOkw..',
        '...OOkkk.',
        '....t....',
    ];
    const TROUPIAL_PAL = { k: '#1b1b1b', e: '#ffe08a', b: '#b9bcc0', O: '#ff8c1a', w: '#ffffff', t: '#6b5d4d' };

    const TURTLE = [
        '....gggg......',
        '..ggGgGggg.hh.',
        '.gggGgGgggghhe',
        'f.ggggggggg.hh',
    ];
    const TURTLE_FLIPPERS = ['..ff....ff....', '.ff....ff.....'];
    const TURTLE_PAL = { g: '#3f8f6b', G: '#2c6b4f', h: '#9ccf8f', f: '#7fb97a', e: '#1b1b1b' };

    const PELICAN = [
        [
            '....PP..........',
            '...PPPP.........',
            '..pPPPPp...ww...',
            'pppppppppppwwyyy',
            '.ppppppppp...yy.',
        ],
        [
            '..pppppp...ww...',
            'pppppppppppwwyyy',
            '.pppPPPPpp...yy.',
            '...PPPP.........',
            '....PP..........',
        ],
    ];
    const PELICAN_PAL = { p: '#8a7a66', P: '#6b5d4d', w: '#f3ead2', y: '#e0a63c' };

    // Prikichi: small green parakeets that travel in noisy flocks.
    const PRIKICHI = [
        ['g....', 'ggggy', '.gg..'],
        ['.gg..', 'ggggy', 'g....'],
    ];
    const PRIKICHI_PAL = { g: '#3fbf5a', y: '#f2c94c' };

    // Blò-blò: whiptail lizard with a blue-green tail.
    const BLOBLO = ['tttbbbbh.', '..b..b...'];
    const BLOBLO_PAL = { t: '#2ec4c7', b: '#8a8f4a', h: '#6f7438' };

    const GOAT = [
        '.h........',
        'www.......',
        'wwwwwwwwww',
        '.wwwwbbwww',
        '..wwbbwww.',
        '..w.w.w.w.',
        '..w.w.w.w.',
    ];
    const GOAT_PAL = { w: '#efe7d6', b: '#8a5a3c', h: '#5b4a3a' };

    const HOUSES = ['#f6c945', '#f08fa4', '#5fb0e6', '#f28b50', '#7fcf9a', '#efe6c8', '#d96c6c', '#4fc3b8'];

    // ---------- backdrop (static) ----------
    function drawBackdrop() {
        backdrop = document.createElement('canvas');
        backdrop.width = W;
        backdrop.height = H;
        const c = backdrop.getContext('2d');

        const bands = dark
            ? ['#081726', '#0c2233', '#123042', '#1b4254', '#2c5e68', '#7a5560']
            : ['#3fb8d8', '#63c8e0', '#8bd8e6', '#b4e7ea', '#dcf2e6', '#fde6bf'];
        const bandH = Math.ceil(horizon / bands.length);
        bands.forEach((colour, i) => {
            rect(c, 0, i * bandH, W, bandH + 1, colour);
            if (i === 0) return;
            // dithered edge between this band and the one above
            for (let x = 0; x < W; x += 2) {
                rect(c, x, i * bandH - 1, 1, 1, colour);
                if (x % 4 === 0) rect(c, x + 1, i * bandH - 2, 1, 1, colour);
            }
        });

        // sun by day, crescent moon by night
        const cx = Math.round(W * 0.84), cy = Math.round(H * 0.17), r = 9;
        const disc = (ox, oy, radius, colour) => {
            for (let dy = -radius; dy <= radius; dy++) {
                const half = Math.floor(Math.sqrt(radius * radius - dy * dy));
                rect(c, ox - half, oy + dy, half * 2 + 1, 1, colour);
            }
        };
        if (dark) {
            disc(cx, cy, r, '#f4e9cd');
            disc(cx + 4, cy - 2, r - 1, bands[1]);
        } else {
            disc(cx, cy, r + 2, '#ffe9a3');
            disc(cx, cy, r, '#ffd166');
        }

        // the waterfront: a row of gabled houses in pastel colours
        let x = Math.round(W * 0.03);
        for (let i = 0; x < W * 0.97; i++) {
            const w = 11 + Math.floor(rnd(i + 1) * 6);
            const h = 13 + Math.floor(rnd(i + 7) * 9);
            const top = horizon - h;
            const body = toneFor(HOUSES[i % HOUSES.length]);
            rect(c, x, top, w, h, body);
            for (let k = 0; k < 3 && w - 2 - k * 2 > 2; k++) rect(c, x + 1 + k, top - 1 - k, w - 2 - k * 2, 1, body);
            rect(c, x, top, w, 1, toneFor('#fffaf0'));
            rect(c, x + 3, top - 4, w - 6, 1, toneFor('#fffaf0'));
            for (let wy = top + 3; wy < horizon - 6; wy += 5) {
                for (let wx = x + 2; wx < x + w - 3; wx += 4) {
                    const lit = rnd(i * 13 + wx + wy) > 0.45;
                    rect(c, wx, wy, 2, 2, dark ? (lit ? '#ffd166' : '#16293a') : '#fffdf3');
                }
            }
            rect(c, x + Math.floor(w / 2) - 1, horizon - 4, 2, 4, toneFor('#7a4a2a'));
            x += w + (rnd(i + 3) < 0.18 ? 4 : 1);
        }
        rect(c, 0, horizon, W, 2, toneFor('#d9c7a0'));
    }
    const toneFor = (hex) => tone(hex);

    // ---------- animated layers ----------
    function drawSky() {
        if (dark) {
            for (let i = 0; i < 46; i++) {
                const twinkle = (tick + i * 5) % 31 < 3;
                if (!twinkle) rect(ctx, rnd(i + 20) * W, rnd(i + 60) * horizon * 0.7, 1, 1, i % 4 ? '#c9d6df' : '#fff4c9');
            }
        }
        const cloud = dark ? '#23455a' : '#ffffff';
        for (let i = 0; i < 4; i++) {
            const w = 20 + i * 5;
            const x = ((i * 97 + tick * (0.1 + i * 0.045)) % (W + 70)) - 45;
            const y = Math.round(H * (0.07 + i * 0.07));
            rect(ctx, x + 4, y, w - 8, 2, cloud);
            rect(ctx, x, y + 2, w, 3, cloud);
            rect(ctx, x + 6, y + 5, w - 13, 1, cloud);
        }
    }

    function drawSea() {
        const top = horizon + 2;
        const depth = H - top;
        const water = ['#22b8c4', '#17a2b3', '#1089a0'];
        water.forEach((colour, i) => rect(ctx, 0, top + Math.floor(depth * i / 3), W, Math.ceil(depth / 3) + 1, tone(colour)));
        const crest = dark ? '#3b8c96' : '#c8f6f1';
        for (let y = top + 3, row = 0; y < H; y += 4, row++) {
            const dir = row % 2 ? 1 : -1;
            const drift = Math.floor(tick * (0.25 + (row % 3) * 0.12)) * dir;
            for (let k = 0; k * 26 < W + 26; k++) {
                const x = (((k * 26 + row * 11 + drift) % (W + 26)) + W + 26) % (W + 26) - 13;
                rect(ctx, x, y, row % 3 ? 4 : 6, 1, crest);
            }
        }
    }

    function drawIsland() {
        const sandTop = H - 9;
        [78, 76, 73, 69, 64, 57, 48, 37, 22].forEach((w, k) => rect(ctx, 0, H - 1 - k, w, 1, tone(k > 6 ? '#f7e3b0' : '#ecd092')));

        // palm: a leaning trunk with fronds that sway
        const baseX = 13, height = 44;
        let topX = baseX;
        for (let i = 0; i < height; i++) {
            topX = baseX + Math.round(Math.sin((i / height) * 1.3) * 7);
            rect(ctx, topX, sandTop - i, 2, 1, tone(i % 4 < 2 ? '#8a5a3c' : '#6d452c'));
        }
        const topY = sandTop - height;
        const sway = Math.round(Math.sin(tick / 9) * 1.5);
        const fronds = [[-1, 0.035, 18], [-1, 0.09, 14], [-1, 0.2, 9], [1, 0.035, 18], [1, 0.09, 14], [1, 0.2, 9]];
        fronds.forEach(([dir, droop, length], f) => {
            for (let j = 0; j < length; j++) {
                const lean = j > length / 2 ? sway : 0;
                rect(ctx, topX + dir * j + lean, topY - 3 + Math.round(j * j * droop), 2, 2, tone(f % 3 === 1 ? '#1f7a45' : '#2e9e5b'));
            }
        });
        rect(ctx, topX - 1, topY - 1, 2, 2, tone('#5b3a22'));
        rect(ctx, topX + 2, topY, 2, 2, tone('#5b3a22'));

        // rock with the iguana on it
        [[34, 28], [35, 26], [36, 24], [38, 20], [41, 14]].forEach(([x, w], k) => rect(ctx, x, sandTop - 1 - k, w, 1, tone(k === 4 ? '#9a9d94' : '#73776f')));
        // kadushi cactus with the troupial perched on top
        const cactusX = 65, cactusBase = H - 4, cactusH = 30;
        const column = (x, y, h) => {
            rect(ctx, x, y, 4, h, tone('#4f9d5b'));
            rect(ctx, x + 1, y, 1, h, tone('#7cc47f'));
            rect(ctx, x + 3, y, 1, h, tone('#3a7a45'));
        };
        column(cactusX, cactusBase - cactusH, cactusH);
        rect(ctx, cactusX - 5, cactusBase - 14, 5, 3, tone('#4f9d5b'));
        column(cactusX - 7, cactusBase - 22, 11);
        rect(ctx, cactusX + 4, cactusBase - 18, 5, 3, tone('#4f9d5b'));
        column(cactusX + 7, cactusBase - 28, 13);
        const hop = tick % 70 < 3 ? -1 : 0;
        sprite(TROUPIAL, TROUPIAL_PAL, cactusX - 3, cactusBase - cactusH - 7 + hop, false);

        // blò-blò darting back and forth across the sand
        const run = tick % 170;
        let lizardX = 6, lizardFlip = false;
        if (run < 50) { lizardX = 6 + run; }
        else if (run < 85) { lizardX = 56; }
        else if (run < 135) { lizardX = 56 - (run - 85); lizardFlip = true; }
        else { lizardFlip = true; }
        sprite(BLOBLO, BLOBLO_PAL, lizardX, H - 4, lizardFlip);

        const blink = tick % 48 < 2;
        const pal = blink ? { ...IGUANA_PAL, e: IGUANA_PAL.g } : IGUANA_PAL;
        const flick = tick % 40 < 4 ? 1 : 0;
        sprite(IGUANA, pal, 34, sandTop - 12, false);
        sprite(IGUANA_LEGS[flick], pal, 34, sandTop - 7, false);
    }

    function drawFlamingo(x, phase, flip) {
        const feet = H - 3;
        const bob = (tick + phase) % 36 < 6 ? 1 : 0;
        const y = feet - FLAMINGO_BODY.length - FLAMINGO_HEAD.length + 1;
        sprite(FLAMINGO_BODY, FLAMINGO, x, y + FLAMINGO_HEAD.length - 1, flip);
        sprite(FLAMINGO_HEAD, FLAMINGO, flip ? x + 6 : x, y + bob, flip);
        const ripple = dark ? '#3b8c96' : '#c8f6f1';
        rect(ctx, x + 4, feet, 7, 1, ripple);
        if (tick % 16 < 8) rect(ctx, x + 2, feet + 1, 11, 1, ripple);
    }

    // A sand bar on the right with a wind-bent divi-divi tree and a goat (wide screens only).
    function drawSandBar() {
        const top = H - 6;
        [48, 46, 43, 38, 31, 21].forEach((w, k) => rect(ctx, W - w, H - 1 - k, w, 1, tone(k > 3 ? '#f7e3b0' : '#ecd092')));
        let tx = W - 11;
        for (let i = 0; i < 15; i++) {
            tx = W - 11 - Math.floor(i * 0.55);
            rect(ctx, tx, top - i, 2, 1, tone('#6d452c'));
        }
        const crownY = top - 15;
        [9, 15, 20, 24, 21].forEach((w, k) => rect(ctx, tx + 4 - w, crownY - 5 + k * 2, w, 2, tone(k === 4 ? '#2f6e40' : '#3d8a4f')));
        const graze = tick % 90 < 30 ? 1 : 0;
        sprite(GOAT, GOAT_PAL, W - 38, top - 7 + graze, false);
    }

    function drawTurtle() {
        const PERIOD = 420, SWIM = 300;
        const t = (tick + 150) % PERIOD;
        if (t >= SWIM) return;
        const rightward = Math.floor((tick + 150) / PERIOD) % 2 === 0;
        const p = t / SWIM;
        const x = rightward ? -16 + p * (W + 32) : W + 16 - p * (W + 32);
        const y = horizon + (H - horizon) * 0.42 + Math.sin(p * 14) * 2;
        sprite(TURTLE, TURTLE_PAL, Math.round(x), Math.round(y), !rightward);
        sprite([TURTLE_FLIPPERS[(tick >> 2) & 1]], TURTLE_PAL, Math.round(x), Math.round(y) + TURTLE.length, !rightward);
    }

    function drawPelican() {
        const PERIOD = 380, FLIGHT = 200;
        const t = (tick + 240) % PERIOD;
        if (t >= FLIGHT) return;
        const p = t / FLIGHT;
        const x = W + 18 - p * (W + 36);
        const y = horizon - 34 + Math.sin(p * 6) * 4;
        sprite(PELICAN[(tick >> 2) & 1], PELICAN_PAL, Math.round(x), Math.round(y), true);
    }

    function drawPrikichis() {
        const PERIOD = 300, FLIGHT = 90;
        const t = (tick + 60) % PERIOD;
        if (t >= FLIGHT) return;
        const p = t / FLIGHT;
        const x = -24 + p * (W + 48);
        const y = H * 0.4 + Math.sin(p * 11) * 5;
        [[0, 0], [-8, 4], [-15, -3], [-22, 5]].forEach(([dx, dy], i) => {
            sprite(PRIKICHI[((tick + i) >> 1) & 1], PRIKICHI_PAL, Math.round(x + dx), Math.round(y + dy), false);
        });
    }

    function drawParrot() {
        const PERIOD = 230, FLIGHT = 120;
        const t = tick % PERIOD;
        if (t >= FLIGHT) return;
        const leftward = Math.floor(tick / PERIOD) % 2 === 1;
        const p = t / FLIGHT;
        const x = leftward ? W + 15 - p * (W + 30) : -15 + p * (W + 30);
        const y = H * 0.22 + Math.sin(p * 9) * 6;
        sprite(PARROT[(tick >> 1) & 1], PARROT_PAL, Math.round(x), Math.round(y), leftward);
    }

    function draw() {
        if (W < 1 || H < 1) return; // tab opened in the background: wait for a real size
        const nowDark = document.documentElement.dataset.theme === 'dark';
        if (nowDark !== dark || !backdrop) {
            dark = nowDark;
            shaded.clear();
            drawBackdrop();
        }
        ctx.drawImage(backdrop, 0, 0);
        drawSky();
        drawSea();
        drawIsland();
        drawTurtle();
        // On wide screens the flamingos move left to make room for the sand bar.
        const wide = W >= 190;
        if (wide) drawSandBar();
        drawFlamingo(W - (wide ? 66 : 20), 0, false);
        drawFlamingo(W - (wide ? 88 : 38), 17, true);
        drawPelican();
        drawPrikichis();
        drawParrot();
    }

    function resize() {
        scale = window.innerWidth < 640 ? 3 : 4;
        W = Math.ceil(window.innerWidth / scale);
        H = Math.ceil(window.innerHeight / scale);
        canvas.width = W;
        canvas.height = H;
        horizon = Math.floor(H * 0.72);
        backdrop = null;
        draw();
    }

    let last = 0;
    function loop(now) {
        if (!document.hidden && now - last >= FRAME_MS) {
            last = now;
            if (!still.matches) tick++;
            draw(); // also picks up a theme switch when motion is reduced
        }
        window.requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    resize();
    window.requestAnimationFrame(loop);
})();
