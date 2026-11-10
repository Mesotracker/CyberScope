import * as THREE from 'three';
import { CONFIG, QUALITY } from './config.js';

// ---------------------------------------------------------------------------
// Procedural texture library. Everything is generated on canvases at boot so
// the game stays a self-contained static site with no image downloads.
// ---------------------------------------------------------------------------

const textureCache = new Map();
const materialCache = new Map();

function createCanvas(width, height = width) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function toTexture(canvas, { srgb = true, repeat = true, nearest = false } = {}) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = QUALITY.anisotropy;
    if (nearest) {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapLinearFilter;
    }
    texture.needsUpdate = true;
    return texture;
}

function hexToCss(hex) {
    return `#${hex.toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Concrete / asphalt / facade surfaces
// ---------------------------------------------------------------------------

function paintConcrete(ctx, size, { base, seed, cracks = 22, seams = true, stains = true }) {
    const random = seededRandom(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // Large soft mottling keeps the surface from looking flat.
    for (let i = 0; i < 170; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = 12 + random() * size * 0.22;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        const dark = random() > 0.45;
        gradient.addColorStop(0, dark ? 'rgba(0, 0, 0, 0.20)' : 'rgba(255, 255, 255, 0.045)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Fine aggregate speckle.
    for (let i = 0; i < 9000; i++) {
        const x = random() * size;
        const y = random() * size;
        const shade = random();
        if (shade > 0.72) ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + random() * 0.05})`;
        else ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + random() * 0.09})`;
        const s = random() > 0.9 ? 2 : 1;
        ctx.fillRect(x, y, s, s);
    }

    if (stains) {
        for (let i = 0; i < 18; i++) {
            const x = random() * size;
            const y = random() * size;
            const w = 8 + random() * 60;
            const h = 30 + random() * size * 0.5;
            const gradient = ctx.createLinearGradient(x, y, x, y + h);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.24)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, w, h);
        }
    }

    // Hairline cracks.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.lineWidth = Math.max(1, size / 512);
    for (let i = 0; i < cracks; i++) {
        let x = random() * size;
        let y = random() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const steps = 3 + Math.floor(random() * 6);
        for (let s = 0; s < steps; s++) {
            x += (random() - 0.5) * size * 0.12;
            y += random() * size * 0.08;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Expansion joints / panel seams.
    if (seams) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
        ctx.lineWidth = Math.max(2, size / 256);
        const step = size / 4;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * step, 0);
            ctx.lineTo(i * step, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * step);
            ctx.lineTo(size, i * step);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * step + 2, 0);
            ctx.lineTo(i * step + 2, size);
            ctx.stroke();
        }
    }
}

function paintConcreteBump(ctx, size, seed) {
    const random = seededRandom(seed + 77);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14000; i++) {
        const x = random() * size;
        const y = random() * size;
        const v = Math.floor(90 + random() * 80);
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
        ctx.fillRect(x, y, random() > 0.85 ? 2 : 1, random() > 0.85 ? 2 : 1);
    }
    for (let i = 0; i < 90; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = 4 + random() * 26;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${random() > 0.5 ? 40 : 200}, ${random() > 0.5 ? 40 : 200}, 128, 0.10)`);
        gradient.addColorStop(1, 'rgba(128, 128, 128, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

let concreteSet = null;
function getConcreteSet() {
    if (concreteSet) return concreteSet;

    const size = 512;
    const colorCanvas = createCanvas(size);
    const bumpCanvas = createCanvas(size);
    paintConcrete(colorCanvas.getContext('2d'), size, {
        base: '#2b3038',
        seed: 1138,
        cracks: 30
    });
    paintConcreteBump(bumpCanvas.getContext('2d'), size, 1138);

    const map = toTexture(colorCanvas);
    map.repeat.set(2, 2);
    const bumpMap = toTexture(bumpCanvas, { srgb: false });
    bumpMap.repeat.set(2, 2);

    concreteSet = { map, bumpMap };
    return concreteSet;
}

export function getConcreteMaterial() {
    if (materialCache.has('concrete')) return materialCache.get('concrete');
    const { map, bumpMap } = getConcreteSet();
    const material = new THREE.MeshStandardMaterial({
        map,
        bumpMap,
        bumpScale: 0.35,
        color: 0xb8c2cc,
        roughness: 0.92,
        metalness: 0.04,
        envMapIntensity: 0.35
    });
    materialCache.set('concrete', material);
    return material;
}

// Facade variants: concrete + window grid + emissive lit windows.
function makeFacadeSet(seed, base, accent) {
    const size = 512;
    const colorCanvas = createCanvas(size);
    const emissiveCanvas = createCanvas(size);
    const bumpCanvas = createCanvas(size);
    const ctx = colorCanvas.getContext('2d');
    const em = emissiveCanvas.getContext('2d');
    const random = seededRandom(seed);

    paintConcrete(ctx, size, { base, seed, cracks: 10, seams: false });
    paintConcreteBump(bumpCanvas.getContext('2d'), size, seed + 11);

    em.fillStyle = '#000';
    em.fillRect(0, 0, size, size);

    // Window grid.
    const cols = 6;
    const rows = 8;
    const cellW = size / cols;
    const cellH = size / rows;
    const winW = cellW * 0.62;
    const winH = cellH * 0.52;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = col * cellW + (cellW - winW) / 2;
            const y = row * cellH + (cellH - winH) / 2;

            // Recessed dark glass.
            const glassGradient = ctx.createLinearGradient(x, y, x, y + winH);
            glassGradient.addColorStop(0, '#0a1018');
            glassGradient.addColorStop(0.5, '#101c26');
            glassGradient.addColorStop(1, '#060a10');
            ctx.fillStyle = glassGradient;
            ctx.fillRect(x, y, winW, winH);

            // Frame.
            ctx.strokeStyle = 'rgba(10, 12, 16, 0.9)';
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, winW, winH);
            ctx.strokeStyle = 'rgba(150, 180, 200, 0.10)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 2, y + 2, winW - 4, winH - 4);

            // Window reflection streak.
            ctx.fillStyle = 'rgba(120, 200, 255, 0.05)';
            ctx.beginPath();
            ctx.moveTo(x + winW * 0.1, y + winH);
            ctx.lineTo(x + winW * 0.55, y);
            ctx.lineTo(x + winW * 0.72, y);
            ctx.lineTo(x + winW * 0.27, y + winH);
            ctx.closePath();
            ctx.fill();

            const lit = random() < 0.33;
            if (lit) {
                const warm = random() < 0.45;
                const color = warm ? '#ffb96b' : hexToCss(accent);
                const alpha = 0.25 + random() * 0.65;
                em.globalAlpha = alpha;
                em.fillStyle = color;
                em.fillRect(x + 3, y + 3, winW - 6, winH - 6);
                em.globalAlpha = alpha * 0.5;
                em.fillStyle = '#ffffff';
                em.fillRect(x + winW * 0.32, y + 3, winW * 0.18, winH - 6);
                em.globalAlpha = 1;
            }
        }
    }

    // Vertical neon edge strip baked into the facade.
    const stripX = random() > 0.5 ? size * 0.035 : size * 0.945;
    ctx.fillStyle = 'rgba(8, 10, 14, 0.9)';
    ctx.fillRect(stripX - 7, 0, 14, size);
    ctx.fillStyle = hexToCss(accent);
    ctx.fillRect(stripX - 2, 0, 4, size);

    em.fillStyle = hexToCss(accent);
    em.globalAlpha = 0.9;
    em.fillRect(stripX - 3, 0, 6, size);
    em.globalAlpha = 1;

    const map = toTexture(colorCanvas);
    const emissiveMap = toTexture(emissiveCanvas);
    const bumpMap = toTexture(bumpCanvas, { srgb: false });

    const material = new THREE.MeshStandardMaterial({
        map,
        emissiveMap,
        emissive: 0xffffff,
        emissiveIntensity: 1.35,
        bumpMap,
        bumpScale: 0.55,
        roughness: 0.86,
        metalness: 0.16,
        envMapIntensity: 0.5
    });

    return material;
}

