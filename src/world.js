import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, JAIL_POS, QUALITY } from './config.js';
import { game, addCollider } from './state.js';
import {
    getFacadeMaterials,
    getConcreteMaterial,
    getGroundConcreteTexture,
    getPuddleTexture,
    getEnvMap,
    getGlyphTexture,
    getSignPool,
    getAdTextures,
    getGlowTexture,
    getPlazaDecalTexture,
    glowMaterial,
    getDarkMetalMaterial
} from './textures.js';

let skyUniforms = null;
let rainUniforms = null;
let ground = null;
let sun = null;
let holoMaterials = [];
let signMaterials = [];
const drones = [];
const tmpCameraPos = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Sky dome with chromatic glitch slices
// ---------------------------------------------------------------------------

const SKY_VERTEX = /* glsl */`
    varying vec3 vDir;
    void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const SKY_FRAGMENT = /* glsl */`
    uniform float uTime;
    uniform vec3 uTop;
    uniform vec3 uBottom;
    uniform vec3 uGlow;
    varying vec3 vDir;

    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    void main() {
        vec3 dir = normalize(vDir);
        float up = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(up, 0.72));
        col += uGlow * pow(1.0 - abs(dir.y), 7.0) * 0.55;

        // Slow smog bands rolling through the upper sky.
        float band = sin(dir.y * 34.0 + uTime * 0.12) * 0.5 + 0.5;
        col += uGlow * 0.045 * band * smoothstep(0.0, 0.55, up);

        // Glitch slices: a few scan rows tear every so often.
        float rows = 120.0;
        float row = floor((dir.y + 1.0) * rows);
        float slice = step(0.972, hash21(vec2(row, floor(uTime * 6.0))));
        float rowMask = smoothstep(0.45, 0.0, abs(fract((dir.y + 1.0) * rows) - 0.5));
        col += vec3(0.15, 0.95, 0.85) * slice * rowMask * 0.3;

        // Faint horizontal CRT scan.
        col *= 0.94 + 0.06 * sin((dir.y + uTime * 0.04) * 800.0);

        gl_FragColor = vec4(col, 1.0);
    }
`;

function createSky() {
    skyUniforms = {
        uTime: { value: 0 },
        uTop: { value: new THREE.Color(0x04050c) },
        uBottom: { value: new THREE.Color(0x1b1430) },
        uGlow: { value: new THREE.Color(0x3a2b6e) }
    };

    const material = new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false
    });

    const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 32, 18), material);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    game.scene.add(sky);

    // Cold moon behind the skyline, with a soft atmospheric halo.
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(80, 24, 18),
        new THREE.MeshBasicMaterial({ color: 0xb9dcff, fog: false })
    );
    moon.position.set(-1150, 820, -2100);
    game.scene.add(moon);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0x7fd4ff,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
    }));
    halo.scale.set(760, 760, 1);
    halo.position.copy(moon.position);
    game.scene.add(halo);
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

function createLights() {
    const hemi = new THREE.HemisphereLight(0x4a6396, 0x070a12, 0.82);
    game.scene.add(hemi);

    game.scene.add(new THREE.AmbientLight(0x27344f, 0.26));

    sun = new THREE.DirectionalLight(0xa9c8ff, 2.7);
    sun.position.set(180, 260, 140);
    sun.castShadow = QUALITY.shadows;
    sun.shadow.mapSize.set(CONFIG.shadowMapSize, CONFIG.shadowMapSize);
    const extent = 170;
    sun.shadow.camera.left = -extent;
    sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent;
    sun.shadow.camera.bottom = -extent;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 900;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.06;
    game.scene.add(sun);
    game.scene.add(sun.target);

    const fill = new THREE.DirectionalLight(0xff4fd8, 0.35);
    fill.position.set(-220, 90, -160);
    game.scene.add(fill);

    // A handful of neon spill lights around the spawn plaza.
    const lightSpots = [
        [-60, 14, -60, CONFIG.neon.cyan],
        [60, 14, 60, CONFIG.neon.magenta],
        [-60, 14, 60, CONFIG.neon.amber],
        [60, 14, -60, CONFIG.neon.violet]
    ];
    for (const [x, y, z, color] of lightSpots) {
        const light = new THREE.PointLight(color, 300, 220, 2);
        light.position.set(x, y, z);
        game.scene.add(light);
    }

    // Cinematic plaza key lights: they reveal the concrete, the decal and the
    // staged vehicles / pedestrians without flattening the rest of the city.
    const plazaKey = new THREE.PointLight(CONFIG.neon.cyan, 500, 190, 2);
    plazaKey.position.set(0, 26, -6);
    game.scene.add(plazaKey);

    const plazaRim = new THREE.PointLight(CONFIG.neon.magenta, 260, 130, 2);
    plazaRim.position.set(-32, 12, 34);
    game.scene.add(plazaRim);
}

// ---------------------------------------------------------------------------
// Reflective wet ground
// ---------------------------------------------------------------------------

const GROUND_VERTEX = /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vCoord;
    varying vec3 vWorld;
    void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vCoord = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const GROUND_FRAGMENT = /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform sampler2D tConcrete;
    uniform sampler2D tPuddle;
    uniform float uTime;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform float uBlockSize;
    varying vec4 vCoord;
    varying vec3 vWorld;

    void main() {
        vec2 wxz = vWorld.xz;
        vec3 concrete = texture2D(tConcrete, wxz * 0.042).rgb * 1.25 + vec3(0.008, 0.012, 0.018);

        float puddle = texture2D(tPuddle, wxz * 0.0032).r;
        puddle = smoothstep(0.22, 0.68, puddle);

        float dist = length(vWorld - cameraPosition);

        vec4 proj = vCoord;
        float ripple = sin(wxz.x * 1.6 + uTime * 1.3) * sin(wxz.y * 1.2 - uTime * 1.05);
        proj.xy += vec2(ripple * 0.0022, ripple * 0.0014) * (0.35 + puddle);

        vec3 reflection = texture2DProj(tDiffuse, proj).rgb;

        // Glowing grid lines at every city block boundary.
        vec2 centered = abs(fract(wxz / uBlockSize + 0.5) - 0.5) * uBlockSize;
        float lines = smoothstep(0.85, 0.0, min(centered.x, centered.y));
        float lane = smoothstep(0.32, 0.0, abs(centered.x - 20.0)) + smoothstep(0.32, 0.0, abs(centered.y - 20.0));

        vec3 wet = mix(concrete * 0.5, reflection, 0.56 + 0.44 * puddle);

        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
        wet += reflection * fresnel * 0.3;

        vec3 col = mix(concrete, wet, 0.84);
        col += vec3(0.02, 0.035, 0.05);
        col += vec3(0.05, 0.85, 0.95) * lines * 0.55;
        col += vec3(0.95, 0.32, 0.95) * lane * 0.3;

        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(col, 1.0);
    }
`;

