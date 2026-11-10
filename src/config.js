import * as THREE from 'three';

// A touch-first profile is used on phones / tablets (or ?mobile=1 for testing).
// The same scene is kept, but the expensive extras are trimmed.
export function detectMobile() {
    if (typeof window === 'undefined') return false;

    const forced = new URLSearchParams(window.location.search).get('mobile');
    if (forced === '1') return true;
    if (forced === '0') return false;

    const ua = navigator.userAgent || '';
    const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
    const touch = (navigator.maxTouchPoints || 0) > 0;
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) || (coarse && touch);
}

export const IS_MOBILE = detectMobile();

export const QUALITY = {
    isMobile: IS_MOBILE,
    // Render scale, in device pixels per CSS pixel.
    pixelRatio: IS_MOBILE ? 1 : 1.5,
    // Only the mobile profile is allowed to trade resolution for frame rate.
    // Desktop always renders at its full high-quality scale.
    adaptive: IS_MOBILE,
    maxPixelRatio: IS_MOBILE ? 1 : 1.5,
    minPixelRatio: IS_MOBILE ? 0.68 : 1.5,
    antialias: !IS_MOBILE,
    shadows: !IS_MOBILE,
    rainColumns: IS_MOBILE ? 420 : 1200,
    rainTrail: IS_MOBILE ? 7 : 12,
    droneCount: IS_MOBILE ? 8 : 14,
    bloomStrength: IS_MOBILE ? 0.55 : 0.8,
    bloomRadius: IS_MOBILE ? 0.5 : 0.62,
    bloomThreshold: IS_MOBILE ? 0.85 : 0.72,
    // Bloom is a soft blur, so mobile can compute it at half resolution.
    bloomScale: IS_MOBILE ? 0.5 : 1,
    anisotropy: IS_MOBILE ? 2 : 8,
    glitchIntensity: IS_MOBILE ? 0.55 : 1
};

// Jail anchor used by the arrest / respawn flow.
export const JAIL_POS = new THREE.Vector3(10, 0, 10);

export const CONFIG = {
    fogColor: 0x05070f,
    citySize: 2000,
    blockSize: 100,
    roadWidth: 40,
    npcCount: IS_MOBILE ? 26 : 60,
    carCount: IS_MOBILE ? 8 : 18,
    pickupCount: IS_MOBILE ? 8 : 15,
    heartCount: IS_MOBILE ? 6 : 10,
    copCount: IS_MOBILE ? 4 : 5,
    copSpeedMultiplier: 1.5,

    // Neon accents used across signage, vehicles and NPC trim.
    neonColors: [0x27e7ff, 0xff2bd6, 0xffb03a, 0x8a5bff, 0x39ff9e],
    neon: {
        cyan: 0x27e7ff,
        magenta: 0xff2bd6,
        amber: 0xffb03a,
        red: 0xff3b4e,
        green: 0x39ff9e,
        violet: 0x8a5bff,
        blue: 0x2a6bff
    },

    maxHealth: 100,
    shadowMapSize: IS_MOBILE ? 512 : 2048,
    reflectionSize: IS_MOBILE ? 256 : 1024,
    fogDensity: IS_MOBILE ? 0.0016 : 0.00105
};

export const WEAPONS = [
    { name: 'Pistol',  type: 'raycast', damage: 35,  fireRate: 0.32, auto: false, color: 0x39ff9e, ammo: 9999, model: 'pistol'  },
    { name: 'Rifle',   type: 'raycast', damage: 15,  fireRate: 0.1,  auto: true,  color: 0xff2bd6, ammo: 0,    model: 'rifle'   },
    { name: 'Rocket',  type: 'rocket',  damage: 200, fireRate: 1.5,  auto: false, color: 0xffb03a, ammo: 0,    model: 'rocket'  },
    { name: 'Grenade', type: 'throw',   damage: 150, fireRate: 1.0,  auto: false, color: 0x27e7ff, ammo: 0,    model: 'grenade' },
    { name: 'Molotov', type: 'throw',   damage: 50,  fireRate: 1.0,  auto: false, color: 0xff7a2b, ammo: 0,    model: 'molotov' }
];
