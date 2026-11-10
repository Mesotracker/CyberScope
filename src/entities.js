import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { game, pointInColliders, collidersNear } from './state.js';
import {
    pbr,
    glowMaterial,
    carPaint,
    getGlassMaterial,
    getRubberMaterial,
    getDarkMetalMaterial,
    getChromeMaterial,
    getGlowTexture
} from './textures.js';
import { audio } from './audio.js';
import * as ui from './ui.js';
import { damageNPC, damageCar } from './combat.js';

const NPC_GEO = {};
const CAR_GEO = {};

function mergeAt(items) {
    const geometries = [];
    for (const item of items) {
        const geo = item.geo;
        if (item.rx) geo.rotateX(item.rx);
        if (item.ry) geo.rotateY(item.ry);
        if (item.rz) geo.rotateZ(item.rz);
        geo.translate(item.x || 0, item.y || 0, item.z || 0);
        geometries.push(geo);
    }
    const merged = mergeGeometries(geometries, false);
    for (const geo of geometries) geo.dispose();
    return merged;
}

// ---------------------------------------------------------------------------
// NPC models
// ---------------------------------------------------------------------------

function getNpcGeometry() {
    if (NPC_GEO.body) return NPC_GEO;

    NPC_GEO.body = mergeAt([
        { geo: new THREE.BoxGeometry(0.6, 0.72, 0.34), y: 1.36 },
        { geo: new THREE.BoxGeometry(0.68, 0.3, 0.09), y: 1.43, z: 0.2 },
        { geo: new THREE.BoxGeometry(0.64, 0.12, 0.36), y: 1.0 },
        { geo: new THREE.BoxGeometry(0.2, 0.16, 0.32), x: -0.4, y: 1.63 },
        { geo: new THREE.BoxGeometry(0.2, 0.16, 0.32), x: 0.4, y: 1.63 },
        { geo: new THREE.BoxGeometry(0.38, 0.46, 0.2), y: 1.4, z: -0.26 },
        { geo: new THREE.SphereGeometry(0.2, 12, 10), y: 1.89 },
        { geo: new THREE.SphereGeometry(0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), y: 1.92 },
        { geo: new THREE.CylinderGeometry(0.018, 0.018, 0.55, 4), x: 0.15, y: 2.06, z: -0.3 }
    ]);

    NPC_GEO.trim = mergeAt([
        { geo: new THREE.BoxGeometry(0.46, 0.032, 0.03), y: 1.53, z: 0.215 },
        { geo: new THREE.BoxGeometry(0.34, 0.03, 0.03), y: 1.29, z: 0.185 },
        { geo: new THREE.BoxGeometry(0.04, 0.34, 0.03), x: -0.3, y: 1.42, z: 0.2 },
        { geo: new THREE.BoxGeometry(0.04, 0.34, 0.03), x: 0.3, y: 1.42, z: 0.2 },
        { geo: new THREE.BoxGeometry(0.2, 0.04, 0.3), x: -0.4, y: 1.66 },
        { geo: new THREE.BoxGeometry(0.2, 0.04, 0.3), x: 0.4, y: 1.66 },
        { geo: new THREE.BoxGeometry(0.32, 0.03, 0.03), y: 1.4, z: -0.37 },
        // Visor and antenna tip share the trim material, so fold them in and
        // save two draw calls per pedestrian.
        { geo: new THREE.BoxGeometry(0.36, 0.1, 0.07), y: 1.88, z: 0.2 },
        { geo: new THREE.SphereGeometry(0.055, 6, 4), x: 0.15, y: 2.34, z: -0.3 }
    ]);

    NPC_GEO.arm = mergeAt([
        { geo: new THREE.BoxGeometry(0.15, 0.42, 0.16), y: -0.2 },
        { geo: new THREE.BoxGeometry(0.13, 0.36, 0.14), y: -0.56, z: 0.02 },
        { geo: new THREE.BoxGeometry(0.16, 0.12, 0.18), y: -0.78, z: 0.03 },
        { geo: new THREE.BoxGeometry(0.17, 0.05, 0.19), y: -0.66, z: 0.02 }
    ]);

    NPC_GEO.leg = mergeAt([
        { geo: new THREE.BoxGeometry(0.19, 0.42, 0.22), y: -0.21 },
        { geo: new THREE.BoxGeometry(0.16, 0.4, 0.18), y: -0.6 },
        { geo: new THREE.BoxGeometry(0.22, 0.13, 0.32), y: -0.85, z: 0.05 }
    ]);

    NPC_GEO.rifle = mergeAt([
        { geo: new THREE.BoxGeometry(0.08, 0.12, 0.62), z: 0.08 },
        { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), rx: Math.PI / 2, z: 0.52 },
        { geo: new THREE.BoxGeometry(0.06, 0.18, 0.12), y: -0.12, z: 0.02, rx: 0.15 },
        { geo: new THREE.BoxGeometry(0.05, 0.05, 0.18), y: 0.09, z: -0.1 },
        { geo: new THREE.BoxGeometry(0.06, 0.24, 0.1), y: -0.08, z: -0.22 }
    ]);

    NPC_GEO.pistol = mergeAt([
        { geo: new THREE.BoxGeometry(0.08, 0.13, 0.3), z: 0.06 },
        { geo: new THREE.BoxGeometry(0.07, 0.22, 0.12), y: -0.14, z: -0.02, rx: 0.18 },
        { geo: new THREE.CylinderGeometry(0.022, 0.022, 0.16, 6), rx: Math.PI / 2, z: 0.24 }
    ]);

    return NPC_GEO;
}

