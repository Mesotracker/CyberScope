import * as THREE from 'three';
import { game } from './state.js';
import { CONFIG, JAIL_POS, WEAPONS } from './config.js';
import { audio } from './audio.js';

const el = (id) => document.getElementById(id);

export const dom = {
    uiLayer: el('ui-layer'),
    blocker: el('blocker'),
    instructions: el('instructions'),
    messageBox: el('message-box'),
    modeDisplay: el('mode-display'),
    npcDisplay: el('npc-count'),
    scoreDisplay: el('score-val'),
    loadingText: el('loading'),
    minimapCanvas: el('minimap'),
    fullMapLayer: el('full-map-layer'),
    fullMapCanvas: el('full-map-canvas'),
    damageOverlay: el('damage-overlay'),
    healthBar: el('health-bar'),
    wastedScreen: el('wasted-screen'),
    debugLog: el('debug-log'),
    weaponSlots: document.querySelectorAll('.weapon-slot'),
    crosshair: el('crosshair')
};

dom.minimapCtx = dom.minimapCanvas ? dom.minimapCanvas.getContext('2d') : null;
dom.fullMapCtx = dom.fullMapCanvas ? dom.fullMapCanvas.getContext('2d') : null;

let messageTimer = 0;

export function logDebug(message) {
    if (!dom.debugLog) return;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const line = document.createElement('p');
    line.textContent = `[${time}] ${message}`;
    dom.debugLog.prepend(line);
    while (dom.debugLog.childElementCount > 30) {
        dom.debugLog.lastElementChild.remove();
    }
}

export function updateWeaponUI() {
    const state = game.gameState;
    dom.weaponSlots.forEach((slot, index) => {
        const weapon = WEAPONS[index];
        if (!weapon) return;
        slot.classList.toggle('active', index === state.currentWeaponIdx);
        slot.classList.toggle('locked', !state.inventory[index]);

        const ammoSpan = slot.querySelector('.ammo-count');
        if (!ammoSpan) return;
        const ammo = state.ammo[index];
        if (ammo === 9999) {
            ammoSpan.textContent = 'INF';
            ammoSpan.style.color = '#8ef6ff';
        } else {
            ammoSpan.textContent = ammo;
            ammoSpan.style.color = ammo <= 5 ? '#ff5566' : '#dff8ff';
        }
    });
}

export function updateHUD() {
    if (dom.modeDisplay) dom.modeDisplay.textContent = game.gameState.mode.toUpperCase();
    if (dom.npcDisplay) dom.npcDisplay.textContent = game.npcs.length;
}

export function setHealth(value) {
    game.playerHealth = Math.max(0, Math.min(CONFIG.maxHealth, value));
    if (dom.healthBar) dom.healthBar.style.width = `${(game.playerHealth / CONFIG.maxHealth) * 100}%`;
}

export function flashDamage() {
    if (!dom.damageOverlay) return;
    dom.damageOverlay.style.opacity = '1';
    setTimeout(() => { dom.damageOverlay.style.opacity = '0'; }, 130);
}

export function addScore(points, worldPosition) {
    game.score += points;
    if (dom.scoreDisplay) dom.scoreDisplay.textContent = game.score;
    audio.play('score');

    if (!worldPosition || !game.camera) return;

    const projected = worldPosition.clone().project(game.camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.15) return;

    const div = document.createElement('div');
    div.className = 'floating-score';
    div.textContent = `+${points}`;
    div.style.left = `${(projected.x * 0.5 + 0.5) * viewportWidth()}px`;
    div.style.top = `${(-projected.y * 0.5 + 0.5) * viewportHeight()}px`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1000);
}

export function showMessage(text, duration = 2000) {
    if (!dom.messageBox) return;
    dom.messageBox.textContent = text;
    dom.messageBox.style.opacity = '1';
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { dom.messageBox.style.opacity = '0'; }, duration);
}

