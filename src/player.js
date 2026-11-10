import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CONFIG, WEAPONS, IS_MOBILE } from './config.js';
import { game, pointInColliders, collidersNear } from './state.js';
import { audio } from './audio.js';
import { startMobileGame } from './mobile.js';
import * as ui from './ui.js';
import { takeDamage, arrestPlayer, damageNPC, damageCar, createExplosion, createFire } from './combat.js';
import { createImpact } from './effects.js';
import {
    getDarkMetalMaterial,
    getChromeMaterial,
    getGlassMaterial,
    glowMaterial,
    getGlowTexture,
    pbr
} from './textures.js';

const CENTER = new THREE.Vector2(0, 0);
const GUN_BASE = new THREE.Vector3(0.4, -0.4, -1.0);
const PROJECTILE_GEO = {
    sphere: new THREE.SphereGeometry(0.2, 10, 8),
    rocketBody: new THREE.CylinderGeometry(0.13, 0.13, 0.85, 10),
    rocketTip: new THREE.ConeGeometry(0.16, 0.32, 10)
};

let gunRoot = null;
let gunModels = [];
let muzzleLight = null;
let muzzleSprite = null;
let muzzleTimer = 0;
let gunRecoil = 0;
let gunBob = 0;
const tmpCameraPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpDir = new THREE.Vector3();

// ---------------------------------------------------------------------------
// First-person weapon rig
// ---------------------------------------------------------------------------

function addPart(group, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    group.add(mesh);
    return mesh;
}

function buildWeaponModel(weapon) {
    const group = new THREE.Group();
    const dark = pbr(0x4a5762, { roughness: 0.42, metalness: 0.78, envMapIntensity: 1.25 });
    const chrome = getChromeMaterial();
    const accent = glowMaterial(weapon.color, 0.65);

    if (weapon.model === 'rifle') {
        addPart(group, new THREE.BoxGeometry(0.11, 0.15, 0.8), dark, 0, 0.02, -0.26);
        addPart(group, new THREE.BoxGeometry(0.1, 0.1, 0.36), chrome, 0, 0.02, -0.76);
        addPart(group, new THREE.CylinderGeometry(0.026, 0.026, 0.42, 8), chrome, 0, 0.03, -1.05, Math.PI / 2);
        addPart(group, new THREE.BoxGeometry(0.09, 0.13, 0.32), dark, 0, 0, 0.24);
        addPart(group, new THREE.BoxGeometry(0.07, 0.22, 0.13), dark, 0, -0.15, -0.18, -0.24);
        addPart(group, new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), chrome, 0, 0.14, -0.34, Math.PI / 2);
        addPart(group, new THREE.CylinderGeometry(0.038, 0.038, 0.02, 10), accent, 0, 0.14, -0.5, Math.PI / 2);
        addPart(group, new THREE.BoxGeometry(0.025, 0.025, 0.46), accent, 0.062, 0.01, -0.3);
        group.userData.muzzle = new THREE.Vector3(0, 0.03, -1.28);
    } else if (weapon.model === 'rocket') {
        addPart(group, new THREE.CylinderGeometry(0.12, 0.12, 1.05, 12), dark, 0, 0.02, -0.3, Math.PI / 2);
        addPart(group, new THREE.ConeGeometry(0.15, 0.34, 12), pbr(0xff7a2b, { roughness: 0.4, metalness: 0.5 }), 0, 0.02, -0.98, -Math.PI / 2);
        addPart(group, new THREE.BoxGeometry(0.07, 0.2, 0.1), dark, 0, -0.16, -0.05, 0.2);
        addPart(group, new THREE.BoxGeometry(0.05, 0.1, 0.3), dark, 0.13, 0.05, -0.2);
        addPart(group, new THREE.BoxGeometry(0.03, 0.03, 0.6), accent, -0.13, 0.02, -0.3);
        addPart(group, new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12), accent, 0, 0.02, 0.24, Math.PI / 2);
        group.userData.muzzle = new THREE.Vector3(0, 0.02, -1.18);
    } else if (weapon.model === 'grenade') {
        addPart(group, new THREE.SphereGeometry(0.16, 12, 10), dark, 0, 0.02, -0.14);
        addPart(group, new THREE.TorusGeometry(0.17, 0.018, 6, 16), accent, 0, 0.02, -0.14, Math.PI / 2);
        addPart(group, new THREE.BoxGeometry(0.06, 0.1, 0.04), chrome, 0, 0.18, -0.14);
        addPart(group, new THREE.TorusGeometry(0.045, 0.01, 5, 10), chrome, 0.09, 0.19, -0.14, Math.PI / 2);
        group.userData.muzzle = new THREE.Vector3(0, 0.05, -0.3);
    } else if (weapon.model === 'molotov') {
        addPart(group, new THREE.CylinderGeometry(0.075, 0.095, 0.34, 10), getGlassMaterial(), 0, 0.02, -0.2);
        addPart(group, new THREE.CylinderGeometry(0.036, 0.05, 0.14, 8), getGlassMaterial(), 0, 0.25, -0.2);
        addPart(group, new THREE.ConeGeometry(0.055, 0.16, 7), pbr(0xb8c2c8, { roughness: 0.9, metalness: 0.05 }), 0, 0.38, -0.2);
        addPart(group, new THREE.BoxGeometry(0.14, 0.16, 0.1), pbr(0xc9a227, { roughness: 0.4, metalness: 0.6 }), 0, 0.02, -0.2);
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color: 0xff8a3a,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.9
        }));
        flame.scale.set(0.28, 0.36, 1);
        flame.position.set(0, 0.45, -0.2);
        group.add(flame);
        group.userData.flame = flame;
        group.userData.muzzle = new THREE.Vector3(0, 0.45, -0.2);
    } else {
        addPart(group, new THREE.BoxGeometry(0.1, 0.12, 0.44), dark, 0, 0.03, -0.16);
        addPart(group, new THREE.BoxGeometry(0.09, 0.08, 0.3), chrome, 0, -0.06, -0.1);
        addPart(group, new THREE.BoxGeometry(0.09, 0.22, 0.12), dark, 0, -0.19, 0.02, 0.26);
        addPart(group, new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), chrome, 0, 0.03, -0.42, Math.PI / 2);
        addPart(group, new THREE.BoxGeometry(0.02, 0.03, 0.03), accent, 0, 0.1, -0.05);
        addPart(group, new THREE.BoxGeometry(0.02, 0.02, 0.26), accent, 0.056, 0.03, -0.17);
        addPart(group, new THREE.BoxGeometry(0.055, 0.14, 0.08), chrome, 0, -0.12, -0.08);
        group.userData.muzzle = new THREE.Vector3(0, 0.03, -0.52);
    }

    return group;
}