function createNPC(isCop, isGang) {
    const geo = getNpcGeometry();
    const accent = isCop ? CONFIG.neon.magenta : isGang ? CONFIG.neon.red : CONFIG.neon.green;
    const outfitColor = isCop ? 0x2b3b57 : isGang ? 0x471a24 : 0x21403f;

    const outfit = pbr(outfitColor, { roughness: 0.58, metalness: 0.36, envMapIntensity: 0.9 });
    const trim = glowMaterial(accent, 3.0);

    const group = new THREE.Group();

    const body = new THREE.Mesh(geo.body, outfit);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const trimMesh = new THREE.Mesh(geo.trim, trim);
    group.add(trimMesh);

    const armL = new THREE.Group();
    armL.position.set(-0.42, 1.63, 0);
    const armLMesh = new THREE.Mesh(geo.arm, outfit);
    armLMesh.castShadow = true;
    armL.add(armLMesh);
    group.add(armL);

    const armR = new THREE.Group();
    armR.position.set(0.42, 1.63, 0);
    const armRMesh = new THREE.Mesh(geo.arm, outfit);
    armRMesh.castShadow = true;
    armR.add(armRMesh);
    group.add(armR);

    const legL = new THREE.Group();
    legL.position.set(-0.17, 1.0, 0);
    const legLMesh = new THREE.Mesh(geo.leg, outfit);
    legLMesh.castShadow = true;
    legL.add(legLMesh);
    group.add(legL);

    const legR = new THREE.Group();
    legR.position.set(0.17, 1.0, 0);
    const legRMesh = new THREE.Mesh(geo.leg, outfit);
    legRMesh.castShadow = true;
    legR.add(legRMesh);
    group.add(legR);

    if (isCop || isGang) {
        const weapon = new THREE.Mesh(isCop ? geo.rifle : geo.pistol, getDarkMetalMaterial());
        weapon.castShadow = true;
        weapon.position.set(0.31, isCop ? 1.28 : 1.14, isCop ? 0.3 : 0.25);
        weapon.rotation.x = isCop ? 0 : 0.12;
        group.add(weapon);
        group.userData.weapon = weapon;
    }

    group.userData.parts = { armL, armR, legL, legR };
    return group;
}

// ---------------------------------------------------------------------------
// Vehicle models
// ---------------------------------------------------------------------------

