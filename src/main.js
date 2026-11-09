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

function init() {
    const container = document.getElementById('canvas-container');

    game.mobile.enabled = IS_MOBILE;
    document.body.classList.toggle('is-mobile', IS_MOBILE);

    game.renderer = new THREE.WebGLRenderer({
        antialias: QUALITY.antialias,
        powerPreference: IS_MOBILE ? 'default' : 'high-performance'
    });
    game.renderer.setPixelRatio(QUALITY.pixelRatio);
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    game.renderer.shadowMap.enabled = QUALITY.shadows;
    game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    game.renderer.toneMappingExposure = 1.08;
    game.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(game.renderer.domElement);

    game.scene = new THREE.Scene();
    game.camera = new THREE.PerspectiveCamera(
        76,
        window.innerWidth / window.innerHeight,
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

    if (ui.dom.wastedScreen) {
        ui.dom.wastedScreen.addEventListener('click', () => {
            if (game.isDead && game.hooks.respawn) game.hooks.respawn();
        });
    }

    window.addEventListener('resize', onWindowResize);

    if (ui.dom.loadingText) ui.dom.loadingText.style.display = 'none';
    if (ui.dom.blocker) ui.dom.blocker.style.display = 'flex';

    ui.setHealth(CONFIG.maxHealth);
    ui.updateWeaponUI();
    ui.updateHUD();

    previousTime = performance.now();
    animate(previousTime);
}

function onWindowResize() {
    if (!game.camera || !game.renderer) return;

    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    resizeComposer(game.composer, window.innerWidth, window.innerHeight);
}

const frameCameraPosition = new THREE.Vector3();

function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min((now - previousTime) / 1000, 0.1);
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