function buildGunRig() {
    gunRoot = new THREE.Group();
    gunRoot.position.copy(GUN_BASE);
    gunRoot.scale.setScalar(0.88);
    gunRoot.rotation.y = -0.04;

    // Dedicated viewmodel key light so the weapon reads against the night city.
    const viewLight = new THREE.PointLight(0xd8f4ff, 1.1, 4, 2);
    viewLight.position.set(0.25, 0.45, 0.2);
    game.camera.add(viewLight);

    // A visible glove and forearm anchor the weapon in first person.
    const gloveMaterial = pbr(0x1b222b, { roughness: 0.85, metalness: 0.18 });
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, 0.2), gloveMaterial);
    glove.position.set(0.02, -0.27, 0.06);
    glove.rotation.x = 0.18;
    gunRoot.add(glove);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.062, 0.58, 8), gloveMaterial);
    forearm.position.set(0.08, -0.52, 0.28);
    forearm.rotation.x = -1.05;
    forearm.rotation.z = 0.12;
    gunRoot.add(forearm);

    const wristGlow = new THREE.Mesh(
        new THREE.TorusGeometry(0.078, 0.008, 5, 12),
        glowMaterial(CONFIG.neon.cyan, 1.4)
    );
    wristGlow.rotation.x = Math.PI / 2;
    wristGlow.position.set(0.055, -0.34, 0.12);
    gunRoot.add(wristGlow);

    // Shoulder-mounted flood light: makes concrete, NPCs and vehicles readable
    // without flattening the neon night ambience.
    const flashlight = new THREE.SpotLight(0xbfe6ff, 85, 180, 0.78, 0.55, 1.6);
    flashlight.position.set(0, 0.05, -2.5);
    game.camera.add(flashlight);
    flashlight.target.position.set(0, -2.5, -40);
    game.camera.add(flashlight.target);

    // Soft local fill so nearby entities never fall into pure black.
    const playerFill = new THREE.PointLight(0x5fa8ff, 26, 24, 2);
    playerFill.position.set(0, 0.2, 0);
    game.camera.add(playerFill);

    for (let index = 0; index < WEAPONS.length; index++) {
        const model = buildWeaponModel(WEAPONS[index]);
        model.visible = index === game.gameState.currentWeaponIdx;
        gunModels.push(model);
        gunRoot.add(model);
    }

    muzzleLight = new THREE.PointLight(0xa9fff0, 0, 9, 2);
    gunRoot.add(muzzleLight);

    muzzleSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xfff5cf,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0
    }));
    muzzleSprite.scale.set(0.55, 0.55, 1);
    gunRoot.add(muzzleSprite);

    game.camera.add(gunRoot);
    game.scene.add(game.camera);

    game.gunMesh = gunRoot;
    game.muzzleFlashLight = muzzleLight;
    updateMuzzleAnchor();
    updateGunVisibility();
}

