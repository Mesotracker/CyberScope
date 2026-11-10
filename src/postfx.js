import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from './config.js';

// Screen-space "ray-traced" look: HDR bloom plus chromatic tearing, grain and
// scanlines. Paired with the planar reflection on the wet street in world.js.
const GlitchShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uIntensity: { value: 1 }
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uIntensity;
        varying vec2 vUv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
            vec2 uv = vUv;
            float row = floor(uv.y * 46.0);
            float tear = step(0.974, hash(vec2(row, floor(uTime * 7.0))));
            float shift = (hash(vec2(floor(uTime * 30.0), row)) - 0.5) * 0.03;
            uv.x += tear * shift * uIntensity;

            float chroma = (0.0012 + tear * 0.0045) * uIntensity;
            float r = texture2D(tDiffuse, uv + vec2(chroma, 0.0)).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - vec2(chroma, 0.0)).b;
            vec3 color = vec3(r, g, b);

            float scan = 0.97 + 0.03 * sin(uv.y * uResolution.y * 1.7 + uTime * 6.0);
            float grain = hash(uv * uResolution + fract(uTime)) - 0.5;
            color = color * scan + grain * 0.028;

            vec2 d = uv - 0.5;
            color *= 1.0 - dot(d, d) * 0.9;

            gl_FragColor = vec4(color, 1.0);
        }
    `
};

export function createComposer(renderer, scene, camera) {
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(QUALITY.pixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);

    composer.addPass(new RenderPass(scene, camera));

    const bloom = new UnrealBloomPass(
        new THREE.Vector2(
            Math.max(1, Math.round(window.innerWidth * QUALITY.bloomScale)),
            Math.max(1, Math.round(window.innerHeight * QUALITY.bloomScale))
        ),
        QUALITY.bloomStrength,
        QUALITY.bloomRadius,
        QUALITY.bloomThreshold
    );
    composer.addPass(bloom);

    const glitch = new ShaderPass(GlitchShader);
    glitch.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    glitch.uniforms.uIntensity.value = QUALITY.glitchIntensity;
    composer.addPass(glitch);

    composer.addPass(new OutputPass());

    // Cached so resizing and per-frame updates do not have to scan the pass list.
    // EffectComposer r160 has no getPixelRatio(), so track it alongside the composer.
    composer.bloom = bloom;
    composer.glitch = glitch;
    composer.pixelRatio = QUALITY.pixelRatio;

    return composer;
}

export function updateComposer(composer, time) {
    if (composer.glitch) composer.glitch.uniforms.uTime.value = time;
}

export function resizeComposer(composer, width, height, pixelRatio) {
    if (!composer) return;

    if (pixelRatio && Math.abs((composer.pixelRatio || 1) - pixelRatio) > 0.001) {
        composer.setPixelRatio(pixelRatio);
        composer.pixelRatio = pixelRatio;
    }
    composer.setSize(width, height);

    // EffectComposer sizes every pass at full resolution; bloom does not need it.
    const ratio = composer.pixelRatio || 1;
    if (composer.bloom && QUALITY.bloomScale < 1) {
        composer.bloom.setSize(
            Math.max(1, Math.round(width * ratio * QUALITY.bloomScale)),
            Math.max(1, Math.round(height * ratio * QUALITY.bloomScale))
        );
    }

    for (const pass of composer.passes) {
        if (pass.uniforms && pass.uniforms.uResolution) {
            pass.uniforms.uResolution.value.set(width, height);
        }
    }
}
