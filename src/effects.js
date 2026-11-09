import * as THREE from 'three';
import { game } from './state.js';
import { getGlowTexture } from './textures.js';

const blastGeometry = new THREE.SphereGeometry(1, 20, 14);
const fireGeometry = new THREE.SphereGeometry(1, 16, 12);

let explosionLight = null;
let flashTimer = 0;

function getExplosionLight() {
    if (explosionLight) return explosionLight;
    explosionLight = new THREE.PointLight(0xffa14a, 0, 120, 2);
    game.scene.add(explosionLight);
    return explosionLight;
}

function spawnSparks(position, color, count, spread = 1) {
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const speed = (4 + Math.random() * 12) * spread;
        velocities.push(new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * speed,
            Math.abs(Math.cos(phi)) * speed + 3,
            Math.sin(phi) * Math.sin(theta) * speed
        ));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color,
        size: 0.32 * Math.max(0.6, spread),
        map: getGlowTexture(),
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    game.scene.add(points);

    game.particles.push({
        mesh: points,
        life: 0.7,
        maxLife: 0.7,
        type: 'sparks',
        velocities
    });
}

export function createBlastVisual(position, scale = 1) {
    const material = new THREE.MeshBasicMaterial({
        color: 0xffb35c,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(blastGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(Math.max(0.6, scale * 1.1));
    game.scene.add(mesh);

    game.particles.push({
        mesh,
        life: 0.5,
        maxLife: 0.5,
        type: 'blast',
        grow: 8 * scale
    });

    // Inner white-hot core.
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff1c4,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const core = new THREE.Mesh(blastGeometry, coreMaterial);
    core.position.copy(position);
    core.scale.setScalar(Math.max(0.3, scale * 0.55));
    game.scene.add(core);
    game.particles.push({
        mesh: core,
        life: 0.22,
        maxLife: 0.22,
        type: 'blast',
        grow: 5 * scale
    });

    spawnSparks(position, 0xffb35c, Math.min(30, 10 + Math.floor(scale * 5)), scale);

    const light = getExplosionLight();
    light.position.copy(position);
    light.intensity = 900 * scale;
    flashTimer = 0.2;
}

export function createFireVisual(position, scale = 1) {
    const material = new THREE.MeshBasicMaterial({
        color: 0xff6a1f,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(fireGeometry, material);
    mesh.position.copy(position);
    mesh.position.y = Math.max(position.y, 1);
    mesh.scale.setScalar(1.1 * scale);
    game.scene.add(mesh);

    game.particles.push({
        mesh,
        life: 3.2,
        maxLife: 3.2,
        type: 'fire',
        grow: 1.3 * scale,
        baseScale: 1.1 * scale
    });

    spawnSparks(position, 0xff8a3a, 8, 0.5);
}

export function createImpact(position, color = 0x27e7ff) {
    spawnSparks(position, color, 6, 0.45);
}

export function updateEffects(dt) {
    if (flashTimer > 0) {
        flashTimer -= dt;
        if (explosionLight) {
            explosionLight.intensity = Math.max(0, flashTimer / 0.2) * 900;
            if (flashTimer <= 0) explosionLight.intensity = 0;
        }
    }

    for (let i = game.particles.length - 1; i >= 0; i--) {
        const particle = game.particles[i];
        particle.life -= dt;

        if (particle.life <= 0) {
            game.scene.remove(particle.mesh);
            if (particle.type === 'sparks') {
                if (particle.mesh.geometry) particle.mesh.geometry.dispose();
                if (particle.mesh.material) particle.mesh.material.dispose();
            } else if (particle.mesh.material) {
                particle.mesh.material.dispose();
            }
            game.particles.splice(i, 1);
            continue;
        }

        const t = particle.life / particle.maxLife;

        if (particle.type === 'blast') {
            const next = particle.mesh.scale.x + particle.grow * dt;
            particle.mesh.scale.setScalar(next);
            particle.mesh.material.opacity = t * 0.9;
        } else if (particle.type === 'fire') {
            const flicker = 0.9 + Math.sin(particle.life * 18) * 0.1;
            const target = particle.baseScale + (1 - t) * particle.grow;
            particle.mesh.scale.setScalar(target * flicker);
            particle.mesh.material.opacity = 0.55 * t;
            particle.mesh.material.color.setHSL(0.06 + 0.04 * Math.sin(particle.life * 9), 1, 0.5);
        } else if (particle.type === 'sparks') {
            const attribute = particle.mesh.geometry.attributes.position;
            for (let s = 0; s < particle.velocities.length; s++) {
                const velocity = particle.velocities[s];
                velocity.y -= 16 * dt;
                attribute.array[s * 3] += velocity.x * dt;
                attribute.array[s * 3 + 1] += velocity.y * dt;
                attribute.array[s * 3 + 2] += velocity.z * dt;
            }
            attribute.needsUpdate = true;
            particle.mesh.material.opacity = t;
        }
    }
}

export function clearEffects() {
    for (const particle of game.particles) {
        game.scene.remove(particle.mesh);
        if (particle.type === 'sparks') {
            if (particle.mesh.geometry) particle.mesh.geometry.dispose();
        }
        if (particle.mesh.material) particle.mesh.material.dispose();
    }
    game.particles.length = 0;
    if (explosionLight) explosionLight.intensity = 0;
}
