import * as THREE from 'three';
import { CONFIG, JAIL_POS } from './config.js';
import { game } from './state.js';
import { audio } from './audio.js';
import * as ui from './ui.js';
import * as effects from './effects.js';

const corpses = [];
const hitPoint = new THREE.Vector3();

export function takeDamage(amount) {
    if (game.isDead) return;

    game.playerHealth = Math.max(0, game.playerHealth - amount);
    ui.setHealth(game.playerHealth);
    ui.flashDamage();

    if (game.playerHealth <= 0) die();
}

export function die() {
    if (game.isDead) return;
    game.isDead = true;
    game.gameState.mode = 'dead';
    game.isFiring = false;
    if (game.controls) game.controls.unlock();
    audio.stopCar();
    audio.play('die');
    ui.showWasted('SYSTEM FLATLINE', 'Click to re-initialize');
    ui.updateHUD();
    ui.logDebug('Player integrity lost.');
}

export function arrestPlayer() {
    if (game.isDead) return;

    if (game.gameState.currentVehicle && game.hooks.exitVehicle) {
        game.hooks.exitVehicle();
    }

    game.isDead = true;
    game.gameState.mode = 'ARRESTED';
    game.isFiring = false;
    if (game.controls) game.controls.unlock();

    game.camera.position.set(JAIL_POS.x, 2, JAIL_POS.z);
    game.velocity.set(0, 0, 0);
    game.canJump = false;

    audio.stopCar();
    audio.play('arrest');
    ui.showWasted('DETAINED', 'Serve your time... (Click to escape)');
    ui.updateHUD();
    ui.logDebug('Player detained by enforcement unit.');
}

function pushCorpse(npc) {
    corpses.push({ npc, rotation: 0, sink: 0, life: 2.2 });
}

export function damageNPC(npc, damage) {
    if (!npc || npc.userData.dead) return;

    npc.userData.health -= damage;

    hitPoint.set(npc.position.x, npc.position.y + 1.2, npc.position.z);
    effects.createImpact(hitPoint, npc.userData.isCop ? CONFIG.neon.magenta : CONFIG.neon.red);

    if (npc.userData.health <= 0) {
        npc.userData.dead = true;
        npc.userData.health = 0;
        audio.play('die');
        ui.addScore(damage >= 100 ? 100 : 50, npc.position);

        if (npc.userData.healthBar) {
            npc.userData.healthBar.remove();
            npc.userData.healthBar = null;
        }

        const index = game.npcs.indexOf(npc);
        if (index > -1) game.npcs.splice(index, 1);
        ui.updateHUD();
        pushCorpse(npc);
    }
}

export function damageCar(car, damage, depth = 0) {
    if (!car || car.userData.dead) return;

    car.userData.health = Math.max(0, car.userData.health - damage);

    if (car.userData.health <= 0) {
        car.userData.dead = true;

        if (game.gameState.currentVehicle === car) {
            if (game.hooks.exitVehicle) game.hooks.exitVehicle();
            takeDamage(80);
        }

        const impact = car.position.clone();
        impact.y += 1;

        const index = game.cars.indexOf(car);
        if (index > -1) game.cars.splice(index, 1);
        game.scene.remove(car);

        if (car.userData.healthBar) {
            car.userData.healthBar.remove();
            car.userData.healthBar = null;
        }

        if (depth < 2) {
            createExplosion(impact, 2.6, depth + 1);
        } else {
            effects.createBlastVisual(impact, 1.8);
        }
    }
}

export function createExplosion(position, scale = 1, depth = 0) {
    const now = performance.now();
    if (now - game.lastExplosionTime > 50) {
        audio.play('explosion');
        game.lastExplosionTime = now;
    }

    effects.createBlastVisual(position, scale);

    const range = 15 * scale;

    const npcSnapshot = [...game.npcs];
    for (const npc of npcSnapshot) {
        if (!npc.position || npc.userData.dead) continue;
        if (npc.position.distanceTo(position) < range) {
            const push = npc.position.clone().sub(position).setY(0);
            if (push.lengthSq() > 0.001) npc.position.addScaledVector(push.normalize(), 2);
            damageNPC(npc, 200);
        }
    }

    for (let i = game.pickups.length - 1; i >= 0; i--) {
        const pickup = game.pickups[i];
        if (!pickup.mesh || !pickup.mesh.position) continue;
        if (pickup.mesh.position.distanceTo(position) < range) {
            game.scene.remove(pickup.mesh);
            game.pickups.splice(i, 1);
        }
    }

    const carSnapshot = [...game.cars];
    for (const car of carSnapshot) {
        if (!car.position || car.userData.dead) continue;
        if (car.position.distanceTo(position) < range) {
            const push = car.position.clone().sub(position).setY(0);
            if (push.lengthSq() > 0.001) car.position.addScaledVector(push.normalize(), 2);
            car.userData.velocity = (car.userData.velocity || 0) + 10;
            damageCar(car, 90 * scale, depth);
        }
    }
}

export function createFire(position) {
    audio.play('explosion');
    effects.createFireVisual(position, 1.4);
}

export function updateCombat(dt) {
    for (let i = corpses.length - 1; i >= 0; i--) {
        const corpse = corpses[i];
        corpse.life -= dt;
        const npc = corpse.npc;

        if (corpse.life <= 0 || !npc.parent) {
            if (npc.parent) game.scene.remove(npc);
            corpses.splice(i, 1);
            continue;
        }

        npc.rotation.x = Math.min(Math.PI / 2, npc.rotation.x + dt * 3.2);
        npc.position.y -= dt * 0.6;
    }
}
