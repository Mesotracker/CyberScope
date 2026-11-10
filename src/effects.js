import * as THREE from 'three';
import { game } from './state.js';
import { QUALITY } from './config.js';
import { getGlowTexture, getScorchTexture } from './textures.js';

const blastGeometry = new THREE.SphereGeometry(1, 20, 14);
const fireGeometry = new THREE.SphereGeometry(1, 16, 12);
const shockwaveGeometry = new THREE.RingGeometry(0.72, 1, 56, 1);
shockwaveGeometry.rotateX(-Math.PI / 2);
const scorchGeometry = new THREE.PlaneGeometry(1, 1);
scorchGeometry.rotateX(-Math.PI / 2);

let explosionLight = null;
let flashTimer = 0;
let flashPeak = 0;

function getExplosionLight() {
    if (explosionLight) return explosionLight;
    explosionLight = new THREE.PointLight(0xffa14a, 0, 120, 2);
    game.scene.add(explosionLight);
    return explosionLight;
}

function spawnSparks(position, color, count, spread = 1, options = {}) {
    const { life = 0.75, size = 0.32, speed = 1 } = options;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const velocity = (4 + Math.random() * 12) * spread * speed;
        velocities.push(new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * velocity,
            Math.abs(Math.cos(phi)) * velocity + 3,
            Math.sin(phi) * Math.sin(theta) * velocity
        ));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color,
        size: size * Math.max(0.6, spread),
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
        life,
        maxLife: life,
        type: 'sparks',
        velocities
    });
}