function getCarGeometry() {
    if (CAR_GEO.body) return CAR_GEO;

    const profile = new THREE.Shape();
    profile.moveTo(-3.4, 0.55);
    profile.lineTo(3.1, 0.55);
    profile.lineTo(3.55, 0.82);
    profile.lineTo(3.3, 1.06);
    profile.lineTo(2.1, 1.16);
    profile.lineTo(1.55, 1.62);
    profile.lineTo(-1.5, 1.62);
    profile.lineTo(-2.25, 1.16);
    profile.lineTo(-3.35, 1.08);
    profile.lineTo(-3.55, 0.8);
    profile.closePath();

    CAR_GEO.body = new THREE.ExtrudeGeometry(profile, {
        depth: 3.0,
        bevelEnabled: true,
        bevelSize: 0.09,
        bevelThickness: 0.06,
        bevelSegments: 2
    });
    CAR_GEO.body.translate(0, 0, -1.5);
    CAR_GEO.body.rotateY(Math.PI / 2);

    CAR_GEO.glass = new THREE.BoxGeometry(2.55, 0.62, 2.6);
    CAR_GEO.roof = new THREE.BoxGeometry(2.35, 0.12, 2.1);

    const wheelItems = [];
    const rimItems = [];
    for (const x of [-1.42, 1.42]) {
        for (const z of [-2.1, 2.1]) {
            wheelItems.push({ geo: new THREE.CylinderGeometry(0.55, 0.55, 0.4, 16), rz: Math.PI / 2, x, y: 0.55, z });
            rimItems.push({ geo: new THREE.CylinderGeometry(0.24, 0.24, 0.42, 12), rz: Math.PI / 2, x, y: 0.55, z });
        }
    }
    CAR_GEO.wheels = mergeAt(wheelItems);
    CAR_GEO.rims = mergeAt(rimItems);

    CAR_GEO.sideStrips = mergeAt([
        { geo: new THREE.BoxGeometry(0.05, 0.055, 5.1), x: -1.56, y: 0.86 },
        { geo: new THREE.BoxGeometry(0.05, 0.055, 5.1), x: 1.56, y: 0.86 }
    ]);

    CAR_GEO.headlights = mergeAt([
        { geo: new THREE.BoxGeometry(0.72, 0.18, 0.08), x: -1.0, y: 0.95, z: 3.52 },
        { geo: new THREE.BoxGeometry(0.72, 0.18, 0.08), x: 1.0, y: 0.95, z: 3.52 },
        { geo: new THREE.BoxGeometry(2.1, 0.05, 0.06), x: 0, y: 0.83, z: 3.54 }
    ]);

    CAR_GEO.taillights = mergeAt([
        { geo: new THREE.BoxGeometry(0.85, 0.16, 0.08), x: -1.0, y: 1.02, z: -3.55 },
        { geo: new THREE.BoxGeometry(0.85, 0.16, 0.08), x: 1.0, y: 1.02, z: -3.55 },
        { geo: new THREE.BoxGeometry(1.6, 0.04, 0.06), x: 0, y: 0.92, z: -3.57 }
    ]);

    CAR_GEO.underglow = new THREE.PlaneGeometry(2.7, 6.6);
    CAR_GEO.underglow.rotateX(-Math.PI / 2);

    CAR_GEO.splitter = new THREE.BoxGeometry(2.9, 0.12, 0.6);
    CAR_GEO.splitter.translate(0, 0.42, 3.2);

    CAR_GEO.spoiler = mergeAt([
        { geo: new THREE.BoxGeometry(2.5, 0.1, 0.5), y: 1.68, z: -3.1 },
        { geo: new THREE.BoxGeometry(0.12, 0.35, 0.12), x: -0.9, y: 1.48, z: -3.15 },
        { geo: new THREE.BoxGeometry(0.12, 0.35, 0.12), x: 0.9, y: 1.48, z: -3.15 }
    ]);

    return CAR_GEO;
}

function createVehicle(color) {
    const geo = getCarGeometry();
    const group = new THREE.Group();

    const body = new THREE.Mesh(geo.body, carPaint(color));
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const glass = new THREE.Mesh(geo.glass, getGlassMaterial());
    glass.position.set(0, 1.5, -0.15);
    group.add(glass);

    const roof = new THREE.Mesh(geo.roof, carPaint(color));
    roof.position.set(0, 1.83, -0.25);
    roof.castShadow = true;
    group.add(roof);

    const wheels = new THREE.Mesh(geo.wheels, getRubberMaterial());
    wheels.castShadow = true;
    group.add(wheels);

    const rims = new THREE.Mesh(geo.rims, glowMaterial(color, 1.8));
    group.add(rims);

    const sideStrips = new THREE.Mesh(geo.sideStrips, glowMaterial(color, 2.0));
    group.add(sideStrips);

    const headlights = new THREE.Mesh(geo.headlights, glowMaterial(0xfff0c4, 4.2));
    group.add(headlights);

    const taillights = new THREE.Mesh(geo.taillights, glowMaterial(0xff2b3a, 3.6));
    group.add(taillights);

    const splitter = new THREE.Mesh(geo.splitter, getDarkMetalMaterial());
    splitter.castShadow = true;
    group.add(splitter);

    const spoiler = new THREE.Mesh(geo.spoiler, getDarkMetalMaterial());
    spoiler.castShadow = true;
    group.add(spoiler);

    const underglow = new THREE.Mesh(
        geo.underglow,
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.58,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        })
    );
    underglow.position.y = 0.05;
    group.add(underglow);

    return group;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

