import * as THREE from 'three';
import { game } from './state.js';
import { IS_MOBILE } from './config.js';
import * as ui from './ui.js';

const LOOK_SENSITIVITY = 0.0032;
const PITCH_LIMIT = Math.PI / 2 - 0.08;
const TAP_MOVE_LIMIT = 12;
const TAP_TIME_LIMIT = 420;
const STICK_DEADZONE = 0.2;

const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

let stickPointer = null;
let stickCenterX = 0;
let stickCenterY = 0;
let stickRadius = 44;

let lookPointer = null;
let lookStartX = 0;
let lookStartY = 0;
let lookLastX = 0;
let lookLastY = 0;
let lookMoved = false;
let lookStartTime = 0;

function setMoveAxis(x, y) {
    game.move.left = x < -STICK_DEADZONE;
    game.move.right = x > STICK_DEADZONE;
    game.move.forward = y < -STICK_DEADZONE;
    game.move.backward = y > STICK_DEADZONE;
}

function clearMoveAxis() {
    game.move.left = false;
    game.move.right = false;
    game.move.forward = false;
    game.move.backward = false;
}

function initJoystick() {
    const base = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    if (!base || !knob) return;

    const update = (clientX, clientY) => {
        let dx = clientX - stickCenterX;
        let dy = clientY - stickCenterY;
        const length = Math.hypot(dx, dy);
        if (length > stickRadius) {
            dx = (dx / length) * stickRadius;
            dy = (dy / length) * stickRadius;
        }
        knob.style.transform = `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        setMoveAxis(dx / stickRadius, dy / stickRadius);
    };

    const reset = () => {
        stickPointer = null;
        clearMoveAxis();
        base.classList.remove('active');
        knob.style.transform = 'translate(-50%, -50%)';
    };

    base.addEventListener('pointerdown', (event) => {
        if (!game.mobile.active || stickPointer !== null) return;
        event.preventDefault();
        event.stopPropagation();
        stickPointer = event.pointerId;
        const rect = base.getBoundingClientRect();
        stickCenterX = rect.left + rect.width / 2;
        stickCenterY = rect.top + rect.height / 2;
        stickRadius = rect.width * 0.32;
        base.classList.add('active');
        try {
            base.setPointerCapture(event.pointerId);
        } catch (error) {
            // Synthetic pointers used for testing cannot be captured.
        }
        update(event.clientX, event.clientY);
    });

    base.addEventListener('pointermove', (event) => {
        if (event.pointerId !== stickPointer) return;
        event.preventDefault();
        event.stopPropagation();
        update(event.clientX, event.clientY);
    });

    const end = (event) => {
        if (event.pointerId !== stickPointer) return;
        reset();
    };

    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    base.addEventListener('lostpointercapture', end);
}

function applyLook(dx, dy) {
    lookEuler.setFromQuaternion(game.camera.quaternion, 'YXZ');
    lookEuler.y -= dx * LOOK_SENSITIVITY;
    lookEuler.x -= dy * LOOK_SENSITIVITY;
    lookEuler.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, lookEuler.x));
    lookEuler.z = 0;
    game.camera.quaternion.setFromEuler(lookEuler);
}

function tapFire() {
    if (!game.mobile.active || game.isDead || game.isMapOpen) return;
    if (game.gameState.mode !== 'walking') return;
    game.isFiring = true;
    window.setTimeout(() => {
        game.isFiring = false;
    }, 140);
}

function onPointerDown(event) {
    if (!game.mobile.active || game.isDead || game.isMapOpen) return;
    if (lookPointer !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target = event.target;
    if (target && typeof target.closest === 'function' &&
        target.closest('#joystick, #rotate-device, #blocker, #full-map-layer, #wasted-screen')) {
        return;
    }

    lookPointer = event.pointerId;
    lookStartX = lookLastX = event.clientX;
    lookStartY = lookLastY = event.clientY;
    lookMoved = false;
    lookStartTime = performance.now();
    event.preventDefault();
}

function onPointerMove(event) {
    if (event.pointerId !== lookPointer) return;

    const dx = event.clientX - lookLastX;
    const dy = event.clientY - lookLastY;
    lookLastX = event.clientX;
    lookLastY = event.clientY;

    if (!lookMoved && Math.hypot(event.clientX - lookStartX, event.clientY - lookStartY) > TAP_MOVE_LIMIT) {
        lookMoved = true;
    }
    if (dx || dy) applyLook(dx, dy);
    if (event.cancelable) event.preventDefault();
}

function onPointerUp(event) {
    if (event.pointerId !== lookPointer) return;

    const isTap = !lookMoved && performance.now() - lookStartTime < TAP_TIME_LIMIT;
    lookPointer = null;
    if (isTap) tapFire();
}

function onPointerCancel(event) {
    if (event.pointerId === lookPointer) lookPointer = null;
}

export function initMobile() {
    if (!IS_MOBILE) return;

    game.mobile.enabled = true;
    document.body.classList.add('is-mobile');
    initJoystick();

    document.addEventListener('pointerdown', onPointerDown, { passive: false });
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('pointercancel', onPointerCancel, { passive: true });
    window.addEventListener('blur', () => {
        lookPointer = null;
        stickPointer = null;
        clearMoveAxis();
    });

    // Stop iOS pinch-zoom and double-tap zoom from fighting the controls.
    document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });
}

export function startMobileGame() {
    if (!IS_MOBILE) return;

    game.mobile.active = true;
    document.body.classList.add('mobile-playing');
    if (ui.dom.blocker) ui.dom.blocker.style.display = 'none';
    if (ui.dom.instructions) ui.dom.instructions.style.display = 'none';
    ui.setCrosshairVisible(true);
    ui.showMessage('MOBILE LINK // STICK TO MOVE');

    // Fullscreen and orientation lock are best-effort and only for real touch
    // devices. Both can reject without user activation or browser support.
    if (navigator.maxTouchPoints > 0) {
        try {
            const request = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
            if (request && request.catch) request.catch(() => {});
        } catch (error) {
            // Optional browser feature.
        }
        try {
            const lock = screen.orientation?.lock?.('landscape');
            if (lock && lock.catch) lock.catch(() => {});
        } catch (error) {
            // Optional browser feature.
        }
    }
}
