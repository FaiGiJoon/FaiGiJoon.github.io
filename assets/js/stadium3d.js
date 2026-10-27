/*
 * 3D battle stadium background (three.js).
 *
 * An original, code-built arena: tiered bowl with a cheering crowd, a glowing
 * battle field, light towers with sweeping beams, themed skies and props, and a
 * flock of original flying creatures. No game assets are used.
 *
 * Loads after the page has finished loading, then takes over from the 2D
 * canvas in stadium.js via window.Stadium.register(). If WebGL or the module
 * import fails, nothing happens and the 2D stadium stays.
 */

const SCENES = {
    arena: {
        skyTop: '#2a62c9', skyHorizon: '#bfe4ff', skyBottom: '#6f9fd6',
        sunDir: [0.4, 0.75, -0.5], sunColor: '#fff3d6', sunSize: 0.4,
        fog: '#a9d1f3', fogDensity: 0.0042,
        hemi: 1.6, sun: 2.6, exposure: 1.0,
        field: '#2f8f5b', fieldAlt: '#2a8253', fieldLine: '#f2fff8', fieldGlow: '#9be7ff', fieldEmissive: 0.18,
        bowl: '#dfe6f1', trim: '#3b82f6', trimGlow: 0.6,
        beam: '#eaf7ff', beamOpacity: 0.07, centerLight: 0,
        clouds: '#ffffff', stars: 0, skyline: false, shards: false
    },
    neon: {
        skyTop: '#03010c', skyHorizon: '#3b1170', skyBottom: '#12052a',
        sunDir: [0, 0.3, -1], sunColor: '#ff5fdc', sunSize: 0,
        fog: '#1b0838', fogDensity: 0.0038,
        hemi: 0.45, sun: 0.6, exposure: 1.15,
        field: '#12082c', fieldAlt: '#170b36', fieldLine: '#ff6be0', fieldGlow: '#ff4fd8', fieldEmissive: 0.85,
        bowl: '#231a40', trim: '#22d3ee', trimGlow: 2.2,
        beam: '#3ee6ff', beamOpacity: 0.2, centerLight: 30,
        clouds: null, stars: 0.35, skyline: true, shards: false
    },
    crystal: {
        skyTop: '#0b3f63', skyHorizon: '#c4f3ff', skyBottom: '#4fa3c4',
        sunDir: [-0.3, 0.6, -0.6], sunColor: '#e6fbff', sunSize: 0.25,
        fog: '#9fdcf0', fogDensity: 0.0048,
        hemi: 1.4, sun: 2.0, exposure: 1.0,
        field: '#8fd3ea', fieldAlt: '#86cbe3', fieldLine: '#ffffff', fieldGlow: '#5be0ff', fieldEmissive: 0.3,
        bowl: '#d9f4ff', trim: '#38bdf8', trimGlow: 1.0,
        beam: '#f0fdff', beamOpacity: 0.08, centerLight: 0,
        clouds: '#eafaff', stars: 0, skyline: false, shards: true
    },
    sunset: {
        skyTop: '#2a0d3f', skyHorizon: '#ff8a3d', skyBottom: '#7a2a2a',
        sunDir: [0.15, 0.08, -1], sunColor: '#ffcf7a', sunSize: 1,
        fog: '#c8673a', fogDensity: 0.0045,
        hemi: 0.9, sun: 2.2, exposure: 1.05,
        field: '#4f6b2f', fieldAlt: '#4a652c', fieldLine: '#fff1d6', fieldGlow: '#ffb35c', fieldEmissive: 0.25,
        bowl: '#e9c9b5', trim: '#f97316', trimGlow: 1.2,
        beam: '#ffe2a8', beamOpacity: 0.12, centerLight: 0,
        clouds: '#ffb38a', stars: 0.08, skyline: false, shards: false
    },
    starlight: {
        skyTop: '#000006', skyHorizon: '#1c1766', skyBottom: '#06051c',
        sunDir: [-0.2, 0.5, -1], sunColor: '#c9bcff', sunSize: 0,
        fog: '#0b0a2a', fogDensity: 0.0035,
        hemi: 0.5, sun: 0.7, exposure: 1.1,
        field: '#0d0c2e', fieldAlt: '#111038', fieldLine: '#c9bcff', fieldGlow: '#818cf8', fieldEmissive: 0.9,
        bowl: '#1c1a3f', trim: '#a5b4fc', trimGlow: 2.0,
        beam: '#dfe4ff', beamOpacity: 0.16, centerLight: 24,
        clouds: null, stars: 1, skyline: false, shards: false
    }
};