function findSpawnPoint(spread = 0.82) {
    for (let attempt = 0; attempt < 30; attempt++) {
        const x = (Math.random() - 0.5) * CONFIG.citySize * spread;
        const z = (Math.random() - 0.5) * CONFIG.citySize * spread;
        const probe = new THREE.Vector3(x, 1, z);
        if (pointInColliders(probe, 8)) continue;
        if (Math.hypot(x, z) < 35) continue;
        return { x, z };
    }
    return { x: 80, z: 80 };
}

export function spawnSingleNPC(isCop = false, spawnPosition = null, forceGang = null) {
    const isGang = forceGang === null ? (!isCop && Math.random() < 0.3) : forceGang;
    const npc = createNPC(isCop, isGang);
    const { x, z } = spawnPosition || findSpawnPoint(0.86);

    npc.position.set(x, 0.14, z);
    npc.rotation.y = Math.random() * Math.PI * 2;

    npc.userData = {
        ...npc.userData,
        type: 'npc',
        health: 100,
        maxHealth: 100,
        dead: false,
        isCop,
        isGang,
        dir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
        speed: isCop ? (3 + Math.random() * 4) * CONFIG.copSpeedMultiplier : 3 + Math.random() * 4,
        timer: 0,
        attackTimer: 0,
        phase: Math.random() * Math.PI * 2,
        aiming: false,
        healthBar: ui.createHealthBar()
    };

    game.scene.add(npc);
    game.npcs.push(npc);
}

export function spawnNPCs() {
    for (let i = 0; i < CONFIG.npcCount; i++) spawnSingleNPC(false);
    for (let i = 0; i < CONFIG.copCount; i++) spawnSingleNPC(true);

    // Stage civilians around the spawn plaza so the street feels busy the
    // moment the player arrives, not only somewhere out in the sprawl.
    const plazaCrowd = [
        [-5, -8], [8, -12], [-19, -22], [20, -25],
        [-24, 15], [26, 21], [-35, -3], [36, 9], [4, 35], [-7, -37]
    ];
    for (const [x, z] of plazaCrowd) spawnSingleNPC(false, { x, z }, false);

    ui.updateHUD();
}

export function spawnCars() {
    for (let i = 0; i < CONFIG.carCount; i++) {
        const color = CONFIG.neonColors[Math.floor(Math.random() * CONFIG.neonColors.length)];
        const car = createVehicle(color);

        let placed = false;
        let x = 0;
        let z = 0;
        let rotationY = 0;

        for (let attempt = 0; attempt < 24 && !placed; attempt++) {
            const horizontal = Math.random() < 0.5;
            const boundary = (Math.floor(Math.random() * 19) - 9) * CONFIG.blockSize;
            const lane = (Math.random() < 0.5 ? -1 : 1) * 9;
            const along = (Math.random() - 0.5) * 1600;

            if (horizontal) {
                x = boundary + lane;
                z = along;
                rotationY = Math.random() < 0.5 ? 0 : Math.PI;
            } else {
                x = along;
                z = boundary + lane;
                rotationY = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
            }

            if (!pointInColliders(new THREE.Vector3(x, 1, z), 6)) placed = true;
        }

        // Park the first car in the plaza as an immediately visible showcase.
        if (i === 0) {
            x = 11;
            z = -16;
            rotationY = Math.PI / 2;
        }

        car.position.set(x, 0.02, z);
        car.rotation.y = rotationY;

        car.userData = {
            ...car.userData,
            type: 'car',
            health: 100,
            maxHealth: 100,
            dead: false,
            velocity: 0,
            ai: {
                active: Math.random() > 0.25,
                speed: 15 + Math.random() * 16,
                turnTimer: 0,
                state: 'forward'
            },
            healthBar: ui.createHealthBar()
        };

        if (i === 0) car.userData.ai.active = false;

        game.scene.add(car);
        game.cars.push(car);
    }
}