export function getFacadeMaterials() {
    if (materialCache.has('facades')) return materialCache.get('facades');
    const variants = [
        { base: '#333a45', accent: CONFIG.neon.cyan },
        { base: '#3d3444', accent: CONFIG.neon.magenta },
        { base: '#2c3e3b', accent: CONFIG.neon.green },
        { base: '#41372a', accent: CONFIG.neon.amber },
        { base: '#313956', accent: CONFIG.neon.violet },
        { base: '#353a41', accent: CONFIG.neon.blue }
    ];
    const materials = variants.map((v, i) => makeFacadeSet(900 + i * 37, v.base, v.accent));
    materialCache.set('facades', materials);
    return materials;
}

// ---------------------------------------------------------------------------
// Wet street / puddles / reflection environment
// ---------------------------------------------------------------------------

export function getGroundConcreteTexture() {
    if (textureCache.has('groundConcrete')) return textureCache.get('groundConcrete');
    const size = 512;
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    paintConcrete(ctx, size, { base: '#14181f', seed: 4242, cracks: 34, stains: true });

    // Faint road paint and hazard chevrons.
    const random = seededRandom(19);
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 10; i++) {
        ctx.fillStyle = random() > 0.55 ? '#ffb03a' : '#9fb4c8';
        ctx.save();
        ctx.translate(random() * size, random() * size);
        ctx.rotate(random() * Math.PI);
        ctx.fillRect(-30, -2, 60, 4);
        ctx.restore();
    }
    ctx.globalAlpha = 1;

    const texture = toTexture(canvas);
    texture.repeat.set(4, 4);
    textureCache.set('groundConcrete', texture);
    return texture;
}

