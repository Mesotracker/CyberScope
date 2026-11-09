// Lazy WebAudio synth. The context is only created on a user gesture, which
// avoids autoplay warnings and keeps the game silent-safe in odd browsers.
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.carOsc = null;
        this.carGain = null;
    }

    ensure() {
        if (!this.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            this.ctx = new Ctx();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.8;
            this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx;
    }

    resume() {
        this.ensure();
    }

    play(type) {
        const ctx = this.ensure();
        if (!ctx) return;

        try {
            const now = ctx.currentTime;
            const gain = ctx.createGain();
            gain.connect(this.master);

            if (type === 'explosion') {
                const noise = ctx.createBufferSource();
                const length = Math.floor(ctx.sampleRate * 0.6);
                const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
                noise.buffer = buffer;

                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1800, now);
                filter.frequency.exponentialRampToValueAtTime(120, now + 0.5);

                noise.connect(filter);
                filter.connect(gain);
                gain.gain.setValueAtTime(0.55, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
                noise.start(now);
                noise.stop(now + 0.6);
                return;
            }

            const osc = ctx.createOscillator();
            osc.connect(gain);

            switch (type) {
                case 'shoot':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(1100, now);
                    osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);
                    gain.gain.setValueAtTime(0.18, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.11);
                    break;
                case 'enemyShoot':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(520, now);
                    osc.frequency.exponentialRampToValueAtTime(160, now + 0.12);
                    gain.gain.setValueAtTime(0.14, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                    osc.start(now);
                    osc.stop(now + 0.19);
                    break;
                case 'die':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(220, now);
                    osc.frequency.exponentialRampToValueAtTime(32, now + 0.45);
                    gain.gain.setValueAtTime(0.22, now);
                    gain.gain.linearRampToValueAtTime(0, now + 0.45);
                    osc.start(now);
                    osc.stop(now + 0.46);
                    break;
                case 'score':
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(660, now);
                    osc.frequency.setValueAtTime(990, now + 0.08);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.linearRampToValueAtTime(0, now + 0.22);
                    osc.start(now);
                    osc.stop(now + 0.23);
                    break;
                case 'pickup':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(520, now);
                    osc.frequency.exponentialRampToValueAtTime(1280, now + 0.16);
                    gain.gain.setValueAtTime(0.12, now);
                    gain.gain.linearRampToValueAtTime(0, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.21);
                    break;
                case 'heal':
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(330, now);
                    osc.frequency.linearRampToValueAtTime(760, now + 0.28);
                    gain.gain.setValueAtTime(0.11, now);
                    gain.gain.linearRampToValueAtTime(0, now + 0.32);
                    osc.start(now);
                    osc.stop(now + 0.33);
                    break;
                case 'switch':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(420, now);
                    osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
                    gain.gain.setValueAtTime(0.06, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
                    osc.start(now);
                    osc.stop(now + 0.08);
                    break;
                case 'arrest':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(700, now);
                    osc.frequency.exponentialRampToValueAtTime(90, now + 0.8);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.linearRampToValueAtTime(0, now + 0.8);
                    osc.start(now);
                    osc.stop(now + 0.82);
                    break;
                default:
                    osc.disconnect();
                    return;
            }
        } catch (err) {
            // Audio is never allowed to break gameplay.
        }
    }

    startCar() {
        const ctx = this.ensure();
        if (!ctx || this.carOsc) return;

        this.carOsc = ctx.createOscillator();
        this.carGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;

        this.carOsc.type = 'sawtooth';
        this.carOsc.frequency.value = 60;
        this.carOsc.connect(filter);
        filter.connect(this.carGain);
        this.carGain.connect(this.master);
        this.carGain.gain.setValueAtTime(0.0001, ctx.currentTime);
        this.carGain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.4);
        this.carOsc.start();
    }

    stopCar() {
        if (!this.carOsc || !this.ctx) return;
        const ctx = this.ctx;
        const osc = this.carOsc;
        this.carOsc = null;
        try {
            this.carGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
            setTimeout(() => {
                try { osc.stop(); osc.disconnect(); } catch (err) {}
            }, 300);
        } catch (err) {
            try { osc.stop(); } catch (e) {}
        }
    }

    updateCar(speed) {
        if (!this.carOsc || !this.ctx) return;
        this.carOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 2.2, this.ctx.currentTime, 0.12);
    }
}

export const audio = new AudioEngine();
