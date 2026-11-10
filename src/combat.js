import * as THREE from 'three';
import { CONFIG, JAIL_POS, QUALITY } from './config.js';
import { game } from './state.js';
import { audio } from './audio.js';
import * as ui from './ui.js';
import * as effects from './effects.js';

const MAX_RAGDOLL_PIECES = QUALITY.isMobile ? 70 : 120;
const ragdollPieces = [];
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

function detachRagdollPiece(mesh, impulse) {
    game.scene.attach(mesh);

    // Ground contact offset, taken from the piece in its death pose.
    const bounds = new THREE.Box3().setFromObject(mesh);
    const groundOffset = bounds.min.y - mesh.position.y;

    const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3.2,
        1.2 + Math.random() * 3.0,
        (Math.random() - 0.5) * 3.2
    );
    if (impulse) velocity.add(impulse);

    ragdollPieces.push({
        mesh,
        velocity,
        angular: new THREE.Vector3(
            (Math.random() - 0.5) * 9,
            (Math.random() - 0.5) * 9,
            (Math.random() - 0.5) * 9
        ),
        groundOffset,
        life: 4.6 + Math.random() * 1.6,
        maxLife: 6.2
    });

    while (ragdollPieces.length > MAX_RAGDOLL_PIECES) {
        const oldest = ragdollPieces.shift();
        if (oldest.mesh.parent) oldest.mesh.parent.remove(oldest.mesh);
    }
}

function spawnRagdoll(npc, impulse = null) {
    if (!npc) return;

    npc.updateMatrixWorld(true);
    const pieces = [];
    for (const child of [...npc.children]) {
        if (child.isLight) {
            npc.remove(child);
            continue;
        }
        if (child.isMesh || child.isGroup) pieces.push(child);
    }

    for (const piece of pieces) detachRagdollPiece(piece, impulse);
    if (npc.parent) npc.parent.remove(npc);
}

// Explosions throw bodies that are already on the floor.
function shoveRagdolls(position, scale) {
    const range = 15 * scale;
    for (const piece of ragdollPieces) {
        const distance = piece.mesh.position.distanceTo(position);
        if (distance > range || distance < 0.001) continue;

        const direction = piece.mesh.position.clone().sub(position).setY(0.25).normalize();
        const force = (1 - distance / range) * 13 * scale;
        piece.velocity.addScaledVector(direction, force);
        piece.angular.x += (Math.random() - 0.5) * 8;
        piece.angular.z += (Math.random() - 0.5) * 8;
    }
}

function updateRagdolls(dt) {
    for (let i = ragdollPieces.length - 1; i >= 0; i--) {
        const piece = ragdollPieces[i];
        piece.life -= dt;

        if (piece.life <= 0) {
            if (piece.mesh.parent) piece.mesh.parent.remove(piece.mesh);
            ragdollPieces.splice(i, 1);
            continue;
        }

        const mesh = piece.mesh;
        piece.velocity.y -= 24 * dt;
        piece.velocity.multiplyScalar(Math.max(0, 1 - 0.9 * dt));
        mesh.position.addScaledVector(piece.velocity, dt);

        mesh.rotation.x += piece.angular.x * dt;
        mesh.rotation.y += piece.angular.y * dt;
        mesh.rotation.z += piece.angular.z * dt;

        if (mesh.position.y + piece.groundOffset <= 0.04) {
            mesh.position.y = 0.04 - piece.groundOffset;

            if (piece.velocity.y < 0) {
                if (piece.velocity.y < -3) {
                    piece.velocity.y *= -0.34;
                    piece.velocity.x *= 0.72;
                    piece.velocity.z *= 0.72;
                    piece.angular.multiplyScalar(0.62);
                } else {
                    piece.velocity.y = 0;
                }
            }

            const friction = Math.max(0, 1 - 7 * dt);
            piece.velocity.x *= friction;
            piece.velocity.z *= friction;
            piece.angular.x *= friction;
            piece.angular.z *= friction;
        }

        // Sink into the wet street once the body has been down long enough.
        if (piece.life < 1.2) {
            mesh.position.y -= dt * 0.45;
            piece.angular.multiplyScalar(Math.max(0, 1 - 2 * dt));
        }
    }
}

export function damageNPC(npc, damage, impulse = null) {
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
        spawnRagdoll(npc, impulse ? impulse.clone() : null);
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
    shoveRagdolls(position, scale);

    const range = 15 * scale;

    const npcSnapshot = [...game.npcs];
    for (const npc of npcSnapshot) {
        if (!npc.position || npc.userData.dead) continue;
        if (npc.position.distanceTo(position) < range) {
            const push = npc.position.clone().sub(position).setY(0.55);
            if (push.lengthSq() > 0.001) push.normalize();
            damageNPC(npc, 240, push.multiplyScalar(9 * scale));
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
    updateRagdolls(dt);
}
