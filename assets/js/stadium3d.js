/*
 * 3D battle stadiums (three.js).
 *
 * Seven original, code-built environments, each with a battle platform in the
 * middle: a night theme park on the water, a pastel plaza, an ocean cliff with a
 * waterfall, a crystal cave, sunset ruins, and a neon / starlight crowd bowl.
 * Original flying creatures loop over the platform and the camera cuts between
 * broadcast-style shots. No game assets are used.
 *
 * Loads after the page has finished loading, then takes over from the 2D
 * canvas in stadium.js via window.Stadium.register(). If WebGL or the module
 * import fails, nothing happens and the 2D stadium stays.
 */

const SCENES = {
    gateway: {
        env: 'gateway',
        skyTop: '#02030d', skyHorizon: '#1b1640', skyBottom: '#02030d',
        sunDir: [0, 0.3, -1], sunColor: '#ffffff', sunSize: 0,
        fog: '#0a0b22', fogDensity: 0.0032,
        hemi: 0.7, sun: 0.8, exposure: 1.15, centerLight: 10,
        glow: '#ffd27a', beam: '#fff3b0', beamOpacity: 0.22,
        stars: 0.5, clouds: null,
        platform: {
            sides: 64, h: 2.5, water: -2.4,
            base: '#22324a', alt: '#5a3a2e', line: '#f2dfa8', lineGlow: '#7de8ff', emissive: 0.35,
            side: 'dark', sideColor: '#2a2438', rim: '#7dff6a', rimTop: '#d9a441'
        },
        water: '#0b1430'
    },
    mainstreet: {
        env: 'mainstreet',
        skyTop: '#9fd3f2', skyHorizon: '#eef6fb', skyBottom: '#cfdde6',
        sunDir: [0.3, 0.9, 0.3], sunColor: '#fffaf0', sunSize: 0,
        fog: '#e4eef4', fogDensity: 0.0036,
        hemi: 2.0, sun: 2.4, exposure: 1.0, centerLight: 0,
        glow: '#ffd36b', beam: '#fff8e8', beamOpacity: 0.0,
        stars: 0, clouds: null,
        platform: {
            sides: 64, h: 5, water: null,
            base: '#f3c9a1', alt: '#8fc6e0', line: '#ffffff', lineGlow: '#ffe8b0', emissive: 0.12,
            side: 'cake', sideColor: '#d8774d', rim: null, rimTop: '#e9b949'
        }
    },
    waterfall: {
        env: 'waterfall',
        skyTop: '#3b86c4', skyHorizon: '#dff4ff', skyBottom: '#2aa6b8',
        sunDir: [0.35, 0.7, -0.5], sunColor: '#fff6e0', sunSize: 0.35,
        fog: '#c9ecf2', fogDensity: 0.0026,
        hemi: 1.6, sun: 2.6, exposure: 1.0, centerLight: 0,
        glow: '#b8fff0', beam: '#ffffff', beamOpacity: 0.0,
        stars: 0, clouds: '#ffffff',
        platform: {
            sides: 6, h: 16, water: -16,
            base: '#6f8f5a', alt: '#7d9b65', line: '#f4f1df', lineGlow: '#d6ffe0', emissive: 0.1,
            side: 'brick', sideColor: '#a88d63', rim: null, rimTop: '#cfd8d0'
        },
        water: '#1fb5c9'
    },
    crystal: {
        env: 'crystal',
        skyTop: '#000000', skyHorizon: '#000000', skyBottom: '#000000',
        sunDir: [0, 1, 0], sunColor: '#9fe8ff', sunSize: 0,
        fog: '#082326', fogDensity: 0.008,
        hemi: 1.0, sun: 0.6, exposure: 1.45, centerLight: 30,
        glow: '#7fe3ff', beam: '#bff4ff', beamOpacity: 0.0,
        stars: 0, clouds: null,
        platform: {
            sides: 8, h: 4, water: null,
            base: '#4a4a3c', alt: '#555545', line: '#d6fff8', lineGlow: '#7fe3ff', emissive: 0.6,
            side: 'stone', sideColor: '#3d3a33', rim: null, rimTop: '#58574b'
        }
    },
    sunset: {
        env: 'sunset',
        skyTop: '#2b1636', skyHorizon: '#ff9a4a', skyBottom: '#3a1f2e',
        sunDir: [0, 0.07, -1], sunColor: '#ffd27a', sunSize: 1,
        fog: '#b9704a', fogDensity: 0.0032,
        hemi: 1.5, sun: 2.6, exposure: 1.2, centerLight: 6,
        glow: '#ffbf6b', beam: '#ffe2a8', beamOpacity: 0.0,
        stars: 0.05, clouds: '#ffb48a',
        platform: {
            sides: 8, h: 2, water: -2,
            base: '#5d5a6e', alt: '#6c6878', line: '#f2d9a6', lineGlow: '#ffc27a', emissive: 0.15,
            side: 'stone', sideColor: '#8b7b6b', rim: null, rimTop: '#c9a36a'
        },
        water: '#4a3550'
    },
    neon: {
        env: 'bowl', skyline: true,
        skyTop: '#03010c', skyHorizon: '#3b1170', skyBottom: '#12052a',
        sunDir: [0, 0.3, -1], sunColor: '#ff5fdc', sunSize: 0,
        fog: '#1b0838', fogDensity: 0.0038,
        hemi: 0.45, sun: 0.6, exposure: 1.15, centerLight: 30,
        glow: '#ff4fd8', beam: '#3ee6ff', beamOpacity: 0.2,
        stars: 0.35, clouds: null,
        bowl: '#231a40', trim: '#22d3ee', trimGlow: 2.2,
        platform: {
            sides: 64, h: 1, water: null,
            base: '#12082c', alt: '#170b36', line: '#ff6be0', lineGlow: '#ff4fd8', emissive: 0.85,
            side: 'dark', sideColor: '#1a1030', rim: '#22d3ee', rimTop: '#ff5fdc'
        }
    },
    starlight: {
        env: 'bowl',
        skyTop: '#000006', skyHorizon: '#1c1766', skyBottom: '#06051c',
        sunDir: [-0.2, 0.5, -1], sunColor: '#c9bcff', sunSize: 0,
        fog: '#0b0a2a', fogDensity: 0.0035,
        hemi: 0.5, sun: 0.7, exposure: 1.1, centerLight: 24,
        glow: '#818cf8', beam: '#dfe4ff', beamOpacity: 0.16,
        stars: 1, clouds: null,
        bowl: '#1c1a3f', trim: '#a5b4fc', trimGlow: 2.0,
        platform: {
            sides: 64, h: 1, water: null,
            base: '#0d0c2e', alt: '#111038', line: '#c9bcff', lineGlow: '#818cf8', emissive: 0.9,
            side: 'dark', sideColor: '#15143a', rim: '#a5b4fc', rimTop: '#818cf8'
        }
    }
};

const CREATURE_COLORS = [
    ['#ffd166', '#ff9f1c'], ['#ff7aa8', '#ff3d7f'], ['#7cf3ff', '#2bb3ff'],
    ['#a6ff8f', '#3ddc84'], ['#c9a7ff', '#8b5cf6'], ['#ffffff', '#9fb4ff']
];

const PLATFORM_R = 22;
const BOWL = { inner: 34, tiers: 14, step: 2.6, rise: 1.7, stretch: 1.3 };

function whenPageLoaded() {
    return new Promise(resolve => {
        const idle = () => (window.requestIdleCallback ? requestIdleCallback(resolve, { timeout: 1500 }) : setTimeout(resolve, 200));
        if (document.readyState === 'complete') idle();
        else window.addEventListener('load', idle, { once: true });
    });
}

async function boot() {
    await whenPageLoaded();
    if (!window.Stadium) return;

    // Check for WebGL quietly first, so unsupported browsers don't log three.js errors
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;

    let THREE;
    try {
        THREE = await import('../vendor/three.module.min.js');
    } catch (e) {
        console.warn('3D stadium unavailable, keeping 2D stadium.', e);
        return;
    }

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) <= 1, powerPreference: 'high-performance' });
    } catch (e) {
        console.warn('WebGL unavailable, keeping 2D stadium.', e);
        return;
    }

    const stadium = buildStadium(THREE, renderer);
    window.Stadium.register(stadium.api);
}