export function getPuddleTexture() {
    if (textureCache.has('puddle')) return textureCache.get('puddle');
    const size = 512;
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const random = seededRandom(777);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 46; i++) {
        const x = random() * size;
        const y = random() * size;
        const r = 18 + random() * 95;
        const gradient = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(0.55, 'rgba(210, 210, 210, 0.55)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Fine wet speckle so puddle edges break up.
    for (let i = 0; i < 2500; i++) {
        const v = Math.floor(random() * 255);
        ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${random() * 0.25})`;
        ctx.fillRect(random() * size, random() * size, 2, 2);
    }

    const texture = toTexture(canvas, { srgb: false });
    texture.repeat.set(1, 1);
    textureCache.set('puddle', texture);
    return texture;
}

export function getEnvMap(renderer) {
    if (textureCache.has('envMap')) return textureCache.get('envMap');

    const canvas = createCanvas(1024, 512);
    const ctx = canvas.getContext('2d');

    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#05060d');
    sky.addColorStop(0.45, '#121a2e');
    sky.addColorStop(0.62, '#2a1c3f');
    sky.addColorStop(0.72, '#5b2340');
    sky.addColorStop(1, '#07080e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);

    // Neon horizon haze.
    const haze = ctx.createLinearGradient(0, 300, 0, 380);
    haze.addColorStop(0, 'rgba(255, 43, 214, 0)');
    haze.addColorStop(0.5, 'rgba(255, 43, 214, 0.30)');
    haze.addColorStop(1, 'rgba(39, 231, 255, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 300, 1024, 80);

    // City silhouette.
    ctx.fillStyle = '#070a12';
    let x = 0;
    while (x < 1024) {
        const w = 22 + Math.random() * 60;
        const h = 40 + Math.random() * 190;
        ctx.fillRect(x, 512 - h, w, h);
        if (Math.random() > 0.7) {
            ctx.fillStyle = Math.random() > 0.5 ? '#27e7ff' : '#ff2bd6';
            ctx.fillRect(x + w * 0.3, 512 - h + 12, 3, h * 0.4);
            ctx.fillStyle = '#070a12';
        }
        x += w + 4;
    }

    // Vertical light columns.
    for (let i = 0; i < 14; i++) {
        const gx = Math.random() * 1024;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(39, 231, 255, 0.20)' : 'rgba(255, 43, 214, 0.18)';
        ctx.fillRect(gx, 0, 2 + Math.random() * 4, 380);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
    pmrem.dispose();

    textureCache.set('envMap', envMap);
    return envMap;
}

// ---------------------------------------------------------------------------
// Matrix glyph atlas (8 x 8) used by the code-rain points shader
// ---------------------------------------------------------------------------

export function getGlyphTexture() {
    if (textureCache.has('glyphs')) return textureCache.get('glyphs');
    const size = 512;
    const cell = size / 8;
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const glyphs = (
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' +
        '<>?/\\|{}[]#*+=!$%&@^~;:,._-()'
    ).slice(0, 64);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 64; i++) {
        const col = i % 8;
        const row = Math.floor(i / 8);
        const cx = col * cell + cell / 2;
        const cy = row * cell + cell / 2;
        ctx.font = `700 ${Math.floor(cell * 0.68)}px "Courier New", monospace`;
        ctx.fillText(glyphs[i] || '0', cx, cy);
    }

    const texture = toTexture(canvas, { repeat: false, nearest: true });
    textureCache.set('glyphs', texture);
    return texture;
}

// ---------------------------------------------------------------------------
// Neon signage / holograms
// ---------------------------------------------------------------------------

export function getSignTexture(text, colorHex) {
    const key = `sign:${text}:${colorHex}`;
    if (textureCache.has(key)) return textureCache.get(key);

    const canvas = createCanvas(512, 128);
    const ctx = canvas.getContext('2d');
    const css = hexToCss(colorHex);

    ctx.clearRect(0, 0, 512, 128);

    // Frame.
    ctx.strokeStyle = css;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 58px "Arial Black", Impact, sans-serif';

    ctx.shadowColor = css;
    ctx.shadowBlur = 26;
    ctx.fillStyle = css;
    ctx.fillText(text, 256, 66);

    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '300 56px "Arial Black", Impact, sans-serif';
    ctx.fillText(text, 256, 66);

    const texture = toTexture(canvas, { repeat: false });
    textureCache.set(key, texture);
    return texture;
}

const SIGN_POOL = [
    { text: 'NEXUS', color: CONFIG.neon.cyan },
    { text: 'ZAIBATSU', color: CONFIG.neon.magenta },
    { text: 'SYNTH//BAR', color: CONFIG.neon.amber },
    { text: '24H', color: CONFIG.neon.green },
    { text: 'NO FUTURE', color: CONFIG.neon.red },
    { text: 'MIRAGE', color: CONFIG.neon.violet },
    { text: 'CYBER CLINIC', color: CONFIG.neon.cyan },
    { text: 'HOTEL', color: CONFIG.neon.magenta },
    { text: 'DATA // 01', color: CONFIG.neon.green },
    { text: 'RAMEN', color: 0xff7a2b },
    { text: 'GRID', color: CONFIG.neon.violet },
    { text: 'DETENTION', color: CONFIG.neon.red }
];

export function getSignPool() {
    return SIGN_POOL.map(entry => ({
        ...entry,
        texture: getSignTexture(entry.text, entry.color)
    }));
}

export function getAdTextures() {
    if (textureCache.has('ads')) return textureCache.get('ads');

    const designs = [
        { title: 'NEXUS', sub: 'CONSCIOUSNESS AS A SERVICE', color: CONFIG.neon.cyan },
        { title: 'ZAIBATSU', sub: 'OWN THE NIGHT', color: CONFIG.neon.magenta },
        { title: 'SYNTH', sub: 'FEEL SOMETHING', color: CONFIG.neon.amber },
        { title: 'MIRAGE', sub: 'REALITY IS OPTIONAL', color: CONFIG.neon.violet }
    ];

    const textures = designs.map((design, index) => {
        const size = 512;
        const canvas = createCanvas(size);
        const ctx = canvas.getContext('2d');
        const css = hexToCss(design.color);

        const bg = ctx.createLinearGradient(0, 0, size, size);
        bg.addColorStop(0, '#080b14');
        bg.addColorStop(0.6, '#111527');
        bg.addColorStop(1, '#05060a');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);

        // Abstract geometry.
        ctx.strokeStyle = css;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
            const r = 60 + i * 26;
            ctx.beginPath();
            ctx.arc(size * 0.5, size * 0.44, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.18;
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = css;
            ctx.fillRect(0, i * 13, size, 1);
        }
        ctx.globalAlpha = 1;

        // Big brand text.
        ctx.shadowColor = css;
        ctx.shadowBlur = 30;
        ctx.fillStyle = css;
        ctx.textAlign = 'center';
        ctx.font = '700 74px "Arial Black", Impact, sans-serif';
        ctx.fillText(design.title, size / 2, size * 0.47);

        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.font = '700 16px "Courier New", monospace';
        ctx.fillText(design.sub, size / 2, size * 0.56);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.strokeRect(18, 18, size - 36, size - 36);

        // Fake UI footer.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.textAlign = 'left';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText(`SIG-0${index + 1} // 2087`, 30, size - 32);

        return toTexture(canvas, { repeat: false });
    });

    textureCache.set('ads', textures);
    return textures;
}