function createWeaponCrate(weaponId) {
    const group = new THREE.Group();
    const weapon = CONFIG.neonColors[weaponId % CONFIG.neonColors.length];
    const accent = weapon;

    const shellGeo = mergeAt([
        { geo: new THREE.BoxGeometry(1.2, 0.85, 1.2), y: 0.1 },
        { geo: new THREE.BoxGeometry(1.34, 0.12, 1.34), y: 0.56 },
        { geo: new THREE.BoxGeometry(1.34, 0.12, 1.34), y: -0.3 }
    ]);
    const shell = new THREE.Mesh(shellGeo, getDarkMetalMaterial());
    shell.castShadow = true;
    group.add(shell);

    const trimGeo = mergeAt([
        { geo: new THREE.BoxGeometry(1.28, 0.045, 0.09), y: 0.2, z: 0.62 },
        { geo: new THREE.BoxGeometry(1.28, 0.045, 0.09), y: 0.2, z: -0.62 },
        { geo: new THREE.BoxGeometry(0.09, 0.045, 1.2), x: 0.62, y: 0.2 },
        { geo: new THREE.BoxGeometry(0.09, 0.045, 1.2), x: -0.62, y: 0.2 }
    ]);
    const trim = new THREE.Mesh(trimGeo, glowMaterial(accent, 2.8));
    group.add(trim);

    const icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), glowMaterial(accent, 3));
    icon.position.y = 1.15;
    group.add(icon);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: accent,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.55
    }));
    glow.scale.set(4.2, 4.2, 1);
    glow.position.y = 0.9;
    group.add(glow);

    group.userData.icon = icon;
    return group;
}

export function spawnPickups() {
    for (let i = 0; i < CONFIG.pickupCount; i++) {
        const weaponId = 1 + Math.floor(Math.random() * (CONFIG.neonColors.length - 1));
        const id = Math.min(weaponId, 4);

        const { x, z } = findSpawnPoint(0.8);
        const mesh = createWeaponCrate(id);
        mesh.position.set(x, 1.6, z);

        game.scene.add(mesh);
        game.pickups.push({ mesh, type: 'weapon', wId: id, phase: Math.random() * Math.PI * 2, baseY: 1.6 });
    }
}

export function spawnHearts() {
    for (let i = 0; i < CONFIG.heartCount; i++) {
        const group = new THREE.Group();

        const shell = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), pbr(0xd7e2e8, { roughness: 0.4, metalness: 0.55 }));
        shell.castShadow = true;
        group.add(shell);

        const cross = new THREE.Mesh(
            mergeAt([
                { geo: new THREE.BoxGeometry(0.7, 0.2, 0.1), z: 0.57 },
                { geo: new THREE.BoxGeometry(0.2, 0.7, 0.1), z: 0.57 },
                { geo: new THREE.BoxGeometry(0.7, 0.2, 0.1), z: -0.57 },
                { geo: new THREE.BoxGeometry(0.2, 0.7, 0.1), z: -0.57 }
            ]),
            glowMaterial(CONFIG.neon.red, 2.6)
        );
        group.add(cross);

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color: CONFIG.neon.red,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.4
        }));
        glow.scale.set(3.6, 3.6, 1);
        group.add(glow);

        const { x, z } = findSpawnPoint(0.8);
        group.position.set(x, 1.5, z);

        game.scene.add(group);
        game.pickups.push({ mesh: group, type: 'health', phase: Math.random() * Math.PI * 2, baseY: 1.5 });
    }
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export function updatePickups(dt, cameraWorldPos) {
    for (let i = game.pickups.length - 1; i >= 0; i--) {
        const pickup = game.pickups[i];
        if (!pickup || !pickup.mesh || !pickup.mesh.position) {
            game.pickups.splice(i, 1);
            continue;
        }

        const mesh = pickup.mesh;
        mesh.rotation.y += dt * 1.2;
        mesh.position.y = pickup.baseY + Math.sin(game.elapsed * 1.8 + pickup.phase) * 0.18;

        if (pickup.type === 'weapon') {
            const icon = mesh.userData.icon;
            if (icon) {
                icon.rotation.y += dt * 2.4;
                icon.rotation.x += dt * 0.8;
            }
        }

        if (!cameraWorldPos) continue;
        if (cameraWorldPos.distanceTo(mesh.position) > 2.3) continue;

        if (pickup.type === 'weapon') {
            const weaponId = pickup.wId;
            game.gameState.inventory[weaponId] = true;
            game.gameState.ammo[weaponId] += 15;
            audio.play('pickup');
            ui.updateWeaponUI();
            ui.showMessage(`ACQUIRED // ${['PISTOL', 'RIFLE', 'ROCKET', 'GRENADE', 'MOLOTOV'][weaponId]} MODULE`);
            game.scene.remove(mesh);
            game.pickups.splice(i, 1);
        } else if (pickup.type === 'health') {
            if (game.playerHealth >= CONFIG.maxHealth) continue;
            audio.play('heal');
            ui.setHealth(Math.min(CONFIG.maxHealth, game.playerHealth + 25));
            ui.showMessage('INTEGRITY PATCH APPLIED');
            game.scene.remove(mesh);
            game.pickups.splice(i, 1);
        }
    }
}

