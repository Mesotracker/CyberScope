import * as THREE from 'three';
import { CONFIG, IS_MOBILE, QUALITY } from './config.js';
import { game } from './state.js';
import { createWorld, updateWorld } from './world.js';
import { initPlayer, updatePlayer, respawn } from './player.js';
import { initMobile } from './mobile.js';
import {
    spawnNPCs,
    spawnSingleNPC,
    spawnCars,
    spawnPickups,
    spawnHearts,
    updateNPCs,
    updateCars,
    updatePickups
} from './entities.js';
import { createComposer, updateComposer, resizeComposer } from './postfx.js';
import { updateEffects } from './effects.js';
import { updateCombat } from './combat.js';
import * as ui from './ui.js';

let previousTime = 0;

// ---------------------------------------------------------------------------
// Viewport fitting
// ---------------------------------------------------------------------------

// Frame-rate governor. Desktop stays pinned at its high-quality ratio; touch
// devices may drop render resolution to protect the frame rate on weaker GPUs.
const perf = {
    ratio: QUALITY.pixelRatio,
    max: QUALITY.maxPixelRatio,
    min: QUALITY.minPixelRatio,
    adaptive: QUALITY.adaptive,
    frames: 0,
    sampleTime: 0,
    fastSamples: 0
};

let viewport = { width: 1, height: 1 };
let fitQueued = false;
let settleTimer = 0;

function readViewport() {
    // visualViewport is the actually visible area on mobile, so the canvas
    // keeps fitting while the URL bar slides in and out or the device rotates.
    const vv = window.visualViewport;
    const width = Math.round(vv && vv.width ? vv.width : window.innerWidth);
    const height = Math.round(vv && vv.height ? vv.height : window.innerHeight);
    return { width: Math.max(1, width), height: Math.max(1, height) };
}

function applyPixelRatio(ratio) {
    perf.ratio = ratio;
    if (!game.renderer) return;

    game.renderer.setPixelRatio(ratio);
    if (game.composer) {
        resizeComposer(game.composer, viewport.width, viewport.height, ratio);
    }
}

function fitViewport() {
    viewport = readViewport();
    game.viewport = viewport;

    if (game.camera) {
        game.camera.aspect = viewport.width / viewport.height;
        game.camera.updateProjectionMatrix();
    }

    if (game.renderer) {
        game.renderer.setSize(viewport.width, viewport.height);
    }

    if (game.composer) {
        resizeComposer(game.composer, viewport.width, viewport.height, perf.ratio);
    }
}

function scheduleFit() {
    if (!fitQueued) {
        fitQueued = true;
        requestAnimationFrame(() => {
            fitQueued = false;
            fitViewport();
        });
    }

    // Mobile browser chrome settles asynchronously after a resize/rotation.
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(fitViewport, 220);
}

function updateAdaptiveQuality(rawDt) {
    if (!perf.adaptive || !game.renderer) return;

    // Ignore tab stalls and the first frames after a pause, but keep truly
    // slow devices in the average so the governor can still help them.
    if (document.hidden || rawDt <= 0 || rawDt > 1) {
        perf.frames = 0;
        perf.sampleTime = 0;
        return;
    }

    perf.frames++;
    perf.sampleTime += rawDt;
    if (perf.sampleTime < 1.5) return;

    const fps = perf.frames / perf.sampleTime;
    perf.frames = 0;
    perf.sampleTime = 0;

    if (fps < 45 && perf.ratio > perf.min) {
        perf.fastSamples = 0;
        applyPixelRatio(Math.max(perf.min, Math.round((perf.ratio - 0.15) * 100) / 100));
    } else if (fps > 57 && perf.ratio < perf.max) {
        // Only climb back after several healthy samples, so it cannot oscillate.
        perf.fastSamples++;
        if (perf.fastSamples >= 4) {
            perf.fastSamples = 0;
            applyPixelRatio(Math.min(perf.max, Math.round((perf.ratio + 0.1) * 100) / 100));
        }
    } else {
        perf.fastSamples = 0;
    }
}