const CREATURE_COLORS = [
    ['#ffd166', '#ff9f1c'], ['#ff7aa8', '#ff3d7f'], ['#7cf3ff', '#2bb3ff'],
    ['#a6ff8f', '#3ddc84'], ['#c9a7ff', '#8b5cf6'], ['#ffffff', '#9fb4ff']
];

const FIELD = { w: 48, d: 30 };
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
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);

    // --- Lights ------------------------------------------------------------------

    const hemi = new THREE.HemisphereLight('#ffffff', '#223', 1);
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    const centerLight = new THREE.PointLight('#ffffff', 0, 120, 1.2);
    centerLight.position.set(0, 18, 0);
    const burstLight = new THREE.PointLight('#ffffff', 0, 160, 1.2);
    burstLight.position.set(0, 10, 0);
    scene.add(hemi, sun, centerLight, burstLight);

    // --- Sky dome ------------------------------------------------------------------

    const skyUniforms = {
        top: { value: color('#000') }, horizon: { value: color('#000') }, bottom: { value: color('#000') },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: color('#fff') }, sunSize: { value: 0 }
    };
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(600, 32, 16),
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

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 1800; i++) {
        const theta = rand(0, Math.PI * 2);
        const y = rand(0.02, 1);
        const r = Math.sqrt(1 - y * y);
        starPos.push(Math.cos(theta) * r * 560, y * 560, Math.sin(theta) * r * 560);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // --- Canvas textures ---------------------------------------------------------

    function canvasTexture(w, h, draw) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.userData.redraw = (...args) => { draw(c.getContext('2d'), w, h, ...args); tex.needsUpdate = true; };
        return tex;
    }

    function hexagon(ctx, cx, cy, r, rot) {
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
            const a = rot + (i / 6) * Math.PI * 2;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Battle field markings (original layout)
    const fieldTex = canvasTexture(1536, 960, (ctx, W, H, s) => {
        ctx.fillStyle = s.field;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = s.fieldAlt;
        for (let i = 0; i < 12; i += 2) ctx.fillRect((W / 12) * i, 0, W / 12, H);

        const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
        glow.addColorStop(0, 'rgba(255,255,255,0.10)');
        glow.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = s.fieldLine;
        ctx.shadowColor = s.fieldGlow;
        ctx.shadowBlur = 24;
        ctx.lineWidth = 10;
        const m = 60;
        ctx.strokeRect(m, m, W - m * 2, H - m * 2);
        ctx.beginPath(); ctx.moveTo(W / 2, m); ctx.lineTo(W / 2, H - m); ctx.stroke();
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 170, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 7;
        hexagon(ctx, W / 2, H / 2, 95, Math.PI / 6);
        hexagon(ctx, W / 2, H / 2, 55, 0);

        // Trainer boxes at each end
        ctx.lineWidth = 9;
        [m, W - m - 230].forEach(x => {
            ctx.strokeRect(x, H / 2 - 170, 230, 340);
            ctx.strokeRect(x + (x === m ? 0 : 130), H / 2 - 70, 100, 140);
        });

        // Corner arcs
        ctx.lineWidth = 7;
        [[m, m, 0], [W - m, m, Math.PI / 2], [W - m, H - m, Math.PI], [m, H - m, -Math.PI / 2]].forEach(([x, y, a]) => {
            ctx.beginPath(); ctx.arc(x, y, 50, a, a + Math.PI / 2); ctx.stroke();
        });
    });

    // Jumbo screens on the rim
    const screenTex = canvasTexture(512, 256, (ctx, W, H, s) => {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#020617');
        g.addColorStop(1, s.trim);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        for (let y = 0; y < H; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 120px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = s.fieldGlow;
        ctx.shadowBlur = 30;
        ctx.fillText('CK', W / 2, H / 2 - 18);
        ctx.font = '600 30px Inter, system-ui, sans-serif';
        ctx.shadowBlur = 0;
        ctx.fillText('SYSTEM & SECURITY', W / 2, H / 2 + 70);
    });

    // Lit windows for the neon skyline
    const windowTex = canvasTexture(128, 256, (ctx, W, H) => {
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
    windowTex.userData.redraw();

    // Soft cloud puff
    const cloudTex = canvasTexture(256, 128, (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < 14; i++) {
            const x = rand(W * 0.2, W * 0.8), y = rand(H * 0.4, H * 0.65), r = rand(22, 46);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,255,255,0.9)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
    });
    cloudTex.userData.redraw();

    // Round glow sprite for particles
    const dotTex = canvasTexture(64, 64, (ctx, W) => {
        const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, W);
    });
    dotTex.userData.redraw();

    // --- Field + apron -----------------------------------------------------------

    const fieldMat = new THREE.MeshStandardMaterial({ map: fieldTex, emissiveMap: fieldTex, emissive: '#ffffff', roughness: 0.85 });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.d), fieldMat);
    field.rotation.x = -Math.PI / 2;
    scene.add(field);

    const apronMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.95 });
    const apron = new THREE.Mesh(new THREE.CircleGeometry(BOWL.inner + 1, 96), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.scale.set(BOWL.stretch, 1, 1);
    apron.position.y = -0.05;
    scene.add(apron);

    // --- Bowl --------------------------------------------------------------------

    const bowl = new THREE.Group();
    bowl.scale.set(BOWL.stretch, 1, 1);
    const bowlMat = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.8, side: THREE.DoubleSide });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 1, roughness: 0.4 });
    const seatMats = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.7, side: THREE.DoubleSide }));

    // Front wall with a glowing trim line
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(BOWL.inner, BOWL.inner, 2.2, 128, 1, true), bowlMat);
    wall.position.y = 1.1;
    bowl.add(wall);
    const wallTrim = new THREE.Mesh(new THREE.TorusGeometry(BOWL.inner - 0.05, 0.14, 6, 160), trimMat);
    wallTrim.rotation.x = Math.PI / 2;
    wallTrim.position.y = 2.2;
    bowl.add(wallTrim);

    const crowdPos = [];
    const crowdBase = [];
    const crowdCol = [];
    const crowdPalette = ['#ffffff', '#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#f72585', '#ffb703', '#90e0ef'].map(color);

    for (let i = 0; i < BOWL.tiers; i++) {
        const r0 = BOWL.inner + i * BOWL.step;
        const y0 = 2.2 + i * BOWL.rise;

        const riser = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, BOWL.rise, 128, 1, true), bowlMat);
        riser.position.y = y0 + BOWL.rise / 2;
        bowl.add(riser);

        const tread = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + BOWL.step, 128, 1), seatMats[i % 2]);
        tread.rotation.x = -Math.PI / 2;
        tread.position.y = y0 + BOWL.rise;
        bowl.add(tread);

        // Crowd on this tier (skip aisles every 30 degrees)
        const count = 150 + i * 14;
        for (let k = 0; k < count; k++) {
            const a = rand(0, Math.PI * 2);
            if (Math.abs(((a / (Math.PI / 6)) % 1) - 0.5) > 0.46) continue;
            const r = r0 + rand(0.5, BOWL.step - 0.5);
            const x = Math.cos(a) * r * BOWL.stretch, z = Math.sin(a) * r, y = y0 + BOWL.rise + 0.55;
            crowdPos.push(x, y, z);
            crowdBase.push(a, y);
            const c = crowdPalette[(Math.random() * crowdPalette.length) | 0].clone().multiplyScalar(rand(0.45, 0.85));
            crowdCol.push(c.r, c.g, c.b);
        }
    }
    scene.add(bowl);

    const rimR = BOWL.inner + BOWL.tiers * BOWL.step;
    const rimY = 2.2 + BOWL.tiers * BOWL.rise;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.5, 8, 160), trimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = rimY + 0.4;
    rim.scale.set(BOWL.stretch, 1, 1);
    scene.add(rim);

    // Back wall behind the top tier
    const backWall = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, 7, 128, 1, true), bowlMat);
    backWall.scale.set(BOWL.stretch, 1, 1);
    backWall.position.y = rimY + 3.5;
    scene.add(backWall);

    const crowdGeo = new THREE.BufferGeometry();
    crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute(crowdPos, 3));
    crowdGeo.setAttribute('color', new THREE.Float32BufferAttribute(crowdCol, 3));
    const crowd = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.75, vertexColors: true, map: dotTex, transparent: true, depthWrite: false }));
    scene.add(crowd);

    // Camera flashes in the crowd
    const FLASHES = 60;
    const flashGeo = new THREE.BufferGeometry();
    flashGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FLASHES * 3), 3));
    flashGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(FLASHES * 3), 3));
    const flashLife = new Float32Array(FLASHES);
    const flashes = new THREE.Points(flashGeo, new THREE.PointsMaterial({
        size: 2.2, vertexColors: true, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    scene.add(flashes);

    // Jumbo screens at both ends of the rim
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
    [-1, 1].forEach(side => {
        const g = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 1.2), new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.6 }));
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), screenMat);
        screen.position.z = 0.65;
        g.add(frame, screen);
        g.position.set(side * (rimR * BOWL.stretch + 2), rimY + 10, 0);
        g.lookAt(0, rimY + 6, 0);
        scene.add(g);
    });

    // --- Light towers with sweeping beams ----------------------------------------

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
    const beamGeo = new THREE.CylinderGeometry(1.2, 9, 1, 32, 1, true);
    beamGeo.translate(0, 0.5, 0); // pivot at the floor end (uv.y = 0 at the floor, 1 at the lamp)
    const towerMat = new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.7, metalness: 0.4 });
    const lampMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });

    const towers = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((a, i) => {
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
        scene.add(pole, head);

        const beam = new THREE.Mesh(beamGeo, beamMat);
        scene.add(beam);
        return { lamp: new THREE.Vector3(base.x, height, base.z), beam, phase: i * 1.7 };
    });

    const up = new THREE.Vector3(0, 1, 0);
    const tmpV = new THREE.Vector3();
    function aimBeams(t) {
        towers.forEach(tw => {
            const target = new THREE.Vector3(Math.sin(t * 0.3 + tw.phase) * FIELD.w * 0.4, 0, Math.cos(t * 0.23 + tw.phase) * FIELD.d * 0.4);
            tmpV.subVectors(tw.lamp, target);
            const len = tmpV.length();
            tw.beam.position.copy(target);
            tw.beam.quaternion.setFromUnitVectors(up, tmpV.normalize());
            tw.beam.scale.set(1, len, 1);
        });
    }

    // --- Theme props -----------------------------------------------------------------

    // Clouds
    const clouds = [];
    const cloudGroup = new THREE.Group();
    for (let i = 0; i < 16; i++) {
        const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: rand(0.55, 0.9), fog: false });
        const s = new THREE.Sprite(mat);
        const scale = rand(70, 140);
        s.scale.set(scale, scale / 2, 1);
        const a = rand(0, Math.PI * 2), r = rand(260, 420), y = rand(70, 170);
        s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        clouds.push({ sprite: s, a, r, speed: rand(0.004, 0.012) });
        cloudGroup.add(s);
    }
    scene.add(cloudGroup);

    // Neon skyline
    const skyline = new THREE.Group();
    const buildingMat = new THREE.MeshStandardMaterial({ color: '#0b0618', emissive: '#ffffff', emissiveMap: windowTex, emissiveIntensity: 1.1, roughness: 0.9 });
    for (let i = 0; i < 90; i++) {
        const a = (i / 90) * Math.PI * 2 + rand(-0.02, 0.02);
        const r = rand(170, 240);
        const h = rand(30, 110), w = rand(10, 22);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), buildingMat);
        b.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
        b.lookAt(0, h / 2, 0);
        skyline.add(b);
    }
    scene.add(skyline);

    // Floating ice shards
    const shards = [];
    const shardGroup = new THREE.Group();
    const shardMat = new THREE.MeshStandardMaterial({ color: '#d8fbff', emissive: '#4fd8ff', emissiveIntensity: 0.45, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.1, flatShading: true });
    for (let i = 0; i < 46; i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(rand(1.2, 4.2), 0), shardMat);
        m.scale.y = rand(1.6, 2.8);
        const a = rand(0, Math.PI * 2), r = rand(45, 150);
        m.position.set(Math.cos(a) * r, rand(14, 70), Math.sin(a) * r);
        shards.push({ mesh: m, spin: rand(-0.4, 0.4), bob: rand(0, Math.PI * 2), y: m.position.y });
        shardGroup.add(m);
    }
    scene.add(shardGroup);

    // Field sparkles rising from the battle field
    const SPARKS = 140;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkVel = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i++) {
        sparkPos[i * 3] = rand(-FIELD.w / 2, FIELD.w / 2);
        sparkPos[i * 3 + 1] = rand(0, 30);
        sparkPos[i * 3 + 2] = rand(-FIELD.d / 2, FIELD.d / 2);
        sparkVel[i] = rand(1.5, 4);
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({ size: 0.7, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff', opacity: 0.8 });
    scene.add(new THREE.Points(sparkGeo, sparkMat));

    // --- Flying creatures (original designs) ---------------------------------------

    function makeWingGeometry() {
        const g = new THREE.BufferGeometry();
        // Swept wing: root at the body, long tip trailing backwards
        const v = [
            0, 0, 0.7,   3.6, 0.3, -0.4,   0, 0, -0.6,
            3.6, 0.3, -0.4,   4.4, 0.4, -1.6,   0, 0, -0.6
        ];
        g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        g.computeVertexNormals();
        return g;
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

        // Glowing light trail
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
            dir: i % 2 ? 1 : -1, phase: (i / CREATURE_COLORS.length) * Math.PI * 2, flap: 7 + i * 0.6
        };
    });

    function creaturePos(c, t, out) {
        const a = c.phase + c.dir * c.speed * t;
        return out.set(
            Math.cos(a) * c.radius * BOWL.stretch + Math.sin(t * 0.7 + c.phase) * 4,
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

    // --- Entrance burst ---------------------------------------------------------------

    const burstMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const burstRings = [0, 1].map(() => {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), burstMat.clone());
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
            const s = 1 + ease * (i ? 45 : 70);
            r.scale.set(s, s, s);
            r.material.opacity = (1 - p) * (i ? 0.7 : 1);
        });
        burstLight.intensity = (1 - p) * 4000;
    }

    // --- Camera direction ---------------------------------------------------------------

    const SHOT_LENGTH = 11;
    const BLEND = 3;
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const shots = [
        // Wide orbit over the stadium
        u => ({ pos: v(Math.cos(0.5 + u * 0.035) * 68, 42, Math.sin(0.5 + u * 0.035) * 52), look: v(0, 2, 0) }),
        // Low, behind a trainer box
        u => ({ pos: v(-36 + u * 0.35, 5.5, 7 - u * 0.4), look: v(12, 5, 0) }),
        // Following a flyer
        u => {
            const c = creatures[1];
            const t = clock + 0;
            const p = creaturePos(c, t - 3.4, new THREE.Vector3());
            const ahead = creaturePos(c, t + 0.6, new THREE.Vector3());
            return { pos: p.add(v(0, 7, 0)), look: ahead };
        },
        // High overhead, slowly turning
        u => ({ pos: v(Math.sin(u * 0.05) * 25, 85, 45), look: v(0, 0, 0) }),
        // Side sweep along the stands
        u => ({ pos: v(-38 + u * 6, 9, 29), look: v(-10 + u * 2, 4, 0) })
    ];
    const introShot = () => ({ pos: v(0, 160, 300), look: v(0, 0, 0) });

    let clock = 0;
    let shotIndex = 0;
    let shotStart = 0;
    let introDone = false;
    const curPos = v(0, 0, 0), curLook = v(0, 0, 0);
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
            const u = clock - shotStart;
            if (u > SHOT_LENGTH) {
                shotIndex = (shotIndex + 1) % shots.length;
                shotStart = clock;
            }
            const now = shots[shotIndex](clock - shotStart);
            const prevIndex = (shotIndex + shots.length - 1) % shots.length;
            const since = clock - shotStart;
            if (since < BLEND && (shotIndex !== 0 || clock > 4.5 + SHOT_LENGTH)) {
                const prev = shots[prevIndex](SHOT_LENGTH + since);
                const e = easeInOut(since / BLEND);
                target = { pos: prev.pos.lerp(now.pos, e), look: prev.look.lerp(now.look, e) };
            } else {
                target = now;
            }
        }

        // Scrolling the page gently lifts the camera
        const lift = Math.min(window.scrollY * 0.012, 30);
        curPos.copy(target.pos).add(v(0, lift, 0));
        curLook.copy(target.look).add(v(0, lift * 0.4, 0));
        camera.position.copy(curPos);
        camera.lookAt(curLook);
    }

    // --- Per-frame updates ----------------------------------------------------------

    function updateCrowd(t) {
        // A cheering wave travels around the stands
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
            const a = Math.max(0, flashLife[i]) * 5;
            fc[i * 3] = fc[i * 3 + 1] = fc[i * 3 + 2] = Math.min(a, 1);
        }
        flashGeo.attributes.position.needsUpdate = true;
        flashGeo.attributes.color.needsUpdate = true;
    }

    function updateProps(t, dt) {
        clouds.forEach(c => {
            c.a += c.speed * dt;
            c.sprite.position.x = Math.cos(c.a) * c.r;
            c.sprite.position.z = Math.sin(c.a) * c.r;
        });
        shards.forEach(s => {
            s.mesh.rotation.y += s.spin * dt;
            s.mesh.position.y = s.y + Math.sin(t * 0.6 + s.bob) * 2;
        });
        for (let i = 0; i < SPARKS; i++) {
            sparkPos[i * 3 + 1] += sparkVel[i] * dt;
            if (sparkPos[i * 3 + 1] > 32) sparkPos[i * 3 + 1] = 0;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        starMat.opacity = currentScene.stars * (0.85 + Math.sin(t * 2) * 0.15);
        centerLight.intensity = currentScene.centerLight * 40 * (0.85 + Math.sin(t * 1.6) * 0.15);
    }

    // --- Theme ------------------------------------------------------------------------

    let currentScene = SCENES.arena;

    function setTheme(key) {
        const s = SCENES[key] || SCENES.arena;
        currentScene = s;

        skyUniforms.top.value.set(s.skyTop);
        skyUniforms.horizon.value.set(s.skyHorizon);
        skyUniforms.bottom.value.set(s.skyBottom);
        skyUniforms.sunDir.value.set(...s.sunDir).normalize();
        skyUniforms.sunColor.value.set(s.sunColor);
        skyUniforms.sunSize.value = s.sunSize;

        scene.fog.color.set(s.fog);
        scene.fog.density = s.fogDensity;
        renderer.toneMappingExposure = s.exposure;

        hemi.color.set(s.skyHorizon);
        hemi.groundColor.set(s.field);
        hemi.intensity = s.hemi;
        sun.color.set(s.sunColor);
        sun.intensity = s.sun;
        sun.position.set(...s.sunDir).multiplyScalar(100);
        centerLight.color.set(s.fieldGlow);
        burstLight.color.set(s.fieldGlow);

        fieldTex.userData.redraw(s);
        screenTex.userData.redraw({ ...s, trim: s.trim });
        fieldMat.emissiveIntensity = s.fieldEmissive;
        bowlMat.color.set(s.bowl);
        seatMats[0].color.set(s.trim).lerp(color(s.bowl), 0.2);
        seatMats[1].color.set(s.trim).lerp(color(s.bowl), 0.5);
        apronMat.color.set(s.bowl).multiplyScalar(0.35);
        trimMat.color.set(s.trim);
        trimMat.emissive.set(s.trim);
        trimMat.emissiveIntensity = s.trimGlow;
        lampMat.color.set(s.beam);

        beamUniforms.color.value.set(s.beam);
        beamUniforms.opacity.value = s.beamOpacity;
        sparkMat.color.set(s.fieldGlow);
        burstRings.forEach(r => r.material.color.set(s.fieldGlow));

        cloudGroup.visible = !!s.clouds;
        if (s.clouds) cloudGroup.children.forEach(c => c.material.color.set(s.clouds));
        skyline.visible = s.skyline;
        shardGroup.visible = s.shards;
        stars.visible = s.stars > 0;

        if (still && visible) renderOnce();
    }

    // --- Loop + sizing ------------------------------------------------------------------

    let rafId = null;
    let last = 0;
    let still = false;
    let visible = true;

    function resize() {
        const w = window.innerWidth, h = window.innerHeight;
        const dprCap = w < 768 ? 1 : 1.5;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
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
        aimBeams(clock);
        updateCreatures(clock, dt);
        updateCrowd(clock);
        updateProps(clock, dt);
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
                aimBeams(2);
                updateCreatures(6, 0);
                updateCrowd(0);
                updateProps(0, 0);
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
