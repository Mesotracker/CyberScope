import * as THREE from 'three';
import { CONFIG, JAIL_POS } from './config.js';

export { CONFIG, JAIL_POS };

const GRID_CELL = 80;

// One shared mutable object instead of a pile of globals. Modules import this
// and read / write the same references, which keeps every update in sync.
export const game = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    composer: null,

    colliders: [],
    colliderGrid: new Map(),
    npcs: [],
    cars: [],
    pickups: [],
    projectiles: [],
    particles: [],

    raycaster: new THREE.Raycaster(),
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    move: { forward: false, backward: false, left: false, right: false },

    score: 0,
    playerHealth: CONFIG.maxHealth,
    isDead: false,
    isMapOpen: false,
    isFiring: false,
    mobile: { enabled: false, active: false },
    fireTimer: 0,
    canJump: false,
    lastExplosionTime: 0,

    time: 0,
    elapsed: 0,

    gunMesh: null,
    muzzleFlashLight: null,
    ground: null,

    gameState: {
        mode: 'walking',
        currentVehicle: null,
        currentWeaponIdx: 0,
        inventory: [true, false, false, false, false],
        ammo: [9999, 0, 0, 0, 0]
    },

    // Cross-module services registered during boot (player -> combat).
    hooks: {}
};

export function addCollider(box) {
    game.colliders.push(box);

    const x0 = Math.floor(box.min.x / GRID_CELL);
    const x1 = Math.floor(box.max.x / GRID_CELL);
    const z0 = Math.floor(box.min.z / GRID_CELL);
    const z1 = Math.floor(box.max.z / GRID_CELL);

    for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
            const key = `${x},${z}`;
            let bucket = game.colliderGrid.get(key);
            if (!bucket) {
                bucket = [];
                game.colliderGrid.set(key, bucket);
            }
            bucket.push(box);
        }
    }
}

export function collidersNear(x, z, radius = GRID_CELL) {
    const found = new Set();
    const x0 = Math.floor((x - radius) / GRID_CELL);
    const x1 = Math.floor((x + radius) / GRID_CELL);
    const z0 = Math.floor((z - radius) / GRID_CELL);
    const z1 = Math.floor((z + radius) / GRID_CELL);

    for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
            const bucket = game.colliderGrid.get(`${cx},${cz}`);
            if (!bucket) continue;
            for (const box of bucket) found.add(box);
        }
    }
    return found;
}

export function pointInColliders(point, radius = GRID_CELL) {
    for (const box of collidersNear(point.x, point.z, radius)) {
        if (box.containsPoint(point)) return true;
    }
    return false;
}