function init() {
    const container = document.getElementById('canvas-container');

    game.mobile.enabled = IS_MOBILE;
    document.body.classList.toggle('is-mobile', IS_MOBILE);

    viewport = readViewport();
    game.viewport = viewport;

    game.renderer = new THREE.WebGLRenderer({
        antialias: QUALITY.antialias,
        powerPreference: IS_MOBILE ? 'default' : 'high-performance'
    });
    game.renderer.setPixelRatio(perf.ratio);
    game.renderer.setSize(viewport.width, viewport.height);
    game.renderer.shadowMap.enabled = QUALITY.shadows;
    game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    game.renderer.toneMappingExposure = 1.08;
    game.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(game.renderer.domElement);

    game.scene = new THREE.Scene();
    game.camera = new THREE.PerspectiveCamera(
        76,
        viewport.width / viewport.height,
        0.08,
        IS_MOBILE ? 5200 : 9000
    );
    game.camera.position.set(0, 2, 0);

    createWorld();
    initPlayer();
    initMobile();
    spawnNPCs();
    spawnCars();
    spawnPickups();
    spawnHearts();

    game.composer = createComposer(game.renderer, game.scene, game.camera);
    fitViewport();

    if (ui.dom.wastedScreen) {
        ui.dom.wastedScreen.addEventListener('click', () => {
            if (game.isDead && game.hooks.respawn) game.hooks.respawn();
        });
    }

    // Watch every way the usable window can change: desktop resize, mobile URL
    // bar, device rotation, fullscreen and layout-driven size changes.
    window.addEventListener('resize', scheduleFit, { passive: true });
    window.addEventListener('orientationchange', scheduleFit);
    window.addEventListener('pageshow', scheduleFit);
    document.addEventListener('fullscreenchange', scheduleFit);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleFit);
        window.visualViewport.addEventListener('scroll', scheduleFit, { passive: true });
    }
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(scheduleFit).observe(container);
    }

    if (ui.dom.loadingText) ui.dom.loadingText.style.display = 'none';
    if (ui.dom.blocker) ui.dom.blocker.style.display = 'flex';

    ui.setHealth(CONFIG.maxHealth);
    ui.updateWeaponUI();
    ui.updateHUD();

    previousTime = performance.now();
    animate(previousTime);
}

const frameCameraPosition = new THREE.Vector3();

function animate(now) {
    requestAnimationFrame(animate);

    const rawDt = (now - previousTime) / 1000;
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    previousTime = now;
    game.elapsed += dt;
    game.time = game.elapsed;

    try {
        updateWorld(game.elapsed, dt);
        updateEffects(dt);
        updateCombat(dt);

        game.camera.getWorldPosition(frameCameraPosition);

        if (!game.isMapOpen && !game.isDead) {
            updatePlayer(dt);

            if (game.controls && (game.controls.isLocked || game.mobile.active)) {
                updateNPCs(dt, frameCameraPosition);
                updateCars(dt, frameCameraPosition);

                if (game.npcs.length < CONFIG.npcCount + CONFIG.copCount && Math.random() < 0.01) {
                    spawnSingleNPC(Math.random() < CONFIG.copCount / (CONFIG.npcCount + CONFIG.copCount));
                }
            }

            updatePickups(dt, frameCameraPosition);
        } else {
            updatePlayer(dt);
        }

        ui.updateEntityHealthBars();
        ui.drawMinimap();

        if (game.isMapOpen) ui.drawFullMap();

        if (game.composer) {
            updateComposer(game.composer, game.elapsed);
            game.composer.render();
        } else {
            game.renderer.render(game.scene, game.camera);
        }

        updateAdaptiveQuality(rawDt);
    } catch (error) {
        ui.logDebug(`RUNTIME: ${error.message}`);
        console.error(error);
    }
}

window.addEventListener('error', (event) => {
    ui.logDebug(`ERROR: ${event.message}`);
});

window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
    ui.logDebug(`ASYNC: ${reason}`);
});

try {
    init();
} catch (error) {
    console.error(error);
    ui.logDebug(`INIT CRASH: ${error.message}`);

    const loading = document.getElementById('loading');
    if (loading) {
        loading.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'load-title error';
        title.textContent = 'BOOT FAILURE';
        const detail = document.createElement('div');
        detail.className = 'load-sub';
        detail.textContent = error.message;
        loading.appendChild(title);
        loading.appendChild(detail);
        loading.style.display = 'flex';
    }
}