const WetGroundShader = {
    uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        tConcrete: { value: null },
        tPuddle: { value: null },
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(CONFIG.fogColor) },
        uFogDensity: { value: CONFIG.fogDensity },
        uBlockSize: { value: CONFIG.blockSize }
    },
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT
};

function createGround() {
    ground = new Reflector(new THREE.PlaneGeometry(3400, 3400), {
        clipBias: 0.003,
        textureWidth: CONFIG.reflectionSize,
        textureHeight: CONFIG.reflectionSize,
        color: 0xffffff,
        shader: WetGroundShader,
        multisample: 0
    });

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.material.uniforms.tConcrete.value = getGroundConcreteTexture();
    ground.material.uniforms.tPuddle.value = getPuddleTexture();
    ground.material.uniforms.uFogColor.value = new THREE.Color(CONFIG.fogColor);
    ground.material.uniforms.uFogDensity.value = CONFIG.fogDensity;
    ground.material.uniforms.uBlockSize.value = CONFIG.blockSize;

    // The planar reflection re-renders the whole scene. On mobile half the
    // frame rate is invisible under the ripples, and it saves a full geometry
    // submission every other frame on low-end GPUs.
    if (QUALITY.isMobile) {
        const renderReflection = ground.onBeforeRender;
        let frame = 0;
        ground.onBeforeRender = function (...args) {
            frame++;
            if (frame % 2 === 0) return;
            renderReflection.apply(this, args);
        };
    }

    game.scene.add(ground);
    game.ground = ground;
}

// ---------------------------------------------------------------------------
// City generation
// ---------------------------------------------------------------------------

const concreteMaterial = getConcreteMaterial();

function scaleUV(geometry, su, sv) {
    const uv = geometry.attributes.uv;
    if (!uv) return geometry;
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
    uv.needsUpdate = true;
    return geometry;
}

function getSignMaterial(texture) {
    let material = signMaterials.find(entry => entry.texture === texture);
    if (material) return material.material;

    const newMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
    signMaterials.push({ texture, material: newMaterial, phase: Math.random() * Math.PI * 2 });
    return newMaterial;
}

function createSidewalks(blockCenters) {
    const geometries = [];
    for (const [cx, cz] of blockCenters) {
        const slab = new THREE.BoxGeometry(76, 0.14, 76);
        slab.translate(cx, 0.07, cz);
        scaleUV(slab, 3, 3);
        geometries.push(slab);
    }
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, concreteMaterial);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    game.scene.add(mesh);
}

function createStreetLamps() {
    const poles = [];
    const heads = [];

    for (let x = -900; x <= 900; x += 200) {
        for (let z = -900; z <= 900; z += 200) {
            if (Math.hypot(x, z) < 60) continue;

            const lx = x - 14;
            const lz = z - 14;

            const pole = new THREE.CylinderGeometry(0.22, 0.32, 9, 6);
            pole.translate(lx, 4.5, lz);
            poles.push(pole);

            const arm = new THREE.BoxGeometry(2.6, 0.18, 0.18);
            arm.translate(lx + 1.2, 8.9, lz);
            poles.push(arm);

            const head = new THREE.BoxGeometry(1.2, 0.16, 0.42);
            head.translate(lx + 2.3, 8.8, lz);
            heads.push(head);
        }
    }

    const poleMesh = new THREE.Mesh(mergeGeometries(poles, false), getDarkMetalMaterial());
    poleMesh.castShadow = true;
    poleMesh.receiveShadow = true;
    game.scene.add(poleMesh);

    const headMesh = new THREE.Mesh(mergeGeometries(heads, false), glowMaterial(CONFIG.neon.amber, 3.2));
    game.scene.add(headMesh);
}