export function getPlazaDecalTexture() {
    if (textureCache.has('plazaDecal')) return textureCache.get('plazaDecal');

    const size = 1024;
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);

    const cyan = hexToCss(CONFIG.neon.cyan);
    const magenta = hexToCss(CONFIG.neon.magenta);

    ctx.strokeStyle = cyan;
    for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = 0.5 - i * 0.08;
        ctx.lineWidth = i === 1 ? 6 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.11 * i, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.globalAlpha = 0.32;
    ctx.setLineDash([26, 18]);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = cyan;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * size * 0.4, Math.sin(angle) * size * 0.4);
        ctx.lineTo(Math.cos(angle) * size * 0.46, Math.sin(angle) * size * 0.46);
        ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = magenta;
    ctx.font = '700 42px "Arial Black", sans-serif';
    ctx.fillText('SECTOR 07', 0, 8);
    ctx.fillStyle = cyan;
    ctx.font = '700 17px "Courier New", monospace';
    ctx.fillText('NEON GRID // NEXUS', 0, 44);

    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = magenta;
    ctx.lineWidth = 2;
    ctx.strokeRect(-size * 0.3, -size * 0.3, size * 0.6, size * 0.6);

    const texture = toTexture(canvas, { repeat: false });
    textureCache.set('plazaDecal', texture);
    return texture;
}