function isPlayerVehicle(car) {
    return game.gameState.currentVehicle === car && game.gameState.mode === 'car';
}

export function updateNPCs(dt, cameraWorldPos) {
    for (let i = game.npcs.length - 1; i >= 0; i--) {
        const npc = game.npcs[i];
        if (!npc.parent || npc.userData.dead || !npc.position) continue;

        const parts = npc.userData.parts;
        const userData = npc.userData;
        const distance = cameraWorldPos ? npc.position.distanceTo(cameraWorldPos) : Infinity;
        userData.aiming = false;

        if (userData.isCop && !game.isDead) {
            if (distance < 110) {
                const targetDir = cameraWorldPos.clone().sub(npc.position).setY(0).normalize();
                userData.dir.lerp(targetDir, Math.min(1, dt * 2.2));
                userData.aiming = true;
                npc.lookAt(cameraWorldPos.x, npc.position.y + 1.2, cameraWorldPos.z);

                if (distance < 2.2) {
                    userData.aiming = false;
                    game.hooks.arrest ? game.hooks.arrest() : null;
                    continue;
                }
            }
        } else if (userData.isGang && !game.isDead) {
            if (distance < 40) {
                userData.aiming = true;
                npc.lookAt(cameraWorldPos.x, npc.position.y + 1.2, cameraWorldPos.z);
                userData.attackTimer -= dt;

                if (userData.attackTimer <= 0) {
                    audio.play('enemyShoot');
                    const flash = new THREE.PointLight(CONFIG.neon.magenta, 40, 8, 2);
                    flash.position.set(0.35, 1.3, 0.4);
                    npc.add(flash);
                    setTimeout(() => { if (flash.parent) flash.parent.remove(flash); }, 60);

                    if (Math.random() > 0.3) {
                        game.hooks.takeDamage ? game.hooks.takeDamage(10) : null;
                    }
                    userData.attackTimer = 1.5;
                }
                continue;
            }
        }

        if (!userData.aiming) {
            userData.timer -= dt;
            if (userData.timer <= 0) {
                userData.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                userData.timer = Math.random() * 4 + 1;
            }

            npc.position.addScaledVector(userData.dir, userData.speed * dt);
            npc.lookAt(
                npc.position.x + userData.dir.x,
                npc.position.y + 1.1,
                npc.position.z + userData.dir.z
            );
        } else if (distance > 3 && distance < 110) {
            npc.position.addScaledVector(userData.dir, userData.speed * dt * 0.6);
        }

        // Building collision.
        const radius = 1.6;
        for (const box of collidersNear(npc.position.x, npc.position.z, 12)) {
            if (!box.min || !box.max) continue;
            if (npc.position.x > box.min.x - radius && npc.position.x < box.max.x + radius &&
                npc.position.z > box.min.z - radius && npc.position.z < box.max.z + radius) {
                const cx = (box.min.x + box.max.x) / 2;
                const cz = (box.min.z + box.max.z) / 2;
                const push = npc.position.clone().sub(new THREE.Vector3(cx, npc.position.y, cz));
                if (push.lengthSq() < 0.0001) push.set(1, 0, 0);
                npc.position.addScaledVector(push.normalize(), 0.6);
                userData.dir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                userData.timer = 1.0;
                break;
            }
        }

        // Keep NPCs inside the city.
        const limit = CONFIG.citySize / 2 - 20;
        npc.position.x = Math.max(-limit, Math.min(limit, npc.position.x));
        npc.position.z = Math.max(-limit, Math.min(limit, npc.position.z));

        // Walk cycle.
        userData.phase += dt * (userData.speed * 0.9);
        const swing = Math.sin(userData.phase) * (userData.speed * 0.045);

        if (parts) {
            if (userData.aiming) {
                parts.legL.rotation.x = 0;
                parts.legR.rotation.x = 0;
                parts.armL.rotation.x = -1.25;
                parts.armR.rotation.x = -1.35;
                parts.armR.rotation.z = -0.1;
            } else {
                parts.legL.rotation.x = swing;
                parts.legR.rotation.x = -swing;
                parts.armL.rotation.x = -swing * 0.8;
                parts.armR.rotation.x = swing * 0.8;
                parts.armR.rotation.z = 0;
            }
        }
    }
}