function createCityscape() {
    const facadeMaterials = getFacadeMaterials();
    const buckets = facadeMaterials.map(() => []);
    const roofGeometries = [];
    const beacons = [];
    const signs = getSignPool();
    const blockCenters = [];
    const warmGlow = [];
    const coolGlow = [];

    const box = (w, h, d, x, y, z) => {
        const geometry = new THREE.BoxGeometry(w, h, d);
        geometry.translate(x, y, z);
        return geometry;
    };

    const addFacade = (bucket, w, h, d, x, y, z, uvW, uvH) => {
        const geometry = new THREE.BoxGeometry(w, h, d);
        scaleUV(geometry, Math.max(1, uvW), Math.max(1, uvH));
        geometry.translate(x, y, z);
        bucket.push(geometry);
    };

    const addRoof = (w, h, d, x, y, z) => {
        roofGeometries.push(box(w, h, d, x, y, z));
    };

    const addBeacon = (x, y, z) => {
        const beacon = new THREE.SphereGeometry(0.75, 6, 4);
        beacon.translate(x, y, z);
        beacons.push({ geometry: beacon, color: Math.random() > 0.35 ? CONFIG.neon.red : CONFIG.neon.cyan });
    };

    function buildHouse(cx, cz, footprint) {
        const rowHouse = Math.random() < 0.45;
        const width = footprint * (0.32 + Math.random() * 0.2);
        const depth = footprint * (0.28 + Math.random() * 0.18);
        const floorH = 3.3;
        const floors = rowHouse ? 2 + (Math.random() < 0.4 ? 1 : 0) : 1 + Math.floor(Math.random() * 2);
        const wallH = floors * floorH;
        const base = 0.14;
        const bucket = buckets[3 + Math.floor(Math.random() * 3)];

        if (rowHouse) {
            addFacade(bucket, width, wallH, depth, cx, base + wallH / 2, cz,
                Math.max(1, width / 9), Math.max(1, wallH / 7));

            // Gabled roof: a three-sided prism flattened into a shallow pitch.
            const roofRadius = width * 0.52;
            const roof = new THREE.CylinderGeometry(roofRadius, roofRadius, depth * 0.98, 3, 1);
            roof.rotateX(Math.PI / 2);
            roof.rotateZ(Math.PI / 2);
            roof.scale(1, 0.24, 1);
            roof.translate(cx, base + wallH + roofRadius * 0.2, cz);
            roofGeometries.push(roof);

            for (let floor = 0; floor < floors; floor++) {
                const y = base + 1.55 + floor * floorH;
                warmGlow.push(box(width * 0.6, 1.15, 0.12, cx - width * 0.1, y, cz + depth / 2 + 0.02));
                warmGlow.push(box(width * 0.3, 1.15, 0.12, cx + width * 0.22, y, cz - depth / 2 - 0.02));
            }
        } else {
            // Modern house: stacked volumes with cantilevered floor slabs.
            const lowerH = floorH + 0.7;
            addFacade(bucket, width, lowerH, depth, cx, base + lowerH / 2, cz,
                Math.max(1, width / 10), Math.max(1, lowerH / 7));

            const upperW = width * (0.7 + Math.random() * 0.2);
            const upperD = depth * (0.78 + Math.random() * 0.2);
            const upperH = Math.max(1.6, wallH - lowerH);
            const shift = (Math.random() < 0.5 ? -1 : 1) * width * 0.12;
            addFacade(bucket, upperW, upperH, upperD, cx + shift, base + lowerH + upperH / 2, cz,
                Math.max(1, upperW / 10), Math.max(1, upperH / 7));

            addRoof(width + 1.8, 0.32, depth + 1.8, cx, base + lowerH, cz);
            addRoof(upperW + 1.2, 0.3, upperD + 1.2, cx + shift, base + wallH, cz);

            warmGlow.push(box(width * 0.72, 1.2, 0.12, cx, base + 1.9, cz + depth / 2 + 0.02));
            warmGlow.push(box(width * 0.72, 1.2, 0.12, cx, base + 1.9, cz - depth / 2 - 0.02));
            if (upperH > 2.4) {
                warmGlow.push(box(upperW * 0.7, 1.05, 0.12, cx + shift, base + lowerH + upperH * 0.55, cz + upperD / 2 + 0.02));
            }

            // Rooftop garden edge.
            addRoof(upperW * 0.9, 0.45, 0.28, cx + shift, base + wallH + 0.22, cz + upperD / 2 - 0.14);
        }

        addCollider(new THREE.Box3(
            new THREE.Vector3(cx - width / 2, 0, cz - depth / 2),
            new THREE.Vector3(cx + width / 2, wallH + (rowHouse ? 4 : 2), cz + depth / 2)
        ));
    }

    function buildSkyscraper(cx, cz, footprint, height) {
        const bucket = buckets[Math.random() < 0.5 ? 0 : 4];
        let width = footprint * (0.5 + Math.random() * 0.16);
        let y = 0.14;
        let remaining = height;
        const tiers = 3 + Math.floor(Math.random() * 3);

        for (let tier = 0; tier < tiers; tier++) {
            const last = tier === tiers - 1;
            const tierHeight = last ? remaining : Math.max(12, remaining * (0.28 + Math.random() * 0.1));
            addFacade(bucket, width, tierHeight, width, cx, y + tierHeight / 2, cz,
                Math.max(1, width / 22), Math.max(1, tierHeight / 22));
            y += tierHeight;
            remaining -= tierHeight;
            width *= 0.85;
            if (remaining < 6) break;
        }

        // Glowing crown band around the top tier.
        coolGlow.push(box(width * 1.14, 1.6, width * 1.14, cx, y - 1.1, cz));

        // Neon corner strips running up the lower shaft.
        const stripHeight = Math.min(70, y * 0.42);
        const corner = footprint * 0.26;
        for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
                coolGlow.push(box(0.55, stripHeight, 0.55, cx + sx * corner, 0.14 + stripHeight / 2, cz + sz * corner));
            }
        }

        const mastHeight = 18 + Math.random() * 32;
        addRoof(0.55, mastHeight, 0.55, cx, y + mastHeight / 2, cz);
        addBeacon(cx, y + mastHeight + 0.6, cz);

        addCollider(new THREE.Box3(
            new THREE.Vector3(cx - footprint / 2, 0, cz - footprint / 2),
            new THREE.Vector3(cx + footprint / 2, y, cz + footprint / 2)
        ));
    }

    function buildTower(cx, cz, footprint, height, variant) {
        const bucket = buckets[variant];
        let width = footprint * (0.72 + Math.random() * 0.22);
        let y = 0.14;
        let segments = 0;

        while (y < height && segments < 14) {
            const segmentHeight = Math.min(8 + Math.random() * 24, height - y);
            if (segmentHeight < 1) break;
            addFacade(bucket, width, segmentHeight, width, cx, y + segmentHeight / 2, cz,
                Math.max(1, width / 26), Math.max(1, segmentHeight / 26));
            y += segmentHeight;
            width = Math.max(footprint * 0.42, width * (0.85 + Math.random() * 0.09));
            segments++;
        }

        // Rooftop plant and antenna masts.
        const roofUnitCount = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < roofUnitCount; i++) {
            const unitW = 3 + Math.random() * 6;
            const unitH = 1 + Math.random() * 2.5;
            addRoof(unitW, unitH, unitW,
                cx + (Math.random() - 0.5) * width * 0.5,
                y + unitH / 2,
                cz + (Math.random() - 0.5) * width * 0.5);
        }

        if (Math.random() < 0.6) {
            const mastHeight = 8 + Math.random() * 34;
            addRoof(0.44, mastHeight, 0.44, cx, y + mastHeight / 2, cz);
            addBeacon(cx, y + mastHeight + 0.6, cz);
        }

        addCollider(new THREE.Box3(
            new THREE.Vector3(cx - footprint / 2, 0, cz - footprint / 2),
            new THREE.Vector3(cx + footprint / 2, y, cz + footprint / 2)
        ));

        return y;
    }

    function buildLowrise(cx, cz, footprint) {
        const bucket = buckets[Math.random() < 0.5 ? 3 : 5];
        const width = footprint * (0.7 + Math.random() * 0.2);
        const depth = footprint * (0.6 + Math.random() * 0.25);
        const height = 7 + Math.random() * 12;
        const base = 0.14;

        addFacade(bucket, width, height, depth, cx, base + height / 2, cz,
            Math.max(1, width / 18), Math.max(1, height / 12));
        coolGlow.push(box(width * 0.82, 0.7, 0.14, cx, base + height * 0.72, cz + depth / 2 + 0.08));

        if (Math.random() < 0.5) {
            addRoof(width * 0.9, 0.8, 0.5, cx, base + height + 0.4, cz + depth / 2 - 0.3);
            addRoof(3.5, 2.2, 3.5, cx + width * 0.24, base + height + 1.1, cz - depth * 0.2);
        }

        addCollider(new THREE.Box3(
            new THREE.Vector3(cx - width / 2, 0, cz - depth / 2),
            new THREE.Vector3(cx + width / 2, height + 1, cz + depth / 2)
        ));
    }

    for (let x = -CONFIG.citySize / 2; x < CONFIG.citySize / 2; x += CONFIG.blockSize) {
        for (let z = -CONFIG.citySize / 2; z < CONFIG.citySize / 2; z += CONFIG.blockSize) {
            const cx = x + CONFIG.blockSize / 2;
            const cz = z + CONFIG.blockSize / 2;
            blockCenters.push([cx, cz]);

            if (Math.abs(cx) < 130 && Math.abs(cz) < 130) continue;
            if (Math.hypot(cx - JAIL_POS.x, cz - JAIL_POS.z) < 55) continue;

            const footprint = CONFIG.blockSize - CONFIG.roadWidth;
            const distance = Math.hypot(cx, cz);
            const roll = Math.random();

            // District mix: low modern houses on the outskirts, mid-rise
            // blocks through the middle, and sparse supertall towers.
            let kind = 'tower';
            if (distance > 260 && roll < 0.08) kind = 'supertall';
            else if (distance > 420 && roll < 0.62) kind = 'house';
            else if (distance > 180 && roll < 0.44) kind = 'house';
            else if (roll > 0.9) kind = 'lowrise';

            if (kind === 'house') {
                buildHouse(cx, cz, footprint);
                continue;
            }

            if (kind === 'lowrise') {
                buildLowrise(cx, cz, footprint);
                continue;
            }

            const widthBase = footprint * (0.72 + Math.random() * 0.22);
            let finalHeight;

            if (kind === 'supertall') {
                finalHeight = 230 + Math.pow(Math.random(), 0.75) * 220;
                buildSkyscraper(cx, cz, footprint, finalHeight);
            } else {
                const height = 22 + Math.pow(Math.random(), 1.7) * 132;
                finalHeight = buildTower(cx, cz, footprint, height, Math.floor(Math.random() * facadeMaterials.length));
            }

            // Neon blade signs on random tower facades.
            if (Math.random() < 0.42) {
                const sign = signs[Math.floor(Math.random() * signs.length)];
                const signWidth = 9 + Math.random() * 12;
                const signHeight = signWidth * 0.25;
                const plane = new THREE.PlaneGeometry(signWidth, signHeight);
                const mesh = new THREE.Mesh(plane, getSignMaterial(sign.texture));
                const signHalf = Math.max(5, widthBase / 2);
                mesh.position.set(cx, 7 + Math.random() * Math.min(16, Math.max(6, finalHeight * 0.16)), cz);
                const side = Math.floor(Math.random() * 4);
                if (side === 0) { mesh.position.z += signHalf + 0.4; }
                else if (side === 1) { mesh.position.z -= signHalf + 0.4; mesh.rotation.y = Math.PI; }
                else if (side === 2) { mesh.position.x += signHalf + 0.4; mesh.rotation.y = Math.PI / 2; }
                else { mesh.position.x -= signHalf + 0.4; mesh.rotation.y = -Math.PI / 2; }
                game.scene.add(mesh);
            }
        }
    }

    createSidewalks(blockCenters);

    buckets.forEach((geometries, index) => {
        if (!geometries.length) return;
        const merged = mergeGeometries(geometries, false);
        if (!merged) return;
        const mesh = new THREE.Mesh(merged, facadeMaterials[index]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        game.scene.add(mesh);
    });

    if (roofGeometries.length) {
        const mergedRoof = mergeGeometries(roofGeometries, false);
        if (mergedRoof) {
            const roofMesh = new THREE.Mesh(mergedRoof, getDarkMetalMaterial());
            roofMesh.castShadow = true;
            roofMesh.receiveShadow = true;
            game.scene.add(roofMesh);
        }
    }

    // Warm ribbons light the houses; cold neon marks the tower crowns.
    if (warmGlow.length) {
        const mergedWarm = mergeGeometries(warmGlow, false);
        if (mergedWarm) {
            game.scene.add(new THREE.Mesh(mergedWarm, glowMaterial(0xffc37a, 1.7)));
        }
    }

    if (coolGlow.length) {
        const mergedCool = mergeGeometries(coolGlow, false);
        if (mergedCool) {
            game.scene.add(new THREE.Mesh(mergedCool, glowMaterial(CONFIG.neon.cyan, 2.2)));
        }
    }

    // Blinking rooftop beacons, one instanced draw per color.
    for (const color of [CONFIG.neon.red, CONFIG.neon.cyan]) {
        const group = beacons.filter(b => b.color === color);
        if (!group.length) continue;
        const instanced = new THREE.InstancedMesh(
            new THREE.SphereGeometry(0.8, 6, 4),
            glowMaterial(color, 3.5),
            group.length
        );
        const matrix = new THREE.Matrix4();
        group.forEach((beacon, index) => {
            const pos = beacon.geometry.attributes.position;
            // Geometry was translated so use its bounding sphere center.
            beacon.geometry.computeBoundingSphere();
            matrix.makeTranslation(
                beacon.geometry.boundingSphere.center.x,
                beacon.geometry.boundingSphere.center.y,
                beacon.geometry.boundingSphere.center.z
            );
            instancesSet(instanced, index, matrix);
            beacon.geometry.dispose();
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.frustumCulled = false;
        game.scene.add(instanced);
    }

    createStreetLamps();
}

function instancesSet(instanced, index, matrix) {
    instanced.setMatrixAt(index, matrix);
}

// ---------------------------------------------------------------------------
// Holographic billboards
// ---------------------------------------------------------------------------

function createHolograms() {
    const textures = getAdTextures();
    const positions = [
        [-70, 22, -70, Math.PI / 4],
        [70, 22, -70, -Math.PI / 4],
        [-70, 22, 70, (3 * Math.PI) / 4],
        [70, 22, 70, (-3 * Math.PI) / 4],
        [0, 30, -110, 0],
        [0, 30, 110, Math.PI]
    ];

    positions.forEach(([x, y, z, rotY], index) => {
        const texture = textures[index % textures.length];
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uMap: { value: texture },
                uTint: { value: new THREE.Color(CONFIG.neon.cyan) }
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform float uTime;
                uniform sampler2D uMap;
                uniform vec3 uTint;
                varying vec2 vUv;
                void main() {
                    float row = floor(vUv.y * 70.0);
                    float tear = step(0.992, fract(sin(row * 91.7 + floor(uTime * 5.0)) * 43758.5453));
                    vec2 uv = vUv;
                    uv.x += (fract(sin(vUv.y * 131.0 + uTime * 2.0) * 43758.5) - 0.5) * 0.05 * tear;

                    vec3 col = texture2D(uMap, uv).rgb;
                    float scan = 0.82 + 0.18 * sin(vUv.y * 700.0 - uTime * 9.0);
                    float flicker = 0.92 + 0.08 * sin(uTime * 13.0 + row);
                    col *= scan * flicker;
                    col += uTint * 0.06;

                    float alpha = 0.78 + 0.12 * scan;
                    gl_FragColor = vec4(col * 1.8, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
        });

        holoMaterials.push(material);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 30), material);
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotY;
        game.scene.add(mesh);
    });
}