function updateGunVisibility() {
    if (!gunRoot) return;
    const visible = game.gameState.mode === 'walking' && !game.isDead;
    gunRoot.visible = visible;
    for (let i = 0; i < gunModels.length; i++) {
        gunModels[i].visible = visible && i === game.gameState.currentWeaponIdx;
    }
}

function updateMuzzleAnchor() {
    const model = gunModels[game.gameState.currentWeaponIdx];
    if (!model || !muzzleLight || !muzzleSprite) return;
    const offset = model.userData.muzzle || new THREE.Vector3(0, 0, -0.6);
    muzzleLight.position.copy(offset);
    muzzleSprite.position.copy(offset);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export function switchWeapon(index) {
    if (!game.gameState.inventory[index]) {
        ui.showMessage('MODULE LOCKED // FIND A DROP');
        return;
    }

    game.gameState.currentWeaponIdx = index;
    game.isFiring = false;
    game.fireTimer = 0;
    gunModels.forEach((model, i) => { model.visible = i === index && game.gameState.mode === 'walking'; });
    updateMuzzleAnchor();
    ui.updateWeaponUI();
    audio.play('switch');
}

function onKeyDown(event) {
    if (event.code === 'KeyM') {
        toggleMap();
        return;
    }

    if (game.isDead) return;

    switch (event.code) {
        case 'KeyW': game.move.forward = true; break;
        case 'KeyS': game.move.backward = true; break;
        case 'KeyA': game.move.left = true; break;
        case 'KeyD': game.move.right = true; break;
        case 'Space':
            event.preventDefault();
            if (game.gameState.mode === 'walking' && game.canJump) {
                game.velocity.y += 25;
                game.canJump = false;
            } else if (game.gameState.mode === 'car' && game.gameState.currentVehicle) {
                game.gameState.currentVehicle.userData.velocity *= 0.9;
            }
            break;
        case 'KeyE': interact(); break;
        case 'Digit1': switchWeapon(0); break;
        case 'Digit2': switchWeapon(1); break;
        case 'Digit3': switchWeapon(2); break;
        case 'Digit4': switchWeapon(3); break;
        case 'Digit5': switchWeapon(4); break;
        default: break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': game.move.forward = false; break;
        case 'KeyS': game.move.backward = false; break;
        case 'KeyA': game.move.left = false; break;
        case 'KeyD': game.move.right = false; break;
        default: break;
    }
}

function onScroll(event) {
    if (game.isDead || game.isMapOpen) return;
    const direction = event.deltaY > 0 ? 1 : -1;
    let next = game.gameState.currentWeaponIdx;

    for (let i = 0; i < WEAPONS.length; i++) {
        next += direction;
        if (next > 4) next = 0;
        if (next < 0) next = 4;
        if (game.gameState.inventory[next]) {
            switchWeapon(next);
            break;
        }
    }
}

function onMouseDown(event) {
    if (event.button !== 0) return;
    if (!game.controls || !game.controls.isLocked) return;
    if (game.isDead || game.isMapOpen) return;
    game.isFiring = true;
}

function onMouseUp(event) {
    if (event.button === 0) game.isFiring = false;
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

function findAncestor(object, type) {
    let node = object;
    while (node && node !== game.scene) {
        if (node.userData && node.userData.type === type) return node;
        node = node.parent;
    }
    return null;
}

function triggerMuzzleFlash() {
    muzzleTimer = 0.06;
    gunRecoil = 1;

    if (muzzleLight) muzzleLight.intensity = 16;
    if (muzzleSprite) {
        muzzleSprite.material.opacity = 1;
        muzzleSprite.material.rotation = Math.random() * Math.PI;
        const scale = 0.45 + Math.random() * 0.25;
        muzzleSprite.scale.set(scale, scale, 1);
        muzzleSprite.visible = true;
    }
}

function spawnProjectile(weapon) {
    game.camera.getWorldPosition(tmpCameraPos);
    game.camera.getWorldQuaternion(tmpQuat);
    tmpDir.set(0, 0, -1).applyQuaternion(tmpQuat);

    const group = new THREE.Group();
    const accent = glowMaterial(weapon.color, 3);

    if (weapon.model === 'rocket') {
        const body = new THREE.Mesh(PROJECTILE_GEO.rocketBody, getDarkMetalMaterial());
        body.rotation.x = Math.PI / 2;
        group.add(body);
        const tip = new THREE.Mesh(PROJECTILE_GEO.rocketTip, pbr(0xff7a2b, { roughness: 0.4, metalness: 0.5 }));
        tip.rotation.x = -Math.PI / 2;
        tip.position.z = -0.55;
        group.add(tip);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color: weapon.color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.8
        }));
        glow.scale.set(1.6, 1.6, 1);
        glow.position.z = 0.6;
        group.add(glow);
    } else if (weapon.model === 'molotov') {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.45, 10), getGlassMaterial());
        bottle.rotation.x = Math.PI / 2;
        group.add(bottle);
        const flame = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color: 0xff7a2b,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.9
        }));
        flame.scale.set(0.6, 0.8, 1);
        flame.position.z = 0.35;
        group.add(flame);
    } else {
        const body = new THREE.Mesh(PROJECTILE_GEO.sphere, glowMaterial(weapon.color, 2.2));
        group.add(body);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 14), getChromeMaterial());
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
    }

    group.position.copy(tmpCameraPos).addScaledVector(tmpDir, 1.1);
    group.lookAt(tmpCameraPos.clone().addScaledVector(tmpDir, 4));
    game.scene.add(group);

    const speed = weapon.model === 'rocket' ? 52 : 24;
    const velocity = tmpDir.clone().multiplyScalar(speed);
    if (weapon.type === 'throw') velocity.y += 6;

    game.projectiles.push({
        mesh: group,
        velocity,
        type: weapon.type,
        weaponName: weapon.name,
        life: 5
    });
}