// Dark scorch decal left on the wet street by a ground explosion.
function addScorch(position, scale) {
    if (position.y > 12) return;

    let scorches = 0;
    for (const particle of game.particles) {
        if (particle.type === 'scorch') scorches++;
    }
    if (scorches >= 10) {
        const index = game.particles.findIndex(particle => particle.type === 'scorch');
        if (index > -1) {
            const old = game.particles[index];
            game.scene.remove(old.mesh);
            old.mesh.material.dispose();
            game.particles.splice(index, 1);
        }
    }

    const material = new THREE.MeshBasicMaterial({
        map: getScorchTexture(),
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
    });

    const mesh = new THREE.Mesh(scorchGeometry, material);
    mesh.position.set(position.x, 0.045, position.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(9 + scale * 7);
    mesh.renderOrder = 2;
    game.scene.add(mesh);

    game.particles.push({
        mesh,
        life: 9,
        maxLife: 9,
        type: 'scorch'
    });
}

export function createBlastVisual(position, scale = 1) {
    const s = Math.max(0.6, scale);

    // Expanding fireball shell.
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
    mesh.scale.setScalar(1.1 * s);
    game.scene.add(mesh);

    game.particles.push({
        mesh,
        life: 0.5,
        maxLife: 0.5,
        type: 'blast',
        grow: 8 * s
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
    core.scale.setScalar(0.55 * s);
    game.scene.add(core);
    game.particles.push({
        mesh: core,
        life: 0.24,
        maxLife: 0.24,
        type: 'blast',
        grow: 5 * s
    });

    // Camera-facing flash that whips out and dies almost instantly.
    const flashMaterial = new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xffe7b2,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
    });
    const flash = new THREE.Sprite(flashMaterial);
    flash.position.copy(position);
    flash.scale.setScalar(4 * s);
    game.scene.add(flash);
    game.particles.push({
        mesh: flash,
        life: 0.18,
        maxLife: 0.18,
        type: 'flash',
        grow: 120 * s
    });

    // Ground shockwave ring, expanding faster than the fireball.
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffc987,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
    const ring = new THREE.Mesh(shockwaveGeometry, ringMaterial);
    ring.position.set(position.x, Math.max(0.12, position.y - 0.2), position.z);
    ring.scale.setScalar(0.8 * s);
    game.scene.add(ring);
    game.particles.push({
        mesh: ring,
        life: 0.62,
        maxLife: 0.62,
        type: 'shockwave',
        grow: 32 * s
    });

    // Rolling smoke puffs, lifted by the blast and drifting outward.
    const puffs = QUALITY.isMobile ? 3 : 5;
    for (let i = 0; i < puffs; i++) {
        const puffMaterial = new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color: 0x4a4148,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
        const puff = new THREE.Sprite(puffMaterial);
        puff.position.copy(position).add(new THREE.Vector3(
            (Math.random() - 0.5) * 6 * s,
            0.8 + Math.random() * 2.8 * s,
            (Math.random() - 0.5) * 6 * s
        ));
        const puffScale = (3 + Math.random() * 3) * s;
        puff.scale.setScalar(puffScale);
        game.scene.add(puff);

        const puffLife = 2.2 + Math.random() * 1.5;
        game.particles.push({
            mesh: puff,
            life: puffLife,
            maxLife: puffLife,
            type: 'smoke',
            grow: 3.6 * s,
            baseScale: puffScale,
            drift: new THREE.Vector3(
                (Math.random() - 0.5) * 1.6,
                1.1 + Math.random() * 1.3,
                (Math.random() - 0.5) * 1.6
            )
        });
    }

    spawnSparks(position, 0xffb35c, QUALITY.isMobile ? 14 : 26, s, {
        life: 1.5,
        size: 0.4,
        speed: 1.35
    });

    addScorch(position, s);

    const light = getExplosionLight();
    light.position.copy(position);
    flashPeak = 1500 * s;
    light.intensity = flashPeak;
    flashTimer = 0.26;
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

function disposeParticle(particle) {
    game.scene.remove(particle.mesh);
    if (particle.type === 'sparks' && particle.mesh.geometry) {
        particle.mesh.geometry.dispose();
    }
    if (particle.mesh.material) particle.mesh.material.dispose();
}

export function updateEffects(dt) {
    if (flashTimer > 0) {
        flashTimer -= dt;
        if (explosionLight) {
            const k = Math.max(0, flashTimer / 0.26);
            explosionLight.intensity = flashPeak * k * k;
            if (flashTimer <= 0) explosionLight.intensity = 0;
        }
    }

    for (let i = game.particles.length - 1; i >= 0; i--) {
        const particle = game.particles[i];
        particle.life -= dt;

        if (particle.life <= 0) {
            disposeParticle(particle);
            game.particles.splice(i, 1);
            continue;
        }

        const t = Math.max(0, particle.life / particle.maxLife);

        if (particle.type === 'blast') {
            const next = particle.mesh.scale.x + particle.grow * dt;
            particle.mesh.scale.setScalar(next);
            particle.mesh.material.opacity = t * 0.9;
        } else if (particle.type === 'flash') {
            particle.mesh.scale.setScalar(particle.mesh.scale.x + particle.grow * dt);
            particle.mesh.material.opacity = t * t;
        } else if (particle.type === 'shockwave') {
            particle.mesh.scale.setScalar(particle.mesh.scale.x + particle.grow * dt);
            particle.mesh.material.opacity = t * t * 0.9;
        } else if (particle.type === 'smoke') {
            particle.mesh.position.addScaledVector(particle.drift, dt);
            const target = particle.baseScale + (1 - t) * particle.grow;
            particle.mesh.scale.setScalar(target);
            particle.mesh.material.opacity = 0.42 * t;
            particle.mesh.material.rotation += dt * 0.35;
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
        } else if (particle.type === 'scorch') {
            // Holds while the fire is fresh, then soaks back into the street.
            particle.mesh.material.opacity = 0.62 * Math.min(1, t * 3.2);
        }
    }
}

export function clearEffects() {
    for (const particle of game.particles) {
        disposeParticle(particle);
    }
    game.particles.length = 0;
    if (explosionLight) explosionLight.intensity = 0;
}