// ---------------------------------------------------------------------------
// Matrix code rain
// ---------------------------------------------------------------------------

function createMatrixRain() {
    // Build the rain as columns of glyphs. Each column shares one phase and
    // speed so the trail points fall together like a stream of code.
    const columns = QUALITY.rainColumns;
    const trailLength = QUALITY.rainTrail;
    const count = columns * trailLength;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const speeds = new Float32Array(count);
    const glyphs = new Float32Array(count);
    const brightness = new Float32Array(count);
    const trails = new Float32Array(count);

    let cursor = 0;
    for (let column = 0; column < columns; column++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 120 + Math.sqrt(Math.random()) * 1300;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const baseY = 50 + Math.random() * 650;
        const speed = 30 + Math.random() * 90;

        for (let trail = 0; trail < trailLength; trail++) {
            positions[cursor * 3] = x;
            positions[cursor * 3 + 1] = baseY;
            positions[cursor * 3 + 2] = z;

            scales[cursor] = 10 + Math.random() * 12;
            speeds[cursor] = speed;
            glyphs[cursor] = Math.floor(Math.random() * 64);
            brightness[cursor] = (1 - trail / trailLength) * (0.75 + Math.random() * 0.55);
            trails[cursor] = trail;
            cursor++;
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('aGlyph', new THREE.BufferAttribute(glyphs, 1));
    geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
    geometry.setAttribute('aTrail', new THREE.BufferAttribute(trails, 1));

    rainUniforms = {
        uTime: { value: 0 },
        uAtlas: { value: getGlyphTexture() },
        uPixelRatio: { value: game.renderer ? game.renderer.getPixelRatio() : QUALITY.pixelRatio },
        uColorA: { value: new THREE.Color(0x2bff9e) },
        uColorB: { value: new THREE.Color(0x27e7ff) },
        uHeight: { value: 720 }
    };

    const material = new THREE.ShaderMaterial({
        uniforms: rainUniforms,
        vertexShader: /* glsl */`
            uniform float uTime;
            uniform float uPixelRatio;
            uniform float uHeight;
            attribute float aScale;
            attribute float aSpeed;
            attribute float aGlyph;
            attribute float aBrightness;
            attribute float aTrail;
            varying float vGlyph;
            varying float vBrightness;
            varying float vFade;

            void main() {
                vGlyph = aGlyph;
                vBrightness = aBrightness;

                vec3 pos = position;
                float fall = mod(position.y - uTime * aSpeed, uHeight);
                pos.y = 25.0 + fall - aTrail * 5.0;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float pointSize = aScale * uPixelRatio * (320.0 / max(-mvPosition.z, 1.0)) * (1.0 - aTrail * 0.04);
                gl_PointSize = clamp(pointSize, 1.0, 42.0 * uPixelRatio);
                gl_Position = projectionMatrix * mvPosition;

                vFade = smoothstep(20.0, 90.0, pos.y) * smoothstep(700.0, 480.0, pos.y);
            }
        `,
        fragmentShader: /* glsl */`
            uniform sampler2D uAtlas;
            uniform float uTime;
            uniform vec3 uColorA;
            uniform vec3 uColorB;
            varying float vGlyph;
            varying float vBrightness;
            varying float vFade;

            void main() {
                vec2 uv = gl_PointCoord;
                uv.y = 1.0 - uv.y;

                vec2 cell = vec2(mod(vGlyph, 8.0), floor(vGlyph / 8.0));
                vec2 atlasUv = (cell + uv) / 8.0;

                vec4 glyph = texture2D(uAtlas, atlasUv);
                if (glyph.a < 0.12) discard;

                vec3 col = mix(uColorA, uColorB, fract(vGlyph * 0.137));
                float flicker = 0.55 + 0.45 * sin(uTime * 9.0 + vGlyph * 5.7);

                float alpha = glyph.a * vFade * vBrightness * flicker;
                gl_FragColor = vec4(col * glyph.a * vBrightness * flicker, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        fog: false
    });

    const rain = new THREE.Points(geometry, material);
    rain.frustumCulled = false;
    rain.renderOrder = 4;
    game.scene.add(rain);

    const shadowRain = rain;
    game.matrixRain = shadowRain;
}

// ---------------------------------------------------------------------------
// Traffic drones
// ---------------------------------------------------------------------------

function createDrones() {
    const bodyGeometry = new THREE.SphereGeometry(0.9, 10, 8);
    const ringGeometry = new THREE.TorusGeometry(1.5, 0.09, 6, 18);

    for (let i = 0; i < QUALITY.droneCount; i++) {
        const color = CONFIG.neonColors[i % CONFIG.neonColors.length];
        const group = new THREE.Group();

        const body = new THREE.Mesh(bodyGeometry, getDarkMetalMaterial());
        body.castShadow = true;
        group.add(body);

        const ring = new THREE.Mesh(ringGeometry, glowMaterial(color, 3));
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.7
        }));
        glow.scale.set(5, 5, 1);
        group.add(glow);

        group.position.set(0, 40 + Math.random() * 70, 0);
        game.scene.add(group);

        drones.push({
            group,
            angle: Math.random() * Math.PI * 2,
            radius: 70 + Math.random() * 280,
            speed: 0.12 + Math.random() * 0.22,
            height: 40 + Math.random() * 70,
            bob: Math.random() * Math.PI * 2
        });
    }
}

// ---------------------------------------------------------------------------
// Detention block
// ---------------------------------------------------------------------------

function createJail() {
    const scene = game.scene;

    const pad = new THREE.Mesh(new THREE.BoxGeometry(44, 0.6, 44), concreteMaterial);
    pad.position.copy(JAIL_POS);
    pad.position.y = 0.3;
    pad.receiveShadow = true;
    pad.castShadow = true;
    scene.add(pad);

    // Glowing containment bars around an open-front cell.
    const bars = [];
    const barSize = 0.28;
    const cellHalf = 8;
    const barHeight = 8;

    for (let x = -cellHalf; x <= cellHalf; x += 1.7) {
        for (const z of [-cellHalf, cellHalf]) {
            const bar = new THREE.BoxGeometry(barSize, barHeight, barSize);
            bar.translate(JAIL_POS.x + x, 0.6 + barHeight / 2, JAIL_POS.z + z);
            bars.push(bar);
        }
    }
    for (let z = -cellHalf + 1.7; z <= cellHalf - 1.7; z += 1.7) {
        for (const x of [-cellHalf, cellHalf]) {
            const bar = new THREE.BoxGeometry(barSize, barHeight, barSize);
            bar.translate(JAIL_POS.x + x, 0.6 + barHeight / 2, JAIL_POS.z + z);
            bars.push(bar);
        }
    }

    const mergedBars = mergeGeometries(bars, false);
    if (mergedBars) {
        const mesh = new THREE.Mesh(mergedBars, glowMaterial(CONFIG.neon.red, 2.6));
        scene.add(mesh);
    }

    const topBeams = [];
    for (const [dx, dz, w, d] of [[0, -cellHalf, cellHalf * 2 + 1, 0.6], [0, cellHalf, cellHalf * 2 + 1, 0.6], [-cellHalf, 0, 0.6, cellHalf * 2 + 1], [cellHalf, 0, 0.6, cellHalf * 2 + 1]]) {
        const beam = new THREE.BoxGeometry(w, 0.6, d);
        beam.translate(JAIL_POS.x + dx, 0.6 + barHeight, JAIL_POS.z + dz);
        topBeams.push(beam);
    }
    const mergedBeams = mergeGeometries(topBeams, false);
    if (mergedBeams) {
        const beamMesh = new THREE.Mesh(mergedBeams, getDarkMetalMaterial());
        beamMesh.castShadow = true;
        scene.add(beamMesh);
    }

    // Detention sign.
    const signs = getSignPool();
    const detention = signs.find(entry => entry.text === 'DETENTION') || signs[0];
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 3.5),
        new THREE.MeshBasicMaterial({
            map: detention.texture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide
        })
    );
    sign.position.set(JAIL_POS.x, 10.5, JAIL_POS.z);
    sign.rotation.y = Math.PI;
    scene.add(sign);

    const lamp = new THREE.PointLight(CONFIG.neon.red, 220, 60, 2);
    lamp.position.set(JAIL_POS.x, 9, JAIL_POS.z);
    scene.add(lamp);

    // Walls of the cell are collision-only (glowing bars do the visual work).
    addCollider(new THREE.Box3(
        new THREE.Vector3(JAIL_POS.x - cellHalf - 1, 0, JAIL_POS.z - cellHalf - 1),
        new THREE.Vector3(JAIL_POS.x - cellHalf, 9, JAIL_POS.z + cellHalf + 1)
    ));
    addCollider(new THREE.Box3(
        new THREE.Vector3(JAIL_POS.x + cellHalf, 0, JAIL_POS.z - cellHalf - 1),
        new THREE.Vector3(JAIL_POS.x + cellHalf + 1, 9, JAIL_POS.z + cellHalf + 1)
    ));
    addCollider(new THREE.Box3(
        new THREE.Vector3(JAIL_POS.x - cellHalf - 1, 0, JAIL_POS.z - cellHalf - 1),
        new THREE.Vector3(JAIL_POS.x + cellHalf + 1, 9, JAIL_POS.z - cellHalf)
    ));
}

// ---------------------------------------------------------------------------
// Boot / per-frame update
// ---------------------------------------------------------------------------

function createPlazaDecal() {
    const material = new THREE.MeshBasicMaterial({
        map: getPlazaDecalTexture(),
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(86, 86), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.055, 0);
    mesh.renderOrder = 1;
    game.scene.add(mesh);
}

function createPlazaProps() {
    const barrierGeometries = [];
    const barrierStrips = [];
    const bottomBarrierSpots = [
        [-26, -26, 0], [26, -26, 0], [-26, 26, 0], [26, 26, 0],
        [0, -31, 0], [0, 31, 0], [-31, 0, Math.PI / 2], [31, 0, Math.PI / 2]
    ];

    for (const [x, z, rotation] of bottomBarrierSpots) {
        const base = new THREE.BoxGeometry(6, 1.05, 1.3);
        base.rotateY(rotation);
        base.translate(x, 0.68, z);
        barrierGeometries.push(base);

        const strip = new THREE.BoxGeometry(6.05, 0.08, 0.1);
        strip.rotateY(rotation);
        strip.translate(
            x + Math.sin(rotation) * 0.7,
            1.13,
            z + Math.cos(rotation) * 0.7
        );
        barrierStrips.push(strip);

        const halfX = rotation === 0 ? 3.2 : 0.8;
        const halfZ = rotation === 0 ? 0.8 : 3.2;
        addCollider(new THREE.Box3(
            new THREE.Vector3(x - halfX, 0, z - halfZ),
            new THREE.Vector3(x + halfX, 1.2, z + halfZ)
        ));
    }

    const barrierMesh = new THREE.Mesh(mergeGeometries(barrierGeometries, false), concreteMaterial);
    barrierMesh.castShadow = true;
    barrierMesh.receiveShadow = true;
    game.scene.add(barrierMesh);

    const stripMesh = new THREE.Mesh(mergeGeometries(barrierStrips, false), glowMaterial(CONFIG.neon.amber, 2.2));
    game.scene.add(stripMesh);

    // Freight crates give the spawn plaza readable scale and close-up detail.
    const crateGeometries = [];
    const crateSpots = [[-14, -5], [16, 7], [-10, 17], [21, -10]];
    for (const [x, z] of crateSpots) {
        const crate = new THREE.BoxGeometry(2.4, 2.2, 2.4);
        crate.translate(x, 1.24, z);
        crateGeometries.push(crate);

        addCollider(new THREE.Box3(
            new THREE.Vector3(x - 1.2, 0, z - 1.2),
            new THREE.Vector3(x + 1.2, 2.4, z + 1.2)
        ));
    }

    const crateMesh = new THREE.Mesh(mergeGeometries(crateGeometries, false), getDarkMetalMaterial());
    crateMesh.castShadow = true;
    crateMesh.receiveShadow = true;
    game.scene.add(crateMesh);
}

export function createWorld() {
    const scene = game.scene;
    scene.background = new THREE.Color(CONFIG.fogColor);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);
    scene.environment = getEnvMap(game.renderer);

    createSky();
    createLights();
    createGround();
    createCityscape();
    createPlazaProps();
    createPlazaDecal();
    createJail();
    createHolograms();
    createMatrixRain();
    createDrones();
}

export function updateWorld(time, dt) {
    if (skyUniforms) skyUniforms.uTime.value = time;
    if (rainUniforms) {
        rainUniforms.uTime.value = time;
        rainUniforms.uPixelRatio.value = game.renderer ? game.renderer.getPixelRatio() : QUALITY.pixelRatio;
    }
    if (ground && ground.material && ground.material.uniforms) {
        ground.material.uniforms.uTime.value = time;
    }

    if (sun && game.camera) {
        game.camera.getWorldPosition(tmpCameraPos);
        sun.position.set(tmpCameraPos.x + 170, 250, tmpCameraPos.z + 130);
        sun.target.position.set(tmpCameraPos.x, 0, tmpCameraPos.z);
        sun.target.updateMatrixWorld();
    }

    for (const material of holoMaterials) {
        material.uniforms.uTime.value = time;
    }

    for (const entry of signMaterials) {
        entry.material.opacity = 0.72 + 0.24 * Math.sin(time * 2.4 + entry.phase);
    }

    for (const drone of drones) {
        drone.angle += drone.speed * dt;
        drone.group.position.set(
            Math.cos(drone.angle) * drone.radius,
            drone.height + Math.sin(time * 0.7 + drone.bob) * 3.5,
            Math.sin(drone.angle) * drone.radius
        );
        drone.group.rotation.y = -drone.angle;
    }
}