export function fireWeapon() {
    const index = game.gameState.currentWeaponIdx;
    const weapon = WEAPONS[index];
    if (!weapon) return;

    if (weapon.name !== 'Pistol' && game.gameState.ammo[index] <= 0) {
        ui.showMessage('NO AMMO // SCROUNGE A DROP');
        game.isFiring = false;
        return;
    }

    if (weapon.name !== 'Pistol') {
        game.gameState.ammo[index]--;
        ui.updateWeaponUI();
    }

    triggerMuzzleFlash();

    if (weapon.type === 'raycast') {
        audio.play('shoot');
        game.raycaster.setFromCamera(CENTER, game.camera);
        const hits = game.raycaster.intersectObjects(game.scene.children, true);

        for (const hit of hits) {
            if (hit.distance < 0.4) continue;
            if (hit.object.isPoints || hit.object.isSprite) continue;

            const npc = findAncestor(hit.object, 'npc');
            if (npc) {
                // The shot direction carries the body into the ragdoll.
                damageNPC(npc, weapon.damage, game.raycaster.ray.direction.clone().multiplyScalar(2.8));
                createImpact(hit.point, weapon.color);
                return;
            }

            const car = findAncestor(hit.object, 'car');
            if (car) {
                damageCar(car, Math.round(weapon.damage * 0.6));
                createImpact(hit.point, weapon.color);
                return;
            }

            createImpact(hit.point, weapon.color);
            break;
        }
    } else {
        audio.play('shoot');
        spawnProjectile(weapon);
    }
}