export function getScorchTexture() {
    if (textureCache.has('scorch')) return textureCache.get('scorch');
    const size = 256;
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.94)');
    gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.66)');
    gradient.addColorStop(0.78, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Soot blotches so the mark reads as burnt ground, not a clean circle.
    for (let i = 0; i < 120; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), 0.6) * size * 0.46;
        ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + Math.random() * 0.38})`;
        ctx.beginPath();
        ctx.arc(
            size / 2 + Math.cos(angle) * radius,
            size / 2 + Math.sin(angle) * radius,
            1 + Math.random() * 7,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    const texture = toTexture(canvas, { repeat: false });
    textureCache.set('scorch', texture);
    return texture;
}

export function getGlowTexture() {
    if (textureCache.has('glow')) return textureCache.get('glow');
    const size = 128;
    const canvas = createCanvas(size);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = toTexture(canvas, { repeat: false });
    textureCache.set('glow', texture);
    return texture;
}

// ---------------------------------------------------------------------------
// Cached PBR material helpers used by entities
// ---------------------------------------------------------------------------

export function pbr(color, options = {}) {
    const {
        roughness = 0.55,
        metalness = 0.3,
        envMapIntensity = 0.9,
        flatShading = false
    } = options;
    const key = `pbr:${color}:${roughness}:${metalness}:${envMapIntensity}:${flatShading}`;
    if (materialCache.has(key)) return materialCache.get(key);

    const material = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        envMapIntensity,
        flatShading
    });
    materialCache.set(key, material);
    return material;
}

export function glowMaterial(color, intensity = 2.4, options = {}) {
    const { roughness = 0.35, metalness = 0.1 } = options;
    const key = `glow:${color}:${intensity}:${roughness}:${metalness}`;
    if (materialCache.has(key)) return materialCache.get(key);

    const material = new THREE.MeshStandardMaterial({
        color: 0x050505,
        emissive: color,
        emissiveIntensity: intensity,
        roughness,
        metalness,
        envMapIntensity: 0.2
    });
    materialCache.set(key, material);
    return material;
}

export function carPaint(color) {
    const key = `paint:${color}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const material = new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0.82,
        roughness: 0.26,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.25
    });
    materialCache.set(key, material);
    return material;
}

export function getGlassMaterial() {
    if (materialCache.has('glass')) return materialCache.get('glass');
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x0a1620,
        metalness: 0.9,
        roughness: 0.06,
        transparent: true,
        opacity: 0.52,
        envMapIntensity: 1.6,
        side: THREE.DoubleSide
    });
    materialCache.set('glass', material);
    return material;
}

export function getRubberMaterial() {
    if (materialCache.has('rubber')) return materialCache.get('rubber');
    const material = new THREE.MeshStandardMaterial({
        color: 0x08090c,
        roughness: 0.95,
        metalness: 0.05
    });
    materialCache.set('rubber', material);
    return material;
}

export function getChromeMaterial() {
    if (materialCache.has('chrome')) return materialCache.get('chrome');
    const material = new THREE.MeshStandardMaterial({
        color: 0xa8bccd,
        roughness: 0.16,
        metalness: 0.98,
        envMapIntensity: 1.4
    });
    materialCache.set('chrome', material);
    return material;
}

export function getDarkMetalMaterial() {
    if (materialCache.has('darkMetal')) return materialCache.get('darkMetal');
    const material = new THREE.MeshStandardMaterial({
        color: 0x23272e,
        roughness: 0.42,
        metalness: 0.9,
        envMapIntensity: 1.0
    });
    materialCache.set('darkMetal', material);
    return material;
}

export function createEmissiveTextMaterial(texture, opacity = 1) {
    return new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
}