export function createHealthBar() {
    const bar = document.createElement('div');
    bar.className = 'entity-health-bar';
    const fill = document.createElement('div');
    fill.className = 'entity-health-fill';
    bar.appendChild(fill);
    if (dom.uiLayer) dom.uiLayer.appendChild(bar);
    return bar;
}

const tmpWorld = new THREE.Vector3();
const tmpCamera = new THREE.Vector3();

// Projection uses the same fitted size as the renderer, not the layout window.
function viewportWidth() {
    return game.viewport ? game.viewport.width : window.innerWidth;
}

function viewportHeight() {
    return game.viewport ? game.viewport.height : window.innerHeight;
}

export function updateEntityHealthBars() {
    if (!game.camera) return;
    game.camera.getWorldPosition(tmpCamera);

    const entities = [...game.npcs, ...game.cars];
    for (const entity of entities) {
        const bar = entity.userData.healthBar;
        if (!bar) continue;

        if (!entity.parent || entity.userData.dead) {
            bar.style.display = 'none';
            continue;
        }

        entity.getWorldPosition(tmpWorld);
        const distance = tmpCamera.distanceTo(tmpWorld);
        tmpWorld.y += 3.5;
        const projected = tmpWorld.project(game.camera);

        // Off-screen entities would stretch the page, so hide their bars.
        if (projected.z > 1 || distance > 220 ||
            Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.15) {
            bar.style.display = 'none';
            continue;
        }

        bar.style.display = 'block';
        bar.style.left = `${(projected.x * 0.5 + 0.5) * viewportWidth()}px`;
        bar.style.top = `${(-projected.y * 0.5 + 0.5) * viewportHeight()}px`;

        const fill = bar.firstChild;
        if (fill) {
            const max = entity.userData.maxHealth || 100;
            const ratio = Math.max(0, entity.userData.health) / max;
            fill.style.width = `${ratio * 100}%`;
            fill.style.background = ratio > 0.3
                ? 'linear-gradient(90deg, #39ff9e, #b6ffe0)'
                : 'linear-gradient(90deg, #ff2bd6, #ff5566)';
        }
    }
}

export function setCrosshairVisible(visible) {
    if (dom.crosshair) dom.crosshair.style.display = visible ? 'block' : 'none';
}

export function setMapOpen(open) {
    if (dom.fullMapLayer) dom.fullMapLayer.style.display = open ? 'flex' : 'none';
}

export function showWasted(title, subtitle) {
    if (!dom.wastedScreen) return;
    const first = dom.wastedScreen.querySelector('div:first-child');
    const second = dom.wastedScreen.querySelector('div:last-child');
    if (first) first.textContent = title;
    if (second) second.textContent = subtitle;
    dom.wastedScreen.style.display = 'flex';
}

export function hideWasted() {
    if (dom.wastedScreen) dom.wastedScreen.style.display = 'none';
}