function updateProjectiles(dt) {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
        const projectile = game.projectiles[i];
        if (!projectile.mesh || !projectile.mesh.parent) {
            game.projectiles.splice(i, 1);
            continue;
        }

        projectile.life -= dt;
        projectile.mesh.position.addScaledVector(projectile.velocity, dt);
        if (projectile.type === 'throw') projectile.velocity.y -= 18 * dt;
        projectile.mesh.rotation.x += dt * 5;
        projectile.mesh.rotation.y += dt * 3;

        const grounded = projectile.mesh.position.y <= 0.18;
        const hitWall = pointInColliders(projectile.mesh.position, 4);

        if (grounded || hitWall || projectile.life <= 0) {
            const impact = projectile.mesh.position.clone();
            if (projectile.type === 'rocket' || projectile.type === 'throw') {
                createExplosion(impact, projectile.type === 'rocket' ? 2 : 1);
                if (projectile.weaponName === 'Molotov') createFire(impact);
            }
            game.scene.remove(projectile.mesh);
            game.projectiles.splice(i, 1);
        }
    }
}

// ---------------------------------------------------------------------------
// Vehicles / interaction / map
// ---------------------------------------------------------------------------

function interact() {
    if (game.gameState.mode === 'walking') {
        let closest = null;
        let closestDistance = 15;
        game.camera.getWorldPosition(tmpCameraPos);

        for (const car of game.cars) {
            if (!car.position || !car.parent || car.userData.dead) continue;
            const distance = tmpCameraPos.distanceTo(car.position);
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = car;
            }
        }

        if (closest) enterVehicle(closest);
        else ui.showMessage('NO LINK TARGETS IN RANGE');
    } else {
        exitVehicle();
    }
}

export function enterVehicle(vehicle) {
    if (!vehicle || !vehicle.parent || vehicle.userData.dead) return;
    if (game.gameState.currentVehicle) return;

    vehicle.userData.velocity = 0;
    if (vehicle.userData.ai) vehicle.userData.ai.active = false;

    game.gameState.currentVehicle = vehicle;
    game.gameState.mode = 'car';

    audio.stopCar();
    audio.startCar();

    game.controls.unlock();
    vehicle.add(game.camera);
    game.camera.position.set(0, 4.2, -6.8);
    game.camera.rotation.set(-0.06, Math.PI, 0);

    updateGunVisibility();
    ui.setCrosshairVisible(false);
    ui.showMessage('VEHICLE LINK ESTABLISHED');
    ui.updateHUD();

    if (!game.mobile.enabled) game.controls.lock();
}

export function exitVehicle() {
    const vehicle = game.gameState.currentVehicle;

    if (!vehicle || !vehicle.position) {
        game.gameState.mode = 'walking';
        game.gameState.currentVehicle = null;
        game.scene.add(game.camera);
        return;
    }

    audio.stopCar();
    vehicle.userData.velocity = 0;
    if (vehicle.userData.ai) vehicle.userData.ai.active = true;

    game.scene.add(game.camera);

    const exitPosition = new THREE.Vector3(3.2, 0, 0).applyMatrix4(vehicle.matrixWorld);
    exitPosition.y = 2;
    game.camera.position.copy(exitPosition);
    game.camera.rotation.set(0, 0, 0);

    game.gameState.mode = 'walking';
    game.gameState.currentVehicle = null;

    updateGunVisibility();
    ui.setCrosshairVisible(true);
    ui.showMessage('LINK TERMINATED // ON FOOT');
    ui.updateHUD();
}

export function toggleMap() {
    if (game.isDead) return;

    game.isMapOpen = !game.isMapOpen;
    ui.setMapOpen(game.isMapOpen);

    if (game.isMapOpen) {
        game.controls.unlock();
        ui.drawFullMap();
    } else if (!game.mobile.active) {
        game.controls.lock();
    }
}

function onFullMapClick(event) {
    if (!game.isMapOpen) return;

    const canvas = ui.dom.fullMapCanvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const scale = (minDim - 100) / CONFIG.citySize;

    const worldX = (canvasX - canvas.width / 2) / scale;
    const worldZ = (canvasY - canvas.height / 2) / scale;

    if (game.gameState.currentVehicle) exitVehicle();

    game.camera.position.set(worldX, 2, worldZ);
    game.velocity.set(0, 0, 0);

    ui.showMessage(`FAST TRAVEL // ${worldX.toFixed(0)} : ${worldZ.toFixed(0)}`);
    toggleMap();
}

// ---------------------------------------------------------------------------
// Damage / respawn (registered as services for other modules)
// ---------------------------------------------------------------------------