function buildStadium(THREE, renderer) {
    const rand = (min, max) => min + Math.random() * (max - min);
    const color = (hex) => new THREE.Color(hex);
    const TAU = Math.PI * 2;

    // --- Renderer, DOM -----------------------------------------------------------

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.className = 'stadium-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    const shade = document.createElement('div');
    shade.className = 'stadium-shade';
    shade.setAttribute('aria-hidden', 'true');
    document.body.prepend(shade);
    document.body.prepend(canvas);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#000000', 0.004);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1400);

    // --- Lights ------------------------------------------------------------------

    const hemi = new THREE.HemisphereLight('#ffffff', '#223', 1);
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    const centerLight = new THREE.PointLight('#ffffff', 0, 120, 1.2);
    centerLight.position.set(0, 16, 0);
    const burstLight = new THREE.PointLight('#ffffff', 0, 160, 1.2);
    burstLight.position.set(0, 10, 0);
    scene.add(hemi, sun, centerLight, burstLight);

    // --- Textures ---------------------------------------------------------------

    function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const tex = new THREE.CanvasTexture(c);
        if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        if (repeat) {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeat[0], repeat[1]);
        }
        tex.userData.redraw = (...args) => { draw(c.getContext('2d'), w, h, ...args); tex.needsUpdate = true; };
        return tex;
    }
    function staticTexture(w, h, draw, opts) {
        const tex = canvasTexture(w, h, draw, opts);
        tex.userData.redraw();
        return tex;
    }

    function polygonPath(ctx, cx, cy, r, sides, rot) {
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
            const a = rot + (i / sides) * TAU;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // Battle platform top: mosaic wedges, rings, emblem and two trainer boxes (original layout)
    const platformTex = canvasTexture(1024, 1024, (ctx, W, H, p) => {
        const c = W / 2, R = W / 2;
        ctx.fillStyle = p.base;
        ctx.fillRect(0, 0, W, H);

        // Mosaic wedges
        const wedges = 16;
        for (let k = 0; k < wedges; k++) {
            if (k % 2) continue;
            ctx.fillStyle = p.alt;
            ctx.beginPath();
            ctx.moveTo(c, c);
            ctx.arc(c, c, R * 0.9, (k / wedges) * TAU, ((k + 1) / wedges) * TAU);
            ctx.closePath();
            ctx.fill();
        }

        // Fine tile grid
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 2;
        for (let i = 0; i < W; i += 32) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
        }

        // Soft centre light
        const g = ctx.createRadialGradient(c, c, 0, c, c, R);
        g.addColorStop(0, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = p.line;
        ctx.shadowColor = p.lineGlow;
        ctx.shadowBlur = 22;

        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.arc(c, c, R * 0.93, 0, TAU); ctx.stroke();
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(c, c, R * 0.86, 0, TAU); ctx.stroke();
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(c, c, R * 0.3, 0, TAU); ctx.stroke();
        polygonPath(ctx, c, c, R * 0.2, 6, Math.PI / 6); ctx.stroke();
        polygonPath(ctx, c, c, R * 0.11, 6, 0); ctx.stroke();

        // Centre line and trainer boxes
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(c, c - R * 0.86); ctx.lineTo(c, c - R * 0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c, c + R * 0.3); ctx.lineTo(c, c + R * 0.86); ctx.stroke();
        ctx.lineWidth = 9;
        [-1, 1].forEach(side => {
            roundRect(ctx, c + side * R * 0.6 - R * 0.11, c - R * 0.2, R * 0.22, R * 0.4, 18);
            ctx.stroke();
        });
    });

    // Platform side textures
    const cakeTex = staticTexture(1024, 256, (ctx, W, H) => {
        ctx.fillStyle = '#d8774d';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff6ec';
        ctx.beginPath();
        ctx.moveTo(0, H * 0.45);
        for (let x = 0; x <= W; x += 4) ctx.lineTo(x, H * 0.45 + Math.sin((x / W) * TAU * 6) * H * 0.14);
        for (let x = W; x >= 0; x -= 4) ctx.lineTo(x, H * 0.62 + Math.sin((x / W) * TAU * 6) * H * 0.14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let x = 0; x < W; x += 64) ctx.fillRect(x, 0, 2, H);
    }, { repeat: [4, 1] });

    const brickTex = staticTexture(512, 512, (ctx, W, H) => {
        ctx.fillStyle = '#a88d63';
        ctx.fillRect(0, 0, W, H);
        for (let y = 0; y < H; y += 32) {
            for (let x = ((y / 32) % 2) * 32; x < W; x += 64) {
                ctx.fillStyle = `hsl(36, ${rand(18, 30)}%, ${rand(42, 56)}%)`;
                ctx.fillRect(x + 2, y + 2, 60, 28);
            }
        }
        // Arched openings
        ctx.fillStyle = '#2a2318';
        [[80, 220], [330, 220]].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.moveTo(x, H);
            ctx.lineTo(x, y);
            ctx.arc(x + 50, y, 50, Math.PI, 0);
            ctx.lineTo(x + 100, H);
            ctx.closePath();
            ctx.fill();
        });
        ctx.fillStyle = 'rgba(70,110,50,0.35)';
        for (let i = 0; i < 40; i++) ctx.fillRect(rand(0, W), rand(0, H * 0.3), rand(10, 40), rand(4, 12));
    }, { repeat: [3, 1] });

    const stoneTex = staticTexture(512, 512, (ctx, W, H) => {
        ctx.fillStyle = '#8a8170';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = `rgba(${rand(40, 90) | 0},${rand(40, 85) | 0},${rand(35, 70) | 0},${rand(0.05, 0.2)})`;
            ctx.fillRect(rand(0, W), rand(0, H), rand(4, 40), rand(3, 18));
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 2;
        for (let y = 0; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }, { repeat: [2, 1] });

    const rippleTex = staticTexture(256, 256, (ctx, W, H) => {
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 260; i++) {
            const x = rand(0, W), y = rand(0, H), w = rand(10, 50);
            ctx.strokeStyle = `rgba(255,255,255,${rand(0.08, 0.35)})`;
            ctx.lineWidth = rand(1, 3);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y - 4, x + w, y); ctx.stroke();
        }
    }, { repeat: [40, 40] });

    const fallTex = staticTexture(64, 256, (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < 70; i++) {
            const x = rand(0, W), y = rand(0, H), h = rand(20, 90);
            const g = ctx.createLinearGradient(0, y, 0, y + h);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.5, `rgba(235,250,255,${rand(0.5, 0.95)})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x, y, rand(2, 6), h);
        }
        ctx.fillStyle = 'rgba(190,235,255,0.35)';
        ctx.fillRect(0, 0, W, H);
    }, { repeat: [1, 2] });

    const cloudTex = staticTexture(256, 128, (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < 14; i++) {
            const x = rand(W * 0.2, W * 0.8), y = rand(H * 0.4, H * 0.65), r = rand(22, 46);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,255,255,0.9)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
    });

    const dotTex = staticTexture(64, 64, (ctx, W) => {
        const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, W);
    });

    const windowTex = staticTexture(128, 256, (ctx, W, H) => {
        ctx.fillStyle = '#05030c';
        ctx.fillRect(0, 0, W, H);
        const colors = ['#22d3ee', '#ff5fdc', '#fde68a', '#a78bfa'];
        for (let y = 6; y < H; y += 14) {
            for (let x = 6; x < W; x += 16) {
                if (Math.random() < 0.45) {
                    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
                    ctx.globalAlpha = rand(0.4, 1);
                    ctx.fillRect(x, y, 8, 6);
                }
            }
        }
        ctx.globalAlpha = 1;
    });

    const screenTex = canvasTexture(512, 256, (ctx, W, H, accent, glow) => {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#020617');
        g.addColorStop(1, accent);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        for (let y = 0; y < H; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 120px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = glow;
        ctx.shadowBlur = 30;
        ctx.fillText('CK', W / 2, H / 2 - 18);
        ctx.font = '600 30px Inter, system-ui, sans-serif';
        ctx.shadowBlur = 0;
        ctx.fillText('SYSTEM & SECURITY', W / 2, H / 2 + 70);
    });

    // --- Shared materials ----------------------------------------------------------

    const glowMat = (hex) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
    const beamUniforms = { color: { value: color('#ffffff') }, opacity: { value: 0.1 } };
    const beamMat = new THREE.ShaderMaterial({
        uniforms: beamUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, fog: false,
        vertexShader: `
            varying float vT;
            void main() {
                vT = uv.y;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 color;
            uniform float opacity;
            varying float vT;
            void main() {
                gl_FragColor = vec4(color, opacity * pow(vT, 1.6));
            }`
    });
    const beamGeo = new THREE.CylinderGeometry(1.2, 7, 1, 32, 1, true);
    beamGeo.translate(0, 0.5, 0); // pivot at the far end (uv.y = 0 there, 1 at the lamp)

    const up = new THREE.Vector3(0, 1, 0);
    function aimBeam(beam, from, to) {
        const dir = new THREE.Vector3().subVectors(from, to);
        const len = dir.length();
        beam.position.copy(to);
        beam.quaternion.setFromUnitVectors(up, dir.normalize());
        beam.scale.set(1, len, 1);
    }

    const waterMat = new THREE.MeshStandardMaterial({ color: '#204060', map: rippleTex, roughness: 0.2, metalness: 0.35, emissive: '#204060', emissiveIntensity: 0.25 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(700, 64), waterMat);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    // --- Sky dome ------------------------------------------------------------------

    const skyUniforms = {
        top: { value: color('#000') }, horizon: { value: color('#000') }, bottom: { value: color('#000') },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: color('#fff') }, sunSize: { value: 0 }
    };
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(800, 32, 16),
        new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `
                uniform vec3 top, horizon, bottom, sunColor, sunDir;
                uniform float sunSize;
                varying vec3 vDir;
                void main() {
                    float h = vDir.y;
                    vec3 col = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.55, h)) : mix(horizon, bottom, smoothstep(0.0, 0.25, -h));
                    float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
                    col += sunColor * (pow(d, 900.0) * 2.5 + pow(d, 12.0) * 0.35) * sunSize;
                    gl_FragColor = vec4(col, 1.0);
                }`
        })
    );
    scene.add(sky);

    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 1800; i++) {
        const theta = rand(0, TAU), y = rand(0.02, 1), r = Math.sqrt(1 - y * y);
        starPos.push(Math.cos(theta) * r * 760, y * 760, Math.sin(theta) * r * 760);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const clouds = [];
    const cloudGroup = new THREE.Group();
    for (let i = 0; i < 22; i++) {
        const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: rand(0.55, 0.9), fog: false });
        const s = new THREE.Sprite(mat);
        const scale = rand(90, 170);
        s.scale.set(scale, scale / 2, 1);
        const a = rand(0, TAU), r = rand(300, 520), y = rand(60, 190);
        s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        clouds.push({ sprite: s, a, r, speed: rand(0.004, 0.012) });
        cloudGroup.add(s);
    }
    scene.add(cloudGroup);

    // --- Battle platform ----------------------------------------------------------------

    const platform = new THREE.Group();
    scene.add(platform);
    const platformTopMat = new THREE.MeshStandardMaterial({ map: platformTex, emissiveMap: platformTex, emissive: '#ffffff', roughness: 0.75 });
    const platformSideMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide });
    const platformRimMat = glowMat('#7dff6a');
    const platformTopRimMat = new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: 0.4, metalness: 0.5 });
    let platformParts = [];

    function buildPlatform(p) {
        platformParts.forEach(m => { platform.remove(m); m.geometry.dispose(); });
        const rot = p.sides === 8 ? Math.PI / 8 : p.sides === 6 ? Math.PI / 6 : 0;
        const top = new THREE.Mesh(new THREE.CircleGeometry(PLATFORM_R, p.sides, rot), platformTopMat);
        top.rotation.x = -Math.PI / 2;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R * (p.side === 'cake' ? 1.12 : 1.02), p.h, p.sides, 1, true, rot + Math.PI / 2), platformSideMat);
        body.position.y = -p.h / 2;
        const topRim = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R, 0.45, 6, Math.max(p.sides, 24)), platformTopRimMat);
        topRim.rotation.x = Math.PI / 2;
        topRim.rotation.z = rot;
        topRim.position.y = 0.05;
        platformParts = [top, body, topRim];
        if (p.rim) {
            const rim = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R * 1.02, 0.35, 6, 96), platformRimMat);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = -p.h + 0.3;
            platformParts.push(rim);
        }
        platformParts.forEach(m => platform.add(m));
    }

    // --- Environment: Gateway (night theme park on the water) ---------------------------------

    const envs = {};
    const updaters = {};

    {
        const g = new THREE.Group();
        const podBeams = [];

        // Four striped pods around the platform, each throwing a light beam
        const podTex = staticTexture(512, 128, (ctx, W, H) => {
            for (let x = 0; x < W; x += 32) {
                ctx.fillStyle = (x / 32) % 2 ? '#f2e3c4' : '#d9692e';
                ctx.fillRect(x, 0, 32, H);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(0, 0, W, 10);
        }, { repeat: [3, 1] });
        const podMat = new THREE.MeshStandardMaterial({ map: podTex, roughness: 0.6 });
        const podTopMat = new THREE.MeshStandardMaterial({ color: '#3a3150', roughness: 0.5, metalness: 0.3 });
        const greenGlow = glowMat('#8dff5a');
        [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].forEach((a, i) => {
            const pod = new THREE.Group();
            const r = PLATFORM_R + 11;
            pod.position.set(Math.cos(a) * r, -2.4, Math.sin(a) * r);
            const shell = new THREE.Mesh(new THREE.CylinderGeometry(7, 9.5, 4.5, 40, 1, true), podMat);
            shell.position.y = 2.25;
            const lid = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7, 0.8, 40), podTopMat);
            lid.position.y = 4.6;
            const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 10, 0, TAU, 0, Math.PI / 2), podTopMat);
            dome.position.y = 5;
            const ring = new THREE.Mesh(new THREE.TorusGeometry(9.4, 0.35, 6, 64), greenGlow);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.4;
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), glowMat('#fff7c2'));
            lamp.position.y = 8.5;
            pod.add(shell, lid, dome, ring, lamp);
            g.add(pod);
            const beam = new THREE.Mesh(beamGeo, beamMat);
            g.add(beam);
            podBeams.push({ beam, from: pod.position.clone().add(new THREE.Vector3(0, 8.5, 0)), phase: i * 1.6 });
        });

        // Magenta coaster rail weaving around the platform
        const railPts = [];
        for (let i = 0; i < 48; i++) {
            const a = (i / 48) * TAU;
            const r = PLATFORM_R + 12 + Math.sin(a * 4) * 2;
            railPts.push(new THREE.Vector3(Math.cos(a) * r, 10 + Math.sin(a * 3) * 4, Math.sin(a) * r));
        }
        const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, true), 240, 0.35, 6, true), glowMat('#ff4fd8'));
        g.add(rail);

        // Fountain arcs from the platform edge into the water
        const ARCS = 14, DROPS = 26;
        const fountainGeo = new THREE.BufferGeometry();
        fountainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARCS * DROPS * 3), 3));
        const fountain = new THREE.Points(fountainGeo, new THREE.PointsMaterial({ color: '#7cc8ff', size: 0.9, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        g.add(fountain);

        // Shore: a ring of land with trees, string lights, a Ferris wheel and neon buildings
        const land = new THREE.Mesh(new THREE.RingGeometry(170, 420, 64), new THREE.MeshStandardMaterial({ color: '#0e1a14', roughness: 1 }));
        land.rotation.x = -Math.PI / 2;
        land.position.y = -1.6;
        g.add(land);

        const treeGeo = new THREE.ConeGeometry(3.2, 10, 6);
        const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: '#163626', roughness: 1, flatShading: true }), 420);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 420; i++) {
            const a = rand(0, TAU), r = rand(178, 240), s = rand(0.8, 1.5);
            m4.compose(new THREE.Vector3(Math.cos(a) * r, 3.4 * s, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
            trees.setMatrixAt(i, m4);
        }
        g.add(trees);

        const shoreLights = [];
        for (let i = 0; i < 260; i++) {
            const a = (i / 260) * TAU;
            shoreLights.push(Math.cos(a) * 171, -0.8, Math.sin(a) * 171);
        }
        const shoreGeo = new THREE.BufferGeometry();
        shoreGeo.setAttribute('position', new THREE.Float32BufferAttribute(shoreLights, 3));
        g.add(new THREE.Points(shoreGeo, new THREE.PointsMaterial({ color: '#fff4c4', size: 1.4, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

        const wheel = new THREE.Group();
        wheel.position.set(150, 42, -230);
        wheel.lookAt(0, 42, 0);
        const wheelSpin = new THREE.Group();
        wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(34, 0.9, 8, 96), glowMat('#47e4ff')));
        wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(26, 0.4, 6, 96), glowMat('#ff5fdc')));
        const cabinColors = ['#ffd166', '#ff5fdc', '#7dff6a', '#47e4ff'];
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * TAU;
            const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 34, 4), glowMat('#c7f5ff'));
            spoke.position.set(Math.cos(a) * 17, Math.sin(a) * 17, 0);
            spoke.rotation.z = a - Math.PI / 2;
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 3.4), glowMat(cabinColors[i % 4]));
            cabin.position.set(Math.cos(a) * 34, Math.sin(a) * 34, 0);
            wheelSpin.add(spoke, cabin);
        }
        wheel.add(wheelSpin);
        const legMat = new THREE.MeshStandardMaterial({ color: '#2a2a3a' });
        [-1, 1].forEach(s => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 46, 6), legMat);
            leg.position.set(s * 12, -21, 0);
            leg.rotation.z = s * 0.28;
            wheel.add(leg);
        });
        g.add(wheel);

        const neonColors = ['#ff5fdc', '#ffd166', '#47e4ff', '#ff7a3d'];
        for (let i = 0; i < 9; i++) {
            const a = -Math.PI / 2 + (i - 4) * 0.22 + rand(-0.05, 0.05);
            const r = rand(250, 300);
            const h = rand(25, 60), w = rand(18, 34);
            const b = new THREE.Group();
            b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
            b.lookAt(0, 0, 0);
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.6), new THREE.MeshStandardMaterial({ color: '#141026', roughness: 0.8 }));
            body.position.y = h / 2;
            b.add(body);
            for (let k = 0; k < 4; k++) {
                const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, rand(0.8, 2.2), w * 0.62), glowMat(neonColors[(i + k) % 4]));
                band.position.y = h * (0.25 + k * 0.2);
                b.add(band);
            }
            g.add(b);
        }

        envs.gateway = g;
        updaters.gateway = (t, dt) => {
            podBeams.forEach(pb => {
                const target = new THREE.Vector3(Math.sin(t * 0.4 + pb.phase) * 40, 70 + Math.cos(t * 0.3 + pb.phase) * 20, Math.cos(t * 0.35 + pb.phase) * 40);
                aimBeam(pb.beam, pb.from, target);
            });
            const pos = fountainGeo.attributes.position.array;
            let k = 0;
            for (let a = 0; a < ARCS; a++) {
                const ang = (a / ARCS) * TAU + 0.2;
                for (let d = 0; d < DROPS; d++) {
                    const s = ((d / DROPS) + t * 0.45 + a * 0.13) % 1;
                    const r = PLATFORM_R + 0.5 + s * 8;
                    pos[k++] = Math.cos(ang) * r;
                    pos[k++] = -0.5 + Math.sin(s * Math.PI) * 4 - s * 1.8;
                    pos[k++] = Math.sin(ang) * r;
                }
            }
            fountainGeo.attributes.position.needsUpdate = true;
            wheelSpin.rotation.z += dt * 0.08;
        };
    }

    // --- Environment: Main Street (pastel plaza) ---------------------------------------------

    {
        const g = new THREE.Group();
        const tileTex = staticTexture(256, 256, (ctx, W, H) => {
            ctx.fillStyle = '#dfe8ef';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#e9f0f5';
            ctx.fillRect(0, 0, W / 2, H / 2);
            ctx.fillRect(W / 2, H / 2, W / 2, H / 2);
            ctx.strokeStyle = 'rgba(120,140,160,0.35)';
            ctx.lineWidth = 3;
            ctx.strokeRect(0, 0, W, H);
            ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        }, { repeat: [60, 60] });
        const floor = new THREE.Mesh(new THREE.CircleGeometry(160, 64), new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.35, metalness: 0.05 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -5;
        g.add(floor);

        // Hall wall with tall windows and columns
        const hallTex = staticTexture(512, 256, (ctx, W, H) => {
            ctx.fillStyle = '#c9d6e2';
            ctx.fillRect(0, 0, W, H);
            for (let x = 16; x < W; x += 64) {
                ctx.fillStyle = '#e8eef4';
                ctx.fillRect(x - 10, 0, 12, H);
                const g2 = ctx.createLinearGradient(0, 40, 0, 200);
                g2.addColorStop(0, '#7fb2d6');
                g2.addColorStop(1, '#d6ecf8');
                ctx.fillStyle = g2;
                roundRect(ctx, x + 8, 40, 36, 170, 16);
                ctx.fill();
            }
            ctx.fillStyle = '#e9b949';
            ctx.fillRect(0, 224, W, 10);
        }, { repeat: [10, 1] });
        const hall = new THREE.Mesh(new THREE.CylinderGeometry(110, 110, 70, 64, 1, true), new THREE.MeshStandardMaterial({ map: hallTex, roughness: 0.7, side: THREE.BackSide }));
        hall.position.y = 30;
        g.add(hall);
        const emblem = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
        emblem.position.set(0, 34, -108);
        g.add(emblem);

        // Golden arches with pearls around the platform top
        const goldMat = new THREE.MeshStandardMaterial({ color: '#e7b53c', roughness: 0.3, metalness: 0.8 });
        const pearlMats = [new THREE.MeshStandardMaterial({ color: '#f5b8d4', roughness: 0.25 }), new THREE.MeshStandardMaterial({ color: '#7fd6c8', roughness: 0.25 })];
        const ARCH = 18, archR = PLATFORM_R - 1.2;
        const span = 2 * archR * Math.sin(Math.PI / ARCH);
        for (let i = 0; i < ARCH; i++) {
            const a0 = (i / ARCH) * TAU, a1 = ((i + 1) / ARCH) * TAU;
            const p0 = new THREE.Vector3(Math.cos(a0) * archR, 0, Math.sin(a0) * archR);
            const p1 = new THREE.Vector3(Math.cos(a1) * archR, 0, Math.sin(a1) * archR);
            const arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.16, 6, 20, Math.PI), goldMat);
            arch.scale.y = 1.6;
            arch.position.copy(p0).add(p1).multiplyScalar(0.5);
            arch.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
            const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), pearlMats[i % 2]);
            pearl.position.set(p0.x, 0.55, p0.z);
            const topPearl = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), pearlMats[(i + 1) % 2]);
            topPearl.position.copy(arch.position).add(new THREE.Vector3(0, span / 2 * 1.6 + 0.3, 0));
            g.add(arch, pearl, topPearl);
        }

        // Balloon bowls on pedestals
        const balloonColors = ['#ffb3c7', '#b3e6ff', '#fff0a6', '#c7f7c1', '#e0c3ff', '#ffd1a6'];
        const balloonMats = balloonColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, emissive: c, emissiveIntensity: 0.1 }));
        const bowlMat2 = new THREE.MeshStandardMaterial({ color: '#6b4a3a', roughness: 0.7 });
        const pedestalMat = new THREE.MeshStandardMaterial({ color: '#eef2f6', roughness: 0.5 });
        const leafMat = new THREE.MeshStandardMaterial({ color: '#59b36b', roughness: 0.8 });
        const balloonGeo = new THREE.SphereGeometry(1.5, 14, 10);
        const balloons = [];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + Math.PI / 8;
            const r = 52;
            const base = new THREE.Group();
            base.position.set(Math.cos(a) * r, -5, Math.sin(a) * r);
            const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 7, 16), pedestalMat);
            ped.position.y = 3.5;
            const bowl = new THREE.Mesh(new THREE.CylinderGeometry(7, 4.5, 3.4, 24), bowlMat2);
            bowl.position.y = 8.7;
            const leaves = new THREE.Mesh(new THREE.TorusGeometry(6.8, 0.7, 6, 32), leafMat);
            leaves.rotation.x = Math.PI / 2;
            leaves.position.y = 10.3;
            base.add(ped, bowl, leaves);
            for (let k = 0; k < 9; k++) {
                const b = new THREE.Mesh(balloonGeo, balloonMats[(i + k) % balloonMats.length]);
                b.position.set(rand(-4, 4), rand(12, 16), rand(-4, 4));
                b.scale.y = 1.15;
                base.add(b);
                balloons.push({ mesh: b, y: b.position.y, phase: rand(0, TAU) });
            }
            g.add(base);
        }

        // Falling confetti
        const CONF = 260;
        const confGeo = new THREE.BufferGeometry();
        const confPos = new Float32Array(CONF * 3);
        const confCol = new Float32Array(CONF * 3);
        for (let i = 0; i < CONF; i++) {
            confPos[i * 3] = rand(-60, 60); confPos[i * 3 + 1] = rand(-5, 60); confPos[i * 3 + 2] = rand(-60, 60);
            const c = color(balloonColors[i % balloonColors.length]);
            confCol[i * 3] = c.r; confCol[i * 3 + 1] = c.g; confCol[i * 3 + 2] = c.b;
        }
        confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3));
        confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
        g.add(new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.7, vertexColors: true })));

        envs.mainstreet = g;
        updaters.mainstreet = (t, dt) => {
            balloons.forEach(b => { b.mesh.position.y = b.y + Math.sin(t * 1.2 + b.phase) * 0.4; });
            for (let i = 0; i < CONF; i++) {
                confPos[i * 3 + 1] -= dt * 3.5;
                confPos[i * 3] += Math.sin(t * 2 + i) * dt * 0.8;
                if (confPos[i * 3 + 1] < -5) confPos[i * 3 + 1] = 60;
            }
            confGeo.attributes.position.needsUpdate = true;
        };
    }

    // --- Environment: Waterfall (ocean cliff) ---------------------------------------------------

    {
        const g = new THREE.Group();
        const rockMat = new THREE.MeshStandardMaterial({ color: '#8a8270', roughness: 1, flatShading: true });
        const mossMat = new THREE.MeshStandardMaterial({ color: '#3f6b2f', roughness: 1, flatShading: true });
        const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 });

        // Mossy cliff behind the platform
        const cliff = new THREE.Group();
        cliff.position.set(-30, -16, -62);
        const rocks = [
            [0, 10, 0, 34, 30, 30], [22, 6, 12, 26, 22, 24], [-24, 4, 8, 24, 20, 22], [6, 34, -6, 24, 26, 22],
            [-12, 28, 10, 18, 18, 18], [24, 26, -4, 18, 16, 18], [2, 54, -4, 16, 16, 14], [-26, 20, -14, 22, 26, 20],
            [36, 4, -10, 20, 16, 20], [-40, 2, -4, 18, 14, 18]
        ];
        rocks.forEach(([x, y, z, sx, sy, sz]) => {
            const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
            r.scale.set(sx, sy, sz);
            r.position.set(x, y, z);
            r.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
            cliff.add(r);
            const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mossMat);
            moss.scale.set(sx * 0.95, sy * 0.45, sz * 0.95);
            moss.position.set(x + rand(-2, 2), y + sy * 0.55, z + rand(-2, 2));
            cliff.add(moss);
        });
        g.add(cliff);

        // Waterfalls down the cliff and from the walkway
        const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const bigFall = new THREE.Mesh(new THREE.PlaneGeometry(9, 76), fallMat);
        bigFall.position.set(-24, 20, -38);
        bigFall.lookAt(0, 20, 0);
        g.add(bigFall);
        const smallFall = new THREE.Mesh(new THREE.PlaneGeometry(5, 50), fallMat);
        smallFall.position.set(-2, 10, -48);
        smallFall.lookAt(0, 10, 0);
        g.add(smallFall);

        // Mist at the base of the falls
        const mist = [];
        for (let i = 0; i < 6; i++) {
            const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.6 }));
            m.scale.set(28, 12, 1);
            m.position.set(-24 + rand(-8, 8), -14 + rand(0, 4), -36 + rand(-4, 4));
            mist.push({ sprite: m, phase: rand(0, TAU) });
            g.add(m);
        }

        // Curved stone walkway on pillars around the platform
        const walk = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R + 9, 1.4, 6, 80, Math.PI * 1.25), stoneMat);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = Math.PI * 0.55;
        walk.scale.z = 0.5;
        walk.position.y = 8;
        g.add(walk);
        for (let i = 0; i <= 10; i++) {
            const a = Math.PI * 0.55 + (i / 10) * Math.PI * 1.25;
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 24, 8), stoneMat);
            pillar.position.set(Math.cos(a) * (PLATFORM_R + 9), -4, -Math.sin(a) * (PLATFORM_R + 9));
            g.add(pillar);
            if (i % 3 === 1) {
                const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 24), fallMat);
                f.position.set(Math.cos(a) * (PLATFORM_R + 7.5), -4, -Math.sin(a) * (PLATFORM_R + 7.5));
                f.lookAt(0, -4, 0);
                g.add(f);
            }
        }

        envs.waterfall = g;
        updaters.waterfall = (t) => {
            fallTex.offset.y = -t * 0.9;
            mist.forEach(m => { m.sprite.material.opacity = 0.45 + Math.sin(t * 0.8 + m.phase) * 0.15; });
        };
    }

    // --- Environment: Crystal (cave) --------------------------------------------------------------

    {
        const g = new THREE.Group();
        const caveGeo = new THREE.SphereGeometry(160, 28, 18);
        const cp = caveGeo.attributes.position;
        for (let i = 0; i < cp.count; i++) {
            const s = rand(0.82, 1.08);
            cp.setXYZ(i, cp.getX(i) * s, Math.max(cp.getY(i) * s * 0.7, -6), cp.getZ(i) * s);
        }
        caveGeo.computeVertexNormals();
        g.add(new THREE.Mesh(caveGeo, new THREE.MeshStandardMaterial({ color: '#1d3330', roughness: 1, flatShading: true, side: THREE.BackSide })));

        const floor = new THREE.Mesh(new THREE.CircleGeometry(170, 48), new THREE.MeshStandardMaterial({ color: '#1a2421', roughness: 1 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -4;
        g.add(floor);

        // Twisted root pillars
        const rootMat = new THREE.MeshStandardMaterial({ color: '#2e2620', roughness: 1, flatShading: true });
        for (let i = 0; i < 12; i++) {
            const geo = new THREE.CylinderGeometry(rand(2.5, 4), rand(5, 8), 120, 8, 16);
            const p = geo.attributes.position;
            const phase = rand(0, TAU);
            for (let k = 0; k < p.count; k++) {
                const y = p.getY(k);
                p.setX(k, p.getX(k) + Math.sin(y * 0.05 + phase) * 4);
                p.setZ(k, p.getZ(k) + Math.cos(y * 0.04 + phase) * 4);
            }
            geo.computeVertexNormals();
            const root = new THREE.Mesh(geo, rootMat);
            const a = (i / 12) * TAU + rand(-0.2, 0.2), r = rand(80, 118);
            root.position.set(Math.cos(a) * r, 56, Math.sin(a) * r);
            g.add(root);
        }

        // Glowing teal pools
        const poolMat = glowMat('#1f8f8a');
        for (let i = 0; i < 7; i++) {
            const pool = new THREE.Mesh(new THREE.CircleGeometry(rand(5, 10), 24), poolMat);
            pool.rotation.x = -Math.PI / 2;
            const a = rand(0, TAU), r = rand(34, 80);
            pool.position.set(Math.cos(a) * r, -3.9, Math.sin(a) * r);
            g.add(pool);
        }

        // Thin falls from the cave walls
        const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false, opacity: 0.5, side: THREE.DoubleSide });
        [0.6, 2.4, 4.2].forEach(a => {
            const f = new THREE.Mesh(new THREE.PlaneGeometry(3, 70), fallMat);
            f.position.set(Math.cos(a) * 110, 30, Math.sin(a) * 110);
            f.lookAt(0, 30, 0);
            g.add(f);
        });

        // Floating glowing crystals
        const crystalMat = new THREE.MeshBasicMaterial({ color: '#6fe4ff', transparent: true, opacity: 0.9, fog: false, toneMapped: false });
        const crystals = [];
        for (let i = 0; i < 70; i++) {
            const m = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.8, 2.4), 0), crystalMat);
            m.scale.y = rand(1.3, 2);
            const a = rand(0, TAU), r = rand(PLATFORM_R + 4, 110);
            m.position.set(Math.cos(a) * r, rand(2, 70), Math.sin(a) * r);
            m.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
            crystals.push({ mesh: m, y: m.position.y, spin: rand(-0.6, 0.6), phase: rand(0, TAU) });
            g.add(m);
        }
        const crystalLights = [0, 1, 2, 3].map(i => {
            const l = new THREE.PointLight('#5fd8ff', 300, 90, 1.5);
            l.position.set(Math.cos(i * 1.6) * 40, 20, Math.sin(i * 1.6) * 40);
            g.add(l);
            return l;
        });

        envs.crystal = g;
        updaters.crystal = (t, dt) => {
            fallTex.offset.y = -t * 0.9;
            crystals.forEach(c => {
                c.mesh.rotation.y += c.spin * dt;
                c.mesh.position.y = c.y + Math.sin(t * 0.7 + c.phase) * 1.5;
            });
            crystalLights.forEach((l, i) => { l.intensity = 260 + Math.sin(t * 1.3 + i) * 60; });
        };
    }

    // --- Environment: Sunset (ruins in the water) -------------------------------------------------

    {
        const g = new THREE.Group();
        const ruinMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: '#d9b99a', roughness: 0.95, flatShading: true });

        // Broken ring wall, open toward the causeway
        const SEG = 26;
        for (let i = 0; i < SEG; i++) {
            const a = (i / SEG) * TAU;
            if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.35) continue; // causeway gap
            if (Math.random() < 0.12) continue;
            const h = rand(5, 15);
            const r = PLATFORM_R + 6;
            const w = (TAU * r) / SEG + 0.4;
            const seg = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.6), ruinMat);
            seg.position.set(Math.cos(a) * r, -2 + h / 2, Math.sin(a) * r);
            seg.lookAt(0, seg.position.y, 0);
            seg.rotation.z += rand(-0.05, 0.05);
            g.add(seg);
        }

        // Standing and broken pillars
        for (let i = 0; i < 8; i++) {
            const a = rand(0, TAU), r = PLATFORM_R + rand(9, 14);
            const p = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, rand(10, 22), 8), ruinMat);
            p.position.set(Math.cos(a) * r, 4, Math.sin(a) * r);
            p.rotation.set(rand(-0.25, 0.25), 0, rand(-0.25, 0.25));
            g.add(p);
        }

        // Causeway to the platform
        const causeway = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 90), ruinMat);
        causeway.position.set(0, -1.6, PLATFORM_R + 45);
        g.add(causeway);
        const edgeMat = new THREE.MeshStandardMaterial({ color: '#e7b25c', roughness: 0.4, metalness: 0.6 });
        [-3.1, 3.1].forEach(x => {
            const e = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 90), edgeMat);
            e.position.set(x, -1, PLATFORM_R + 45);
            g.add(e);
        });

        // T-shaped stones in the water
        [[-70, 40], [80, 30], [-110, -60], [120, -80]].forEach(([x, z]) => {
            const post = new THREE.Mesh(new THREE.BoxGeometry(4, 22, 4), ruinMat);
            post.position.set(x, 9, z);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 5), ruinMat);
            cap.position.set(x, 21, z);
            g.add(post, cap);
        });

        // Islands with trees on the horizon
        const islandMat = new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 });
        const treeMat = new THREE.MeshStandardMaterial({ color: '#2a3a24', roughness: 1, flatShading: true });
        [[-260, -320, 60], [280, -300, 70], [-380, -120, 50]].forEach(([x, z, s]) => {
            const island = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 8, 0, TAU, 0, Math.PI / 2), islandMat);
            island.scale.y = 0.12;
            island.position.set(x, -2, z);
            g.add(island);
            for (let i = 0; i < 26; i++) {
                const tr = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(5, 9), 0), treeMat);
                tr.position.set(x + rand(-s * 0.7, s * 0.7), rand(4, 9), z + rand(-s * 0.4, s * 0.4));
                g.add(tr);
            }
        });

        // Sun reflection on the water
        const glintTex = staticTexture(64, 512, (ctx, W, H) => {
            const gr = ctx.createLinearGradient(0, 0, 0, H);
            gr.addColorStop(0, 'rgba(255,220,140,0.9)');
            gr.addColorStop(1, 'rgba(255,160,80,0)');
            ctx.fillStyle = gr;
            for (let y = 0; y < H; y += 6) ctx.fillRect(rand(0, W * 0.3), y, rand(W * 0.4, W), 3);
        });
        const glint = new THREE.Mesh(new THREE.PlaneGeometry(40, 600), new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        glint.rotation.x = -Math.PI / 2;
        glint.position.set(0, -1.9, -320);
        g.add(glint);

        envs.sunset = g;
        updaters.sunset = (t) => { glintTex.offset.x = Math.sin(t * 0.5) * 0.05; };
    }

    // --- Environment: crowd bowl (neon / starlight) -----------------------------------------------

    const bowlMat = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.8, side: THREE.DoubleSide });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 1, roughness: 0.4 });
    const seatMats = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.7, side: THREE.DoubleSide }));
    const lampMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const crowdPos = [], crowdBase = [], crowdCol = [];
    const towers = [];
    const rimR = BOWL.inner + BOWL.tiers * BOWL.step;
    const rimY = 1.2 + BOWL.tiers * BOWL.rise;
    let crowdGeo, flashGeo, skyline;
    const FLASHES = 60;
    const flashLife = new Float32Array(FLASHES);

    {
        const g = new THREE.Group();
        const bowl = new THREE.Group();
        bowl.scale.set(BOWL.stretch, 1, 1);

        const apron = new THREE.Mesh(new THREE.CircleGeometry(BOWL.inner + 1, 96), new THREE.MeshStandardMaterial({ color: '#141226', roughness: 0.95 }));
        apron.rotation.x = -Math.PI / 2;
        apron.position.y = -1.02;
        bowl.add(apron);

        const wall = new THREE.Mesh(new THREE.CylinderGeometry(BOWL.inner, BOWL.inner, 2.2, 128, 1, true), bowlMat);
        wall.position.y = 0.1;
        bowl.add(wall);
        const wallTrim = new THREE.Mesh(new THREE.TorusGeometry(BOWL.inner - 0.05, 0.14, 6, 160), trimMat);
        wallTrim.rotation.x = Math.PI / 2;
        wallTrim.position.y = 1.2;
        bowl.add(wallTrim);

        const crowdPalette = ['#ffffff', '#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#f72585', '#ffb703', '#90e0ef'].map(color);
        for (let i = 0; i < BOWL.tiers; i++) {
            const r0 = BOWL.inner + i * BOWL.step;
            const y0 = 1.2 + i * BOWL.rise;
            const riser = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, BOWL.rise, 128, 1, true), bowlMat);
            riser.position.y = y0 + BOWL.rise / 2;
            bowl.add(riser);
            const tread = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + BOWL.step, 128, 1), seatMats[i % 2]);
            tread.rotation.x = -Math.PI / 2;
            tread.position.y = y0 + BOWL.rise;
            bowl.add(tread);
            const count = 150 + i * 14;
            for (let k = 0; k < count; k++) {
                const a = rand(0, TAU);
                if (Math.abs(((a / (Math.PI / 6)) % 1) - 0.5) > 0.46) continue;
                const r = r0 + rand(0.5, BOWL.step - 0.5);
                crowdPos.push(Math.cos(a) * r * BOWL.stretch, y0 + BOWL.rise + 0.55, Math.sin(a) * r);
                crowdBase.push(a, y0 + BOWL.rise + 0.55);
                const c = crowdPalette[(Math.random() * crowdPalette.length) | 0].clone().multiplyScalar(rand(0.45, 0.85));
                crowdCol.push(c.r, c.g, c.b);
            }
        }
        g.add(bowl);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.5, 8, 160), trimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = rimY + 0.4;
        rim.scale.set(BOWL.stretch, 1, 1);
        const backWall = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, 7, 128, 1, true), bowlMat);
        backWall.scale.set(BOWL.stretch, 1, 1);
        backWall.position.y = rimY + 3.5;
        g.add(rim, backWall);

        crowdGeo = new THREE.BufferGeometry();
        crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute(crowdPos, 3));
        crowdGeo.setAttribute('color', new THREE.Float32BufferAttribute(crowdCol, 3));
        g.add(new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.75, vertexColors: true, map: dotTex, transparent: true, depthWrite: false })));

        flashGeo = new THREE.BufferGeometry();
        flashGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FLASHES * 3), 3));
        flashGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(FLASHES * 3), 3));
        g.add(new THREE.Points(flashGeo, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

        const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
        [-1, 1].forEach(side => {
            const s = new THREE.Group();
            const frame = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 1.2), new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.6 }));
            const screen = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), screenMat);
            screen.position.z = 0.65;
            s.add(frame, screen);
            s.position.set(side * (rimR * BOWL.stretch + 2), rimY + 10, 0);
            s.lookAt(0, rimY + 6, 0);
            g.add(s);
        });

        const towerMat = new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.7, metalness: 0.4 });
        [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].forEach((a, i) => {
            const r = rimR + 6;
            const base = new THREE.Vector3(Math.cos(a) * r * BOWL.stretch, 0, Math.sin(a) * r);
            const height = rimY + 24;
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, height, 10), towerMat);
            pole.position.set(base.x, height / 2, base.z);
            const head = new THREE.Group();
            const housing = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1.4), towerMat);
            const lamps = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), lampMat);
            lamps.position.z = 0.75;
            head.add(housing, lamps);
            head.position.set(base.x, height, base.z);
            head.lookAt(0, 0, 0);
            const beam = new THREE.Mesh(beamGeo, beamMat);
            g.add(pole, head, beam);
            towers.push({ lamp: new THREE.Vector3(base.x, height, base.z), beam, phase: i * 1.7 });
        });

        // Neon skyline (neon theme only)
        skyline = new THREE.Group();
        const buildingMat = new THREE.MeshStandardMaterial({ color: '#0b0618', emissive: '#ffffff', emissiveMap: windowTex, emissiveIntensity: 1.1, roughness: 0.9 });
        const signColors = ['#ff5fdc', '#22d3ee', '#ffd166', '#a78bfa'];
        for (let i = 0; i < 90; i++) {
            const a = (i / 90) * TAU + rand(-0.02, 0.02);
            const r = rand(170, 240);
            const h = rand(30, 110), w = rand(10, 22);
            const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), buildingMat);
            b.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
            b.lookAt(0, h / 2, 0);
            if (Math.random() < 0.55) {
                const sign = new THREE.Mesh(new THREE.BoxGeometry(w * rand(0.4, 0.8), rand(2, 5), 0.5), glowMat(signColors[i % signColors.length]));
                sign.position.set(0, rand(-h * 0.1, h * 0.35), w / 2 + 0.4);
                b.add(sign);
            }
            skyline.add(b);
        }
        g.add(skyline);

        envs.bowl = g;
        updaters.bowl = (t) => {
            towers.forEach(tw => {
                const target = new THREE.Vector3(Math.sin(t * 0.3 + tw.phase) * PLATFORM_R * 0.8, 0, Math.cos(t * 0.23 + tw.phase) * PLATFORM_R * 0.8);
                aimBeam(tw.beam, tw.lamp, target);
            });
            const pos = crowdGeo.attributes.position.array;
            for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
                const wave = Math.max(0, Math.sin(crowdBase[j] * 2 - t * 1.4));
                pos[i + 1] = crowdBase[j + 1] + Math.pow(wave, 10) * 0.9;
            }
            crowdGeo.attributes.position.needsUpdate = true;

            const fp = flashGeo.attributes.position.array;
            const fc = flashGeo.attributes.color.array;
            for (let i = 0; i < FLASHES; i++) {
                flashLife[i] -= 1 / 60;
                if (flashLife[i] <= 0 && Math.random() < 0.02) {
                    const k = ((Math.random() * (crowdPos.length / 3)) | 0) * 3;
                    fp[i * 3] = crowdPos[k]; fp[i * 3 + 1] = crowdPos[k + 1] + 0.4; fp[i * 3 + 2] = crowdPos[k + 2];
                    flashLife[i] = rand(0.08, 0.2);
                }
                fc[i * 3] = fc[i * 3 + 1] = fc[i * 3 + 2] = Math.min(Math.max(0, flashLife[i]) * 5, 1);
            }
            flashGeo.attributes.position.needsUpdate = true;
            flashGeo.attributes.color.needsUpdate = true;
        };
    }

    Object.values(envs).forEach(e => scene.add(e));

    // --- Field sparkles ---------------------------------------------------------------------

    const SPARKS = 120;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkVel = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i++) {
        const a = rand(0, TAU), r = Math.sqrt(Math.random()) * PLATFORM_R;
        sparkPos[i * 3] = Math.cos(a) * r;
        sparkPos[i * 3 + 1] = rand(0, 30);
        sparkPos[i * 3 + 2] = Math.sin(a) * r;
        sparkVel[i] = rand(1.5, 4);
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({ size: 0.7, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff', opacity: 0.8 });
    scene.add(new THREE.Points(sparkGeo, sparkMat));

    // --- Flying creatures (original designs) ------------------------------------------------

    function makeWingGeometry() {
        const geo = new THREE.BufferGeometry();
        const v = [
            0, 0, 0.7, 3.6, 0.3, -0.4, 0, 0, -0.6,
            3.6, 0.3, -0.4, 4.4, 0.4, -1.6, 0, 0, -0.6
        ];
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
    }
    const wingGeo = makeWingGeometry();
    const bodyGeo = new THREE.IcosahedronGeometry(1, 1);
    const headGeo = new THREE.IcosahedronGeometry(0.62, 1);
    const eyeGeo = new THREE.SphereGeometry(0.13, 8, 8);
    const crestGeo = new THREE.ConeGeometry(0.2, 1.1, 6);
    const tailGeo = new THREE.ConeGeometry(0.16, 2.4, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#0b1020' });
    const TRAIL = 36;

    const creatures = CREATURE_COLORS.map(([main, accent], i) => {
        const bodyMat = new THREE.MeshStandardMaterial({ color: main, emissive: main, emissiveIntensity: 0.35, roughness: 0.45, flatShading: true });
        const wingMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55, roughness: 0.5, side: THREE.DoubleSide, flatShading: true, transparent: true, opacity: 0.92 });

        const g = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.scale.set(0.85, 0.75, 1.5);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.set(0, 0.35, 1.35);
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(0.3, 0.55, 1.82);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(-0.3, 0.55, 1.82);
        const crest = new THREE.Mesh(crestGeo, wingMat);
        crest.position.set(0, 1.0, 1.1); crest.rotation.x = -0.9;
        const tailA = new THREE.Mesh(tailGeo, wingMat);
        tailA.position.set(0.25, 0, -1.9); tailA.rotation.x = -Math.PI / 2 - 0.2;
        const tailB = tailA.clone(); tailB.position.x = -0.25;
        const wingL = new THREE.Mesh(wingGeo, wingMat); wingL.position.set(0.55, 0.2, 0);
        const wingR = new THREE.Mesh(wingGeo, wingMat); wingR.position.set(-0.55, 0.2, 0); wingR.scale.x = -1;
        g.add(body, head, eyeL, eyeR, crest, tailA, tailB, wingL, wingR);
        g.scale.setScalar(i === 5 ? 1.5 : rand(0.9, 1.2));
        scene.add(g);

        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
        const trailCol = new Float32Array(TRAIL * 3);
        const c = color(accent);
        for (let k = 0; k < TRAIL; k++) {
            const f = 1 - k / TRAIL;
            trailCol[k * 3] = c.r * f; trailCol[k * 3 + 1] = c.g * f; trailCol[k * 3 + 2] = c.b * f;
        }
        trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
        const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
            size: 1.6, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        scene.add(trail);

        return {
            group: g, wingL, wingR, trail, history: [],
            radius: 12 + (i % 3) * 8, height: 9 + (i % 2) * 7 + i * 1.5, speed: 0.16 + i * 0.015,
            dir: i % 2 ? 1 : -1, phase: (i / CREATURE_COLORS.length) * TAU, flap: 7 + i * 0.6
        };
    });

    function creaturePos(c, t, out) {
        const a = c.phase + c.dir * c.speed * t;
        return out.set(
            Math.cos(a) * c.radius * 1.2 + Math.sin(t * 0.7 + c.phase) * 4,
            c.height + Math.sin(t * 1.1 + c.phase) * 3,
            Math.sin(a) * c.radius + Math.cos(t * 0.5 + c.phase) * 3
        );
    }

    const cPos = new THREE.Vector3(), cNext = new THREE.Vector3();
    function updateCreatures(t, dt) {
        creatures.forEach(c => {
            creaturePos(c, t, cPos);
            creaturePos(c, t + 0.08, cNext);
            c.group.position.copy(cPos);
            c.group.lookAt(cNext);
            c.group.rotateZ(Math.sin(t * 0.9 + c.phase) * 0.35 * c.dir);
            const flap = Math.sin(t * c.flap + c.phase);
            c.wingL.rotation.z = flap * 0.7;
            c.wingR.rotation.z = -flap * 0.7;
            if (dt > 0) {
                c.history.unshift(cPos.x, cPos.y, cPos.z);
                if (c.history.length > TRAIL * 3) c.history.length = TRAIL * 3;
            }
            const arr = c.trail.geometry.attributes.position.array;
            for (let k = 0; k < TRAIL * 3; k++) arr[k] = c.history[k] ?? cPos.getComponent(k % 3);
            c.trail.geometry.attributes.position.needsUpdate = true;
        });
    }

    // --- Entrance burst ------------------------------------------------------------------------

    const burstRings = [0, 1].map(() => {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.2;
        m.visible = false;
        scene.add(m);
        return m;
    });
    let burst = null;

    function updateBurst(dt) {
        if (!burst) return;
        burst.age += dt;
        const p = burst.age / 1.6;
        if (p >= 1) {
            burst = null;
            burstRings.forEach(r => { r.visible = false; });
            burstLight.intensity = 0;
            return;
        }
        const ease = 1 - Math.pow(1 - p, 3);
        burstRings.forEach((r, i) => {
            r.visible = true;
            const s = 1 + ease * (i ? 40 : 60);
            r.scale.set(s, s, s);
            r.material.opacity = (1 - p) * (i ? 0.7 : 1);
        });
        burstLight.intensity = (1 - p) * 4000;
    }

    // --- Camera direction ----------------------------------------------------------------------

    const SHOT_LENGTH = 11;
    const BLEND = 3;
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const shots = [
        // Wide orbit
        u => ({ pos: v(Math.cos(0.5 + u * 0.035) * 64, 30, Math.sin(0.5 + u * 0.035) * 50), look: v(0, 0, 0) }),
        // Low, behind a trainer box
        u => ({ pos: v(-26 + u * 0.25, 6, 5 - u * 0.35), look: v(12, 2, 0) }),
        // Chasing a flyer
        () => {
            const c = creatures[1];
            const p = creaturePos(c, clock - 3.4, new THREE.Vector3());
            const ahead = creaturePos(c, clock + 0.6, new THREE.Vector3());
            return { pos: p.add(v(0, 7, 0)), look: ahead };
        },
        // High overhead, slowly turning
        u => ({ pos: v(Math.sin(u * 0.05) * 25, 75, 42), look: v(0, 0, 0) }),
        // Side sweep
        u => ({ pos: v(-38 + u * 6, 9, 31), look: v(-10 + u * 2, 3, 0) })
    ];
    const introShot = () => ({ pos: v(0, 150, 280), look: v(0, 0, 0) });

    let clock = 0;
    let shotIndex = 0;
    let shotStart = 0;
    let introDone = false;
    const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

    function updateCamera() {
        let target;
        if (!introDone) {
            const p = Math.min(clock / 4.5, 1);
            const from = introShot(), to = shots[0](clock);
            const e = easeInOut(p);
            target = { pos: from.pos.lerp(to.pos, e), look: from.look.lerp(to.look, e) };
            if (p >= 1) { introDone = true; shotStart = clock; }
        } else {
            if (clock - shotStart > SHOT_LENGTH) {
                shotIndex = (shotIndex + 1) % shots.length;
                shotStart = clock;
            }
            const since = clock - shotStart;
            const now = shots[shotIndex](since);
            const prevIndex = (shotIndex + shots.length - 1) % shots.length;
            if (since < BLEND && (shotIndex !== 0 || clock > 4.5 + SHOT_LENGTH)) {
                const prev = shots[prevIndex](SHOT_LENGTH + since);
                const e = easeInOut(since / BLEND);
                target = { pos: prev.pos.lerp(now.pos, e), look: prev.look.lerp(now.look, e) };
            } else {
                target = now;
            }
        }
        const lift = Math.min(window.scrollY * 0.012, 30);
        camera.position.copy(target.pos).add(v(0, lift, 0));
        camera.lookAt(target.look.add(v(0, lift * 0.4, 0)));
    }

    // --- Theme ---------------------------------------------------------------------------------

    let currentScene = SCENES.gateway;

    function setTheme(key) {
        const s = SCENES[key] || SCENES.gateway;
        currentScene = s;
        const p = s.platform;

        skyUniforms.top.value.set(s.skyTop);
        skyUniforms.horizon.value.set(s.skyHorizon);
        skyUniforms.bottom.value.set(s.skyBottom);
        skyUniforms.sunDir.value.set(...s.sunDir).normalize();
        skyUniforms.sunColor.value.set(s.sunColor);
        skyUniforms.sunSize.value = s.sunSize;
        sky.visible = s.env !== 'crystal';

        scene.fog.color.set(s.fog);
        scene.fog.density = s.fogDensity;
        renderer.toneMappingExposure = s.exposure;

        hemi.color.set(s.skyHorizon === '#000000' ? '#3a6f73' : s.skyHorizon);
        hemi.groundColor.set(p.base);
        hemi.intensity = s.hemi;
        sun.color.set(s.sunColor);
        sun.intensity = s.sun;
        sun.position.set(...s.sunDir).multiplyScalar(100);
        centerLight.color.set(s.glow);
        burstLight.color.set(s.glow);

        // Platform
        buildPlatform(p);
        platform.position.y = 0;
        platformTex.userData.redraw(p);
        platformTopMat.emissiveIntensity = p.emissive;
        if (p.side === 'cake') { platformSideMat.map = cakeTex; platformSideMat.color.set('#ffffff'); }
        else if (p.side === 'brick') { platformSideMat.map = brickTex; platformSideMat.color.set('#ffffff'); }
        else if (p.side === 'stone') { platformSideMat.map = stoneTex; platformSideMat.color.set(p.sideColor); }
        else { platformSideMat.map = null; platformSideMat.color.set(p.sideColor); }
        platformSideMat.needsUpdate = true;
        if (p.rim) platformRimMat.color.set(p.rim);
        platformTopRimMat.color.set(p.rimTop);

        // Water
        water.visible = p.water !== null && !!s.water;
        if (water.visible) {
            water.position.y = p.water;
            waterMat.color.set(s.water);
            waterMat.emissive.set(s.water);
        }

        // Environments
        Object.entries(envs).forEach(([name, g]) => { g.visible = name === s.env; });
        if (s.env === 'bowl') {
            skyline.visible = !!s.skyline;
            bowlMat.color.set(s.bowl);
            trimMat.color.set(s.trim);
            trimMat.emissive.set(s.trim);
            trimMat.emissiveIntensity = s.trimGlow;
            seatMats[0].color.set(s.trim).lerp(color(s.bowl), 0.2);
            seatMats[1].color.set(s.trim).lerp(color(s.bowl), 0.5);
            lampMat.color.set(s.beam);
        }
        screenTex.userData.redraw(s.env === 'mainstreet' ? '#e7b53c' : (s.trim || s.glow), s.glow);

        beamUniforms.color.value.set(s.beam);
        beamUniforms.opacity.value = s.beamOpacity;
        sparkMat.color.set(s.glow);
        burstRings.forEach(r => r.material.color.set(s.glow));

        cloudGroup.visible = !!s.clouds;
        if (s.clouds) cloudGroup.children.forEach(c => c.material.color.set(s.clouds));
        stars.visible = s.stars > 0;

        // Settle the scene so a still frame looks right
        (updaters[s.env] || (() => {}))(clock, 0);
        if (still && visible) renderOnce();
    }

    // --- Loop + sizing ---------------------------------------------------------------------------

    let rafId = null;
    let last = 0;
    let still = false;
    let visible = true;

    function updateShared(t, dt) {
        clouds.forEach(c => {
            c.a += c.speed * dt;
            c.sprite.position.x = Math.cos(c.a) * c.r;
            c.sprite.position.z = Math.sin(c.a) * c.r;
        });
        for (let i = 0; i < SPARKS; i++) {
            sparkPos[i * 3 + 1] += sparkVel[i] * dt;
            if (sparkPos[i * 3 + 1] > 30) sparkPos[i * 3 + 1] = 0;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        rippleTex.offset.set(t * 0.004, t * 0.006);
        starMat.opacity = currentScene.stars * (0.85 + Math.sin(t * 2) * 0.15);
        centerLight.intensity = currentScene.centerLight * 40 * (0.85 + Math.sin(t * 1.6) * 0.15);
    }

    function resize() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 768 ? 1 : 1.5));
        renderer.setSize(w, h, false);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        camera.aspect = w / h;
        camera.fov = w < 768 ? 62 : 50;
        // On wide screens, shift the stadium right so the left column of text stays calm
        if (w >= 1024) camera.setViewOffset(w, h, -w * 0.14, 0, w, h);
        else camera.clearViewOffset();
        camera.updateProjectionMatrix();
        if (still && visible) renderOnce();
    }

    function step(dt) {
        clock += dt;
        (updaters[currentScene.env] || (() => {}))(clock, dt);
        updateShared(clock, dt);
        updateCreatures(clock, dt);
        updateBurst(dt);
        updateCamera();
    }

    function renderOnce() {
        renderer.render(scene, camera);
    }

    function loop(now) {
        const dt = Math.max(0, Math.min((now - last) / 1000 || 0, 0.05));
        last = now;
        step(dt);
        renderOnce();
        rafId = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    window.addEventListener('scroll', () => { if (still && visible) { updateCamera(); renderOnce(); } }, { passive: true });
    resize();

    const api = {
        start({ still: s } = {}) {
            api.stop();
            still = !!s;
            if (still) {
                // A composed still frame: wide shot, flyers in place, no motion
                clock = 4.5;
                introDone = true;
                shotIndex = 0;
                shotStart = clock;
                (updaters[currentScene.env] || (() => {}))(2, 0);
                updateShared(0, 0);
                updateCreatures(6, 0);
                updateCamera();
                renderOnce();
                return;
            }
            last = performance.now();
            rafId = requestAnimationFrame(loop);
        },
        stop() {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
        },
        setVisible(on) {
            visible = on;
            canvas.hidden = !on;
            shade.hidden = !on;
        },
        setTheme,
        burst() {
            burst = { age: 0 };
        }
    };

    // Test hook for screenshots: only with #stadium-debug in the URL
    if (location.hash.includes('stadium-debug')) {
        window.__stadiumDebug = {
            jump(t, shot) {
                api.stop();
                introDone = true;
                clock = t;
                shotIndex = shot;
                shotStart = t - BLEND - 1;
                for (let i = 0; i < 60; i++) step(1 / 60);
                renderOnce();
            }
        };
    }

    return { api };
}

boot();
