'use strict';

/*
 * Stadium background: an original, code-drawn battle-arena scene inspired by
 * the look of Wii-era battle stadiums (glowing arena floor, sweeping spotlights,
 * crowd camera flashes, sparkles). No game assets are used.
 *
 * - Themes are picked from the floating "Stadium" control and saved in localStorage.
 * - Effects can be switched off; prefers-reduced-motion gets a single still frame.
 * - Rendering pauses while the tab is hidden.
 * - A richer renderer (assets/js/stadium3d.js) can take over via
 *   window.Stadium.register(); this 2D scene then stays as the fallback.
 */

(function () {
    const THEMES = {
        arena: {
            label: 'Arena',
            skyTop: '#020617', skyBottom: '#0b2266', stands: '#030a24',
            floorInner: '#1d4ed8', floorOuter: '#06112e',
            ring: '#7cc4ff', glow: '#3b82f6', beam: '#a9dcff', particle: '#d6efff',
            accent: '#60a5fa'
        },
        neon: {
            label: 'Neon',
            skyTop: '#05010f', skyBottom: '#33105c', stands: '#0a0320',
            floorInner: '#7e22ce', floorOuter: '#12052a',
            ring: '#ff5fdc', glow: '#c026d3', beam: '#22d3ee', particle: '#f5c2ff',
            accent: '#e879f9', cityLights: true
        },
        crystal: {
            label: 'Crystal',
            skyTop: '#02101c', skyBottom: '#0d5275', stands: '#031a2a',
            floorInner: '#38bdf8', floorOuter: '#062436',
            ring: '#b9f6ff', glow: '#22d3ee', beam: '#e6fbff', particle: '#ffffff',
            accent: '#67e8f9', shards: true
        },
        sunset: {
            label: 'Sunset',
            skyTop: '#160622', skyBottom: '#a1401a', stands: '#1c0816',
            floorInner: '#ea580c', floorOuter: '#2a0a17',
            ring: '#ffc58a', glow: '#f97316', beam: '#ffe5a3', particle: '#ffe0bf',
            accent: '#fb923c'
        },
        starlight: {
            label: 'Starlight',
            skyTop: '#000004', skyBottom: '#141046', stands: '#03021a',
            floorInner: '#6366f1', floorOuter: '#07061c',
            ring: '#c9bcff', glow: '#818cf8', beam: '#e4e8ff', particle: '#ffffff',
            accent: '#a5b4fc', stars: true
        }
    };

    const STORAGE_THEME = 'stadium-theme';
    const STORAGE_FX = 'stadium-effects';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const store = {
        get(key, fallback) {
            try { return localStorage.getItem(key) ?? fallback; } catch (e) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
        }
    };

    let themeKey = store.get(STORAGE_THEME, 'arena');
    if (!THEMES[themeKey]) themeKey = 'arena';
    let effectsOn = store.get(STORAGE_FX, 'on') !== 'off';

    const canvas = document.createElement('canvas');
    canvas.className = 'stadium-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');

    let w = 0, h = 0, dpr = 1;
    let particles = [], shards = [], stars = [], flashes = [], burst = null;
    let rafId = null, lastTime = 0, time = 0;
    let external = null; // 3D renderer, once registered

    const rand = (min, max) => min + Math.random() * (max - min);

    function hexToRgba(hex, alpha) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }

    // --- Scene geometry -------------------------------------------------------

    function floorGeometry() {
        const parallax = Math.min(window.scrollY * 0.06, h * 0.12);
        const rx = Math.max(w * 0.62, 420);
        return { cx: w / 2, cy: h * 0.86 - parallax, rx, ry: rx * 0.2 };
    }

    // --- Entities ---------------------------------------------------------------

    function makeParticle(initial) {
        const f = floorGeometry();
        return {
            x: f.cx + rand(-f.rx, f.rx),
            y: initial ? rand(0, h) : f.cy + rand(-f.ry, f.ry),
            vy: rand(-28, -10),
            vx: rand(-6, 6),
            size: rand(1.2, 3.2),
            phase: rand(0, Math.PI * 2),
            spark: Math.random() < 0.25
        };
    }

    function makeShard() {
        return {
            x: rand(0, w), y: rand(0, h * 0.75),
            size: rand(14, 42), angle: rand(0, Math.PI), spin: rand(-0.15, 0.15),
            drift: rand(-6, -2), alpha: rand(0.06, 0.16)
        };
    }

    function resetEntities() {
        const area = (w * h) / (1440 * 900);
        particles = Array.from({ length: Math.round(80 * Math.min(area, 1.6)) }, () => makeParticle(true));
        shards = Array.from({ length: 14 }, makeShard);
        stars = Array.from({ length: Math.round(220 * Math.min(area, 1.6)) }, () => ({
            x: rand(0, w), y: rand(0, h * 0.7), r: rand(0.3, 1.4), phase: rand(0, Math.PI * 2)
        }));
        flashes = [];
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        resetEntities();
        if (!external && !isAnimating()) drawFrame(0);
    }

    // --- Drawing ----------------------------------------------------------------

    function drawSky(t) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, t.skyTop);
        g.addColorStop(0.75, t.skyBottom);
        g.addColorStop(1, t.skyTop);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        if (t.stars) {
            stars.forEach(s => {
                const a = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.8 + s.phase));
                ctx.fillStyle = `rgba(255,255,255,${a})`;
                ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
            });
        }
    }

    function drawStands(t, f) {
        const top = f.cy - f.ry - h * 0.24;
        const bottom = f.cy - f.ry * 0.4;

        // Stadium bowl silhouette
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(f.cx, bottom, f.rx * 1.45, bottom - top, 0, Math.PI, Math.PI * 2);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, hexToRgba(t.stands, 0));
        g.addColorStop(0.35, hexToRgba(t.stands, 0.9));
        g.addColorStop(0.55, hexToRgba(t.stands, 0.8));
        g.addColorStop(1, hexToRgba(t.stands, 0));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.clip();

        // Seating tiers
        ctx.strokeStyle = hexToRgba(t.ring, 0.07);
        ctx.lineWidth = 1;
        for (let i = 1; i < 9; i++) {
            const y = top + ((bottom - top) * i) / 9;
            ctx.beginPath();
            ctx.ellipse(f.cx, bottom, f.rx * 1.45 * (1 - i * 0.012), bottom - y, 0, Math.PI, Math.PI * 2);
            ctx.stroke();
        }

        // City lights behind the stands (neon theme)
        if (t.cityLights) {
            for (let i = 0; i < 60; i++) {
                const x = (i * 97.3) % w;
                const y = top + ((i * 53.1) % ((bottom - top) * 0.5));
                const a = 0.2 + 0.3 * Math.abs(Math.sin(time * 0.6 + i));
                ctx.fillStyle = hexToRgba(i % 2 ? t.ring : t.beam, a);
                ctx.fillRect(x, y, 2, 2);
            }
        }

        // Crowd camera flashes
        flashes.forEach(fl => {
            const a = Math.max(0, 1 - fl.age / fl.life);
            const r = 1.5 + 6 * a;
            const glow = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r * 3);
            glow.addColorStop(0, `rgba(255,255,255,${a})`);
            glow.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(fl.x - r * 3, fl.y - r * 3, r * 6, r * 6);
        });
        ctx.restore();

        return { top, bottom };
    }

    function drawSpotlights(t, f) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const sources = [-0.42, -0.15, 0.15, 0.42];
        sources.forEach((s, i) => {
            const sx = f.cx + s * w * 1.1;
            const sy = -40;
            const sweep = Math.sin(time * 0.35 + i * 1.7) * f.rx * 0.45;
            const tx = f.cx + sweep + s * f.rx * 0.5;
            const ty = f.cy;
            const spread = f.rx * 0.16;

            const g = ctx.createLinearGradient(sx, sy, tx, ty);
            g.addColorStop(0, hexToRgba(t.beam, 0.16));
            g.addColorStop(0.7, hexToRgba(t.beam, 0.05));
            g.addColorStop(1, hexToRgba(t.beam, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(sx - 6, sy);
            ctx.lineTo(sx + 6, sy);
            ctx.lineTo(tx + spread, ty);
            ctx.lineTo(tx - spread, ty);
            ctx.closePath();
            ctx.fill();

            // Pool of light where the beam hits the floor
            ctx.save();
            ctx.translate(tx, ty);
            ctx.scale(1, f.ry / f.rx);
            const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, spread * 1.6);
            pool.addColorStop(0, hexToRgba(t.beam, 0.14));
            pool.addColorStop(1, hexToRgba(t.beam, 0));
            ctx.fillStyle = pool;
            ctx.beginPath();
            ctx.arc(0, 0, spread * 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        ctx.restore();
    }

    function drawFloor(t, f) {
        ctx.save();
        ctx.translate(f.cx, f.cy);
        ctx.scale(1, f.ry / f.rx);

        // Base disc
        const base = ctx.createRadialGradient(0, 0, 0, 0, 0, f.rx);
        base.addColorStop(0, hexToRgba(t.floorInner, 0.55));
        base.addColorStop(0.55, hexToRgba(t.floorInner, 0.18));
        base.addColorStop(1, hexToRgba(t.floorOuter, 0));
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.arc(0, 0, f.rx, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = t.glow;
        ctx.shadowBlur = 18;

        // Concentric rings
        [0.95, 0.78, 0.5, 0.3].forEach((r, i) => {
            ctx.strokeStyle = hexToRgba(t.ring, 0.16 + i * 0.06);
            ctx.lineWidth = i === 1 ? 3 : 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, f.rx * r, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Rotating segmented ring
        const segments = 24;
        ctx.strokeStyle = hexToRgba(t.ring, 0.5);
        ctx.lineWidth = 5;
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2 + time * 0.12;
            ctx.beginPath();
            ctx.arc(0, 0, f.rx * 0.64, a0, a0 + (Math.PI * 2) / segments * 0.55);
            ctx.stroke();
        }

        // Radial spokes
        ctx.strokeStyle = hexToRgba(t.ring, 0.08);
        ctx.lineWidth = 1;
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2 - time * 0.05;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * f.rx * 0.3, Math.sin(a) * f.rx * 0.3);
            ctx.lineTo(Math.cos(a) * f.rx * 0.95, Math.sin(a) * f.rx * 0.95);
            ctx.stroke();
        }

        // Centre emblem: two counter-rotating hexagons
        [[0.22, time * -0.25, 0.55], [0.16, time * 0.4, 0.35]].forEach(([r, rot, a]) => {
            ctx.strokeStyle = hexToRgba(t.ring, a);
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const ang = rot + (i / 6) * Math.PI * 2;
                const x = Math.cos(ang) * f.rx * r;
                const y = Math.sin(ang) * f.rx * r;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        });

        // Pulsing core
        const pulse = 0.5 + 0.5 * Math.sin(time * 1.6);
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, f.rx * 0.32);
        core.addColorStop(0, hexToRgba(t.glow, 0.25 + 0.15 * pulse));
        core.addColorStop(1, hexToRgba(t.glow, 0));
        ctx.shadowBlur = 0;
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, f.rx * 0.32, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Horizon haze so the floor blends into the stands
        const haze = ctx.createLinearGradient(0, f.cy - f.ry * 1.6, 0, f.cy);
        haze.addColorStop(0, hexToRgba(t.glow, 0));
        haze.addColorStop(1, hexToRgba(t.glow, 0.08));
        ctx.fillStyle = haze;
        ctx.fillRect(0, f.cy - f.ry * 1.6, w, f.ry * 1.6);
    }

    function drawSparkle(x, y, size, alpha, color) {
        ctx.fillStyle = hexToRgba(color, alpha);
        ctx.beginPath();
        ctx.moveTo(x, y - size * 3);
        ctx.lineTo(x + size * 0.6, y);
        ctx.lineTo(x, y + size * 3);
        ctx.lineTo(x - size * 0.6, y);
        ctx.closePath();
        ctx.moveTo(x - size * 3, y);
        ctx.lineTo(x, y + size * 0.6);
        ctx.lineTo(x + size * 3, y);
        ctx.lineTo(x, y - size * 0.6);
        ctx.closePath();
        ctx.fill();
    }

    function drawParticles(t) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        particles.forEach(p => {
            const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(time * 2 + p.phase));
            const fade = Math.min(1, p.y / (h * 0.25));
            const a = twinkle * fade * 0.6;
            if (p.spark) {
                drawSparkle(p.x, p.y, p.size * 0.9, a, t.particle);
            } else {
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
                g.addColorStop(0, hexToRgba(t.particle, a));
                g.addColorStop(1, hexToRgba(t.particle, 0));
                ctx.fillStyle = g;
                ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);
            }
        });

        if (t.shards) {
            shards.forEach(s => {
                ctx.save();
                ctx.translate(s.x, s.y);
                ctx.rotate(s.angle);
                ctx.fillStyle = hexToRgba(t.beam, s.alpha);
                ctx.strokeStyle = hexToRgba(t.ring, s.alpha * 2.2);
                ctx.beginPath();
                ctx.moveTo(0, -s.size);
                ctx.lineTo(s.size * 0.35, 0);
                ctx.lineTo(0, s.size);
                ctx.lineTo(-s.size * 0.35, 0);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        }
        ctx.restore();
    }

    // Entrance: a ring of light bursts out behind the hero, with a quick flash.
    function drawBurst(t) {
        if (!burst) return;
        const p = burst.age / burst.life;
        if (p >= 1) { burst = null; return; }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ease = 1 - Math.pow(1 - p, 3);
        const radius = ease * Math.max(w, h) * 0.6;

        ctx.strokeStyle = hexToRgba(t.beam, (1 - p) * 0.9);
        ctx.lineWidth = 10 * (1 - p) + 1;
        ctx.shadowColor = t.glow;
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        burst.rays.forEach(r => {
            const dist = ease * r.speed;
            drawSparkle(burst.x + Math.cos(r.angle) * dist, burst.y + Math.sin(r.angle) * dist, r.size, (1 - p), t.particle);
        });

        if (p < 0.25) {
            ctx.fillStyle = `rgba(255,255,255,${(0.25 - p) * 1.2})`;
            ctx.fillRect(0, 0, w, h);
        }
        ctx.restore();
    }

    function drawFrame(dt) {
        const t = THEMES[themeKey];
        const f = floorGeometry();

        drawSky(t);
        drawStands(t, f);
        drawSpotlights(t, f);
        drawFloor(t, f);
        drawParticles(t);
        drawBurst(t);

        // Soft vignette keeps the edges calm behind content
        const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, w, h);
    }

    // --- Simulation ------------------------------------------------------------

    function update(dt) {
        time += dt;
        const f = floorGeometry();

        particles.forEach((p, i) => {
            p.y += p.vy * dt;
            p.x += (p.vx + Math.sin(time + p.phase) * 8) * dt;
            if (p.y < -20) particles[i] = makeParticle(false);
        });

        shards.forEach(s => {
            s.angle += s.spin * dt;
            s.y += s.drift * dt;
            if (s.y < -60) { s.y = h * 0.75; s.x = rand(0, w); }
        });

        // Spawn crowd camera flashes in the stands
        if (Math.random() < dt * 6) {
            const top = f.cy - f.ry - h * 0.2;
            flashes.push({
                x: f.cx + rand(-f.rx * 1.2, f.rx * 1.2),
                y: rand(top, f.cy - f.ry * 0.6),
                age: 0, life: rand(0.12, 0.3)
            });
        }
        flashes.forEach(fl => { fl.age += dt; });
        flashes = flashes.filter(fl => fl.age < fl.life);

        if (burst) burst.age += dt;
    }

    function isAnimating() {
        return effectsOn && !reduceMotion.matches;
    }

    function loop(now) {
        // rAF timestamps can be slightly earlier than performance.now() on the first frame
        const dt = Math.max(0, Math.min((now - lastTime) / 1000 || 0, 0.05));
        lastTime = now;
        update(dt);
        drawFrame(dt);
        rafId = requestAnimationFrame(loop);
    }

    function start() {
        stop();
        document.documentElement.dataset.stadiumFx = effectsOn ? 'on' : 'off';
        if (external) {
            external.setVisible(effectsOn);
            if (effectsOn) external.start({ still: reduceMotion.matches });
            return;
        }
        canvas.hidden = !effectsOn;
        if (!effectsOn) return;
        if (reduceMotion.matches) {
            time = 4;
            drawFrame(0);
            return;
        }
        lastTime = performance.now();
        rafId = requestAnimationFrame(loop);
    }

    function stop() {
        if (external) external.stop();
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    function triggerBurst() {
        if (!isAnimating()) return;
        if (external) { external.burst(); return; }
        const hero = document.getElementById('home');
        const rect = hero ? hero.getBoundingClientRect() : null;
        burst = {
            x: rect ? Math.min(w * 0.3, rect.left + rect.width * 0.25) : w / 2,
            y: rect ? Math.max(120, rect.top + rect.height * 0.4) : h * 0.4,
            age: 0, life: 1.4,
            rays: Array.from({ length: 28 }, () => ({ angle: rand(0, Math.PI * 2), speed: rand(140, 420), size: rand(1.5, 3.5) }))
        };
    }

    // --- Theme + controls -------------------------------------------------------

    function applyTheme(key) {
        themeKey = key;
        store.set(STORAGE_THEME, key);
        document.documentElement.dataset.stadium = key;
        document.documentElement.style.setProperty('--stadium-accent', THEMES[key].accent);
        document.documentElement.style.setProperty('--stadium-glow', THEMES[key].glow);
        if (external) external.setTheme(key, THEMES[key]);
        else if (!isAnimating() && effectsOn) drawFrame(0);
        updateControls();
    }

    let controls = null;

    function buildControls() {
        const wrap = document.createElement('div');
        wrap.className = 'stadium-control';
        wrap.innerHTML = `
            <div class="stadium-panel" id="stadium-panel" hidden>
                <p class="stadium-panel-title">Choose a stadium</p>
                <div class="stadium-themes" role="group" aria-label="Stadium theme">
                    ${Object.entries(THEMES).map(([key, t]) => `
                        <button type="button" class="stadium-theme" data-theme="${key}" aria-pressed="false">
                            <span class="stadium-swatch" style="background: linear-gradient(135deg, ${t.skyBottom}, ${t.ring});" aria-hidden="true"></span>
                            ${t.label}
                        </button>`).join('')}
                </div>
                <button type="button" class="stadium-fx" aria-pressed="true">Stadium effects: <span>On</span></button>
            </div>
            <button type="button" class="stadium-toggle" aria-expanded="false" aria-controls="stadium-panel">
                <span class="stadium-toggle-orb" aria-hidden="true"></span>
                Stadium
            </button>`;
        document.body.appendChild(wrap);

        const toggle = wrap.querySelector('.stadium-toggle');
        const panel = wrap.querySelector('.stadium-panel');
        const setOpen = (open) => {
            panel.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
        };

        toggle.addEventListener('click', () => setOpen(panel.hidden));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); }
        });
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) setOpen(false);
        });

        wrap.querySelectorAll('.stadium-theme').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!effectsOn) { effectsOn = true; store.set(STORAGE_FX, 'on'); start(); }
                applyTheme(btn.dataset.theme);
                triggerBurst();
            });
        });

        wrap.querySelector('.stadium-fx').addEventListener('click', () => {
            effectsOn = !effectsOn;
            store.set(STORAGE_FX, effectsOn ? 'on' : 'off');
            start();
            updateControls();
        });

        controls = wrap;
        updateControls();
    }

    function updateControls() {
        if (!controls) return;
        controls.querySelectorAll('.stadium-theme').forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.theme === themeKey));
        });
        const fx = controls.querySelector('.stadium-fx');
        fx.setAttribute('aria-pressed', String(effectsOn));
        fx.querySelector('span').textContent = effectsOn ? 'On' : 'Off';
    }

    // --- Boot ---------------------------------------------------------------------

    function init() {
        if (!external) document.body.prepend(canvas);
        applyTheme(themeKey);
        resize();
        buildControls();
        start();

        // Entrance burst once per visit
        let seen = false;
        try { seen = sessionStorage.getItem('stadium-entrance') === '1'; sessionStorage.setItem('stadium-entrance', '1'); } catch (e) { /* ignore */ }
        if (!seen) triggerBurst();

        window.addEventListener('resize', resize);
        window.addEventListener('scroll', () => { if (!external && !isAnimating() && effectsOn) drawFrame(0); }, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stop(); else start();
        });
        reduceMotion.addEventListener?.('change', start);
    }

    /*
     * Hand rendering over to another renderer. `api` must provide
     * start({ still }), stop(), setVisible(bool), setTheme(key, theme) and burst().
     */
    function register(api) {
        stop();
        external = api;
        canvas.remove();
        window.removeEventListener('resize', resize);
        external.setTheme(themeKey, THEMES[themeKey]);
        start();
    }

    window.Stadium = { register, themes: THEMES };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