export function updateCars(dt, cameraWorldPos) {
    // Vehicle-to-vehicle collisions (player car included as a physical body).
    for (let i = game.cars.length - 1; i >= 0; i--) {
        const carA = game.cars[i];
        if (!carA.parent || !carA.position || carA.userData.dead) continue;

        for (let j = i - 1; j >= 0; j--) {
            const carB = game.cars[j];
            if (!carB.parent || !carB.position || carB.userData.dead) continue;

            const distance = carA.position.distanceTo(carB.position);
            if (distance > 5.2) continue;

            const speedA = Math.abs(carA.userData.velocity || 0);
            const speedB = Math.abs(carB.userData.velocity || 0);
            const relative = speedA + speedB;

            if (relative > 10) {
                const damage = Math.round(relative * 1.6);
                damageCar(carB, damage);
                damageCar(carA, damage);

                if (carA.parent && carB.parent) {
                    carA.userData.velocity *= -0.5;
                    carB.userData.velocity *= -0.5;

                    const push = carB.position.clone().sub(carA.position).setY(0);
                    if (push.lengthSq() > 0.0001) {
                        push.normalize();
                        const nudge = (5.2 - distance) * 0.5 + 0.1;
                        carA.position.addScaledVector(push, -nudge);
                        carB.position.addScaledVector(push, nudge);
                    }
                }
            }
            break;
        }
    }

    for (let i = game.cars.length - 1; i >= 0; i--) {
        const car = game.cars[i];
        if (!car.parent || !car.position || car.userData.dead) continue;
        if (isPlayerVehicle(car) || !car.userData.ai || !car.userData.ai.active) continue;

        const ai = car.userData.ai;
        let blocked = false;

        for (const box of collidersNear(car.position.x, car.position.z, 24)) {
            if (!box.min || !box.max) continue;
            if (car.position.x > box.min.x - 4 && car.position.x < box.max.x + 4 &&
                car.position.z > box.min.z - 4 && car.position.z < box.max.z + 4) {
                blocked = true;
                break;
            }
        }

        if (ai.state === 'forward') {
            if (blocked) {
                ai.state = 'reverse';
                ai.turnTimer = 1.0;
            } else {
                car.translateZ(ai.speed * dt);
                ai.turnTimer -= dt;
                if (ai.turnTimer <= 0) {
                    if (Math.random() > 0.6) car.rotation.y += Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
                    ai.turnTimer = 3.0;
                }
            }
        } else if (ai.state === 'reverse') {
            car.translateZ(-ai.speed * dt * 0.5);
            ai.turnTimer -= dt;
            if (ai.turnTimer <= 0) {
                car.rotation.y += Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
                ai.state = 'forward';
                ai.turnTimer = 3.0;
            }
        }

        // Mow down pedestrians on the pavement.
        if (Math.abs(car.userData.velocity) > 6 || ai.speed > 10) {
            for (const npc of [...game.npcs]) {
                if (!npc.userData.dead && npc.position.distanceTo(car.position) < 4.5) {
                    damageNPC(npc, 100);
                }
            }
        }

        const limit = CONFIG.citySize / 2;
        if (car.position.x > limit || car.position.x < -limit || car.position.z > limit || car.position.z < -limit) {
            car.rotation.y += Math.PI;
            car.position.x = Math.max(-limit, Math.min(limit, car.position.x));
            car.position.z = Math.max(-limit, Math.min(limit, car.position.z));
        }
    }
}