export function drawMinimap() {
    const ctx = dom.minimapCtx;
    if (!ctx || !game.camera) return;

    const w = 200;
    const h = 200;
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(0.5, 0.5);

    const cameraPos = new THREE.Vector3();
    game.camera.getWorldPosition(cameraPos);
    ctx.translate(-cameraPos.x, -cameraPos.z);

    const extent = CONFIG.citySize;
    ctx.strokeStyle = 'rgba(39, 231, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-extent / 2, -extent / 2, extent, extent);

    ctx.fillStyle = 'rgba(120, 150, 175, 0.20)';
    for (const box of game.colliders) {
        if (box.min && box.max) {
            ctx.fillRect(box.min.x, box.min.z, box.max.x - box.min.x, box.max.z - box.min.z);
        }
    }

    ctx.fillStyle = '#ff3b4e';
    ctx.fillRect(JAIL_POS.x - 8, JAIL_POS.z - 8, 16, 16);

    ctx.fillStyle = '#ffb03a';
    for (const pickup of game.pickups) {
        if (!pickup.mesh || !pickup.mesh.position) continue;
        ctx.beginPath();
        ctx.arc(pickup.mesh.position.x, pickup.mesh.position.z, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    for (const npc of game.npcs) {
        if (!npc.position || npc.userData.dead) continue;
        ctx.fillStyle = npc.userData.isCop ? '#ff2bd6' : (npc.userData.isGang ? '#ff3b4e' : '#39ff9e');
        ctx.beginPath();
        ctx.arc(npc.position.x, npc.position.z, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = '#27e7ff';
    for (const car of game.cars) {
        if (!car.position || !car.parent) continue;
        ctx.save();
        ctx.translate(car.position.x, car.position.z);
        ctx.rotate(-car.rotation.y);
        ctx.fillRect(-3, -6, 6, 12);
        ctx.restore();
    }

    ctx.restore();

    // Player arrow, always centered and rotated to view direction.
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const dir = new THREE.Vector3();
    game.camera.getWorldDirection(dir);
    ctx.rotate(Math.atan2(dir.x, dir.z));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-7, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Subtle glass ring.
    ctx.strokeStyle = 'rgba(39, 231, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
}

export function drawFullMap() {
    const ctx = dom.fullMapCtx;
    if (!ctx || !game.camera) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    if (dom.fullMapCanvas.width !== w) dom.fullMapCanvas.width = w;
    if (dom.fullMapCanvas.height !== h) dom.fullMapCanvas.height = h;

    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    const extent = CONFIG.citySize;
    const scale = (Math.min(w, h) - 100) / extent;
    ctx.scale(scale, scale);

    ctx.strokeStyle = 'rgba(39, 231, 255, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-extent / 2, -extent / 2, extent, extent);

    // Street grid.
    ctx.strokeStyle = 'rgba(39, 231, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let v = -extent / 2; v <= extent / 2; v += CONFIG.blockSize) {
        ctx.beginPath();
        ctx.moveTo(v, -extent / 2);
        ctx.lineTo(v, extent / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-extent / 2, v);
        ctx.lineTo(extent / 2, v);
        ctx.stroke();
    }

    ctx.fillStyle = 'rgba(130, 165, 190, 0.28)';
    for (const box of game.colliders) {
        if (box.min && box.max) ctx.fillRect(box.min.x, box.min.z, box.max.x - box.min.x, box.max.z - box.min.z);
    }

    ctx.fillStyle = '#ff3b4e';
    ctx.fillRect(JAIL_POS.x - 8, JAIL_POS.z - 8, 16, 16);

    ctx.fillStyle = '#ffb03a';
    for (const pickup of game.pickups) {
        if (!pickup.mesh || !pickup.mesh.position) continue;
        ctx.beginPath();
        ctx.arc(pickup.mesh.position.x, pickup.mesh.position.z, 14, 0, Math.PI * 2);
        ctx.fill();
    }

    for (const npc of game.npcs) {
        if (!npc.position || npc.userData.dead) continue;
        ctx.fillStyle = npc.userData.isCop ? '#ff2bd6' : (npc.userData.isGang ? '#ff3b4e' : '#39ff9e');
        ctx.beginPath();
        ctx.arc(npc.position.x, npc.position.z, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = '#27e7ff';
    for (const car of game.cars) {
        if (!car.position || !car.parent) continue;
        ctx.save();
        ctx.translate(car.position.x, car.position.z);
        ctx.rotate(-car.rotation.y);
        ctx.fillRect(-6, -10, 12, 20);
        ctx.restore();
    }

    const cameraPos = new THREE.Vector3();
    game.camera.getWorldPosition(cameraPos);
    const dir = new THREE.Vector3();
    game.camera.getWorldDirection(dir);

    ctx.save();
    ctx.translate(cameraPos.x, cameraPos.z);
    ctx.rotate(Math.atan2(dir.x, dir.z));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#04060b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(16, 20);
    ctx.lineTo(0, 10);
    ctx.lineTo(-16, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // Legend.
    ctx.font = '13px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(39, 231, 255, 0.8)';
    ctx.fillText('CLICK MAP TO TELEPORT  //  M TO CLOSE', w - 40, h - 40);
}