export function respawn() {
    if (game.gameState.currentVehicle) {
        exitVehicle();
    }

    game.isDead = false;
    game.isFiring = false;
    game.playerHealth = CONFIG.maxHealth;
    game.gameState.mode = 'walking';
    game.velocity.set(0, 0, 0);
    game.canJump = false;

    game.scene.add(game.camera);
    game.camera.position.set(0, 2, 0);
    game.camera.rotation.set(0, 0, 0);

    ui.hideWasted();
    ui.setHealth(CONFIG.maxHealth);
    ui.updateHUD();
    updateGunVisibility();

    if (game.mobile.active) {
        if (ui.dom.blocker) ui.dom.blocker.style.display = 'none';
        ui.setCrosshairVisible(true);
    } else if (game.controls) {
        game.controls.lock();
    }
}

// ---------------------------------------------------------------------------
// Frame update
// ---------------------------------------------------------------------------

function updateWalking(dt) {
    game.velocity.x -= game.velocity.x * 10.0 * dt;
    game.velocity.z -= game.velocity.z * 10.0 * dt;
    game.velocity.y -= 9.8 * 60.0 * dt;

    game.direction.z = Number(game.move.forward) - Number(game.move.backward);
    game.direction.x = Number(game.move.right) - Number(game.move.left);
    game.direction.normalize();

    if (game.move.forward || game.move.backward) game.velocity.z -= game.direction.z * 520.0 * dt;
    if (game.move.left || game.move.right) game.velocity.x -= game.direction.x * 520.0 * dt;

    game.controls.moveRight(-game.velocity.x * dt);
    game.controls.moveForward(-game.velocity.z * dt);
    game.camera.position.y += game.velocity.y * dt;

    if (game.camera.position.y < 2) {
        game.velocity.y = 0;
        game.camera.position.y = 2;
        game.canJump = true;
    }

    const radius = 0.85;
    for (const box of collidersNear(game.camera.position.x, game.camera.position.z, 8)) {
        if (!box.min || !box.max) continue;
        if (game.camera.position.x > box.min.x - radius && game.camera.position.x < box.max.x + radius &&
            game.camera.position.z > box.min.z - radius && game.camera.position.z < box.max.z + radius) {
            const cx = (box.min.x + box.max.x) / 2;
            const cz = (box.min.z + box.max.z) / 2;
            if (Math.abs(game.camera.position.x - cx) > Math.abs(game.camera.position.z - cz)) {
                game.camera.position.x = game.camera.position.x > cx ? box.max.x + radius : box.min.x - radius;
            } else {
                game.camera.position.z = game.camera.position.z > cz ? box.max.z + radius : box.min.z - radius;
            }
        }
    }
}

function updateDriving(dt) {
    const car = game.gameState.currentVehicle;
    if (!car || !car.parent) {
        game.gameState.currentVehicle = null;
        game.gameState.mode = 'walking';
        game.scene.add(game.camera);
        return;
    }

    if (game.move.forward) car.userData.velocity += 64 * dt;
    if (game.move.backward) car.userData.velocity -= 64 * dt;
    car.userData.velocity -= car.userData.velocity * 1.9 * dt;

    audio.updateCar(car.userData.velocity);

    if (Math.abs(car.userData.velocity) > 0.1) {
        const rotate = 1.8 * dt * Math.sign(car.userData.velocity);
        if (game.move.left) car.rotation.y += rotate;
        if (game.move.right) car.rotation.y -= rotate;
    }

    car.translateZ(car.userData.velocity * dt);

    const radius = 2.4;
    for (const box of collidersNear(car.position.x, car.position.z, 12)) {
        if (!box.min || !box.max) continue;
        if (car.position.x > box.min.x - radius && car.position.x < box.max.x + radius &&
            car.position.z > box.min.z - radius && car.position.z < box.max.z + radius) {
            car.userData.velocity *= -0.5;
            damageCar(car, 5);

            const cx = (box.min.x + box.max.x) / 2;
            const cz = (box.min.z + box.max.z) / 2;
            if (Math.abs(car.position.x - cx) > Math.abs(car.position.z - cz)) {
                car.position.x = car.position.x > cx ? box.max.x + radius : box.min.x - radius;
            } else {
                car.position.z = car.position.z > cz ? box.max.z + radius : box.min.z - radius;
            }
        }
    }

    if (Math.abs(car.userData.velocity) > 8) {
        for (const npc of [...game.npcs]) {
            if (!npc.userData.dead && npc.position && npc.position.distanceTo(car.position) < 4.5) {
                const carDir = new THREE.Vector3();
                car.getWorldDirection(carDir);
                damageNPC(npc, 100, carDir.multiplyScalar(7));
            }
        }
    }
}

function updateGun(dt) {
    if (!gunRoot) return;

    const moving = game.gameState.mode === 'walking' &&
        game.controls && (game.controls.isLocked || game.mobile.active) &&
        Math.hypot(game.velocity.x, game.velocity.z) > 8;

    gunBob += dt * (moving ? 10 : 3);
    const bobX = moving ? Math.sin(gunBob) * 0.012 : 0;
    const bobY = moving ? Math.abs(Math.cos(gunBob)) * 0.009 : Math.sin(gunBob * 0.6) * 0.003;

    gunRecoil = Math.max(0, gunRecoil - dt * 6);
    gunRoot.position.set(
        GUN_BASE.x + bobX,
        GUN_BASE.y + bobY,
        GUN_BASE.z + gunRecoil * 0.13
    );
    gunRoot.rotation.x = gunRecoil * 0.16;
    gunRoot.rotation.z = moving ? Math.sin(gunBob * 0.5) * 0.01 : 0;

    if (muzzleTimer > 0) {
        muzzleTimer -= dt;
        if (muzzleTimer <= 0 && muzzleSprite) {
            muzzleSprite.visible = false;
            muzzleSprite.material.opacity = 0;
        }
    }
    if (muzzleLight) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 420);

    const current = gunModels[game.gameState.currentWeaponIdx];
    if (current && current.userData.flame) {
        const flame = current.userData.flame;
        const flicker = 0.85 + Math.sin(game.elapsed * 22) * 0.15;
        flame.scale.set(0.24 * flicker, 0.34 * flicker, 1);
        flame.material.opacity = 0.7 + Math.max(0, Math.sin(game.elapsed * 17)) * 0.3;
    }
}

export function updatePlayer(dt) {
    if (!game.controls) return;

    updateProjectiles(dt);
    updateGun(dt);

    if (game.isDead || game.isMapOpen) {
        ui.setCrosshairVisible(false);
        return;
    }

    const active = game.controls.isLocked || game.mobile.active;
    ui.setCrosshairVisible(active && game.gameState.mode === 'walking');

    if (active) {
        if (game.gameState.mode === 'walking') updateWalking(dt);
        else if (game.gameState.mode === 'car') updateDriving(dt);

        const weapon = WEAPONS[game.gameState.currentWeaponIdx];
        if (game.isFiring && game.gameState.mode === 'walking') {
            game.fireTimer -= dt;
            if (game.fireTimer <= 0) {
                fireWeapon();
                game.fireTimer = weapon.fireRate;
                if (!weapon.auto) game.isFiring = false;
            }
        } else {
            game.fireTimer = 0;
        }
    }

    updateGunVisibility();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export function initPlayer() {
    const camera = game.camera;

    buildGunRig();

    game.mobile.enabled = IS_MOBILE;
    game.controls = new PointerLockControls(camera, document.body);
    camera.position.set(0, 2, 0);

    const blocker = ui.dom.blocker;
    const instructions = ui.dom.instructions;

    if (blocker) {
        blocker.addEventListener('click', () => {
            audio.resume();
            if (game.mobile.enabled) startMobileGame();
            else game.controls.lock();
        });
    }

    game.controls.addEventListener('lock', () => {
        if (blocker) blocker.style.display = 'none';
        if (instructions) instructions.style.display = 'none';
    });

    game.controls.addEventListener('unlock', () => {
        if (!game.isMapOpen && !game.isDead && !game.mobile.active) {
            if (blocker) blocker.style.display = 'flex';
            if (instructions) instructions.style.display = 'block';
            game.move.forward = false;
            game.move.backward = false;
            game.move.left = false;
            game.move.right = false;
            game.isFiring = false;
            audio.stopCar();
        }
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('wheel', onScroll, { passive: true });
    document.addEventListener('contextmenu', event => event.preventDefault());

    if (ui.dom.fullMapCanvas) {
        ui.dom.fullMapCanvas.addEventListener('click', onFullMapClick);
    }

    game.hooks.exitVehicle = exitVehicle;
    game.hooks.respawn = respawn;
    game.hooks.takeDamage = takeDamage;
    game.hooks.arrest = arrestPlayer;
    game.hooks.toggleMap = toggleMap;

    ui.setHealth(CONFIG.maxHealth);
    ui.updateWeaponUI();
    ui.updateHUD();
}
