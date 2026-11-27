import { AudioClip, AudioSource, Node, resources } from 'cc';
import { SaveManager } from './SaveManager';

export class AudioManager {
    private static _ins: AudioManager | null = null;
    public static get ins(): AudioManager {
        if (!this._ins) {
            this._ins = new AudioManager();
        }
        return this._ins;
    }

    private _sfxSource: AudioSource | null = null;
    private _steamSource: AudioSource | null = null;
    private _clips: Map<string, AudioClip> = new Map();
    private _loaded = false;
    private _comboStep = 0;
    private _lastPopMs = 0;
    private _steamPlaying = false;
    private _webAudioCtx: AudioContext | null = null;

    public init(hostNode: Node): void {
        if (!this._sfxSource) {
            const sfxNode = new Node('AudioSFX');
            sfxNode.setParent(hostNode);
            this._sfxSource = sfxNode.addComponent(AudioSource);
        }
        if (!this._steamSource) {
            const steamNode = new Node('AudioSteam');
            steamNode.setParent(hostNode);
            this._steamSource = steamNode.addComponent(AudioSource);
            this._steamSource.loop = true;
            this._steamSource.volume = 0;
        }
    }

    public loadAll(): Promise<void> {
        if (this._loaded) return Promise.resolve();
        return new Promise((resolve) => {
            const infos = resources.getDirWithPath('audio', AudioClip);
            const uuidToName = new Map<string, string>();
            for (const info of infos) {
                const segs = info.path.split('/');
                const fname = segs[segs.length - 1];
                if (fname) uuidToName.set(info.uuid, fname);
            }
            resources.loadDir('audio', AudioClip, (err, clips) => {
                if (!err && clips) {
                    for (const clip of clips) {
                        const name = uuidToName.get(clip.uuid) || clip.name;
                        if (name) this._clips.set(name, clip);
                    }
                }
                console.log(`[AudioManager] loaded ${this._clips.size} clips`);
                this._loaded = true;
                resolve();
            });
        });
    }

    public play(clipName: string, volume = 0.85): void {
        if (!SaveManager.ins.soundOn || !this._sfxSource) return;
        const clip = this._clips.get(clipName);
        if (clip) {
            this._sfxSource.playOneShot(clip, volume);
        }
    }

    /** 8-step pentatonic climbing plastic bead pop */
    public playBeadPop(): void {
        if (!SaveManager.ins.soundOn) return;
        const now = Date.now();
        if (now - this._lastPopMs > 650) {
            this._comboStep = 0;
        }
        // Slight throttle so rapid drags sound musical, not muddy
        if (now - this._lastPopMs < 48) return;
        this._lastPopMs = now;
        const idx = (this._comboStep % 8) + 1;
        this._comboStep++;
        this.play(`bead_pop_${idx}`, 0.72);
    }

    public playError(): void {
        this.play('error', 0.55);
    }

    public playColorDone(): void {
        this.play('color_done', 0.85);
    }

    public playPeelPaper(): void {
        this.play('peel_paper', 0.9);
    }

    public playComplete(): void {
        this.play('complete', 0.92);
    }

    public playClick(): void {
        this.play('ui_click', 0.5);
    }

    /** Middle-Eastern royal gold coin celebration: Hijaz qanun flourish + cascading gold dinar clinks */
    public playCoin(isGrand = false): void {
        if (!SaveManager.ins.soundOn) return;
        if (this._clips.has('coin')) {
            this.play('coin', isGrand ? 0.95 : 0.85);
        }
        if (this._playSynthCoinChime(isGrand)) return;
        this.play('color_done', 0.65);
    }

    private _playSynthCoinChime(isGrand = false): boolean {
        try {
            const g = globalThis as Record<string, any>;
            const Ctx = g.AudioContext || g.webkitAudioContext;
            let ctx = this._webAudioCtx;
            if (!ctx) {
                if (typeof Ctx === 'function') {
                    ctx = new Ctx();
                } else if (g.wx && typeof g.wx.createWebAudioContext === 'function') {
                    ctx = g.wx.createWebAudioContext();
                }
                this._webAudioCtx = ctx;
            }
            if (!ctx) return false;
            if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                ctx.resume().catch(() => {});
            }

            const now = ctx.currentTime;

            // 1. Hijaz Maqam plucked qanun arpeggio (D5 - Eb5 - F#5 - G5 - A5 - D6 [- Eb6 - F#6])
            const hijazFreqs = isGrand
                ? [587.33, 622.25, 739.99, 783.99, 880.0, 1174.66, 1244.51, 1479.98]
                : [587.33, 622.25, 739.99, 880.0, 1174.66];
            hijazFreqs.forEach((freq, idx) => {
                const start = idx * 0.044;
                const isTop = idx === hijazFreqs.length - 1;
                const dur = isTop ? 0.42 : 0.16;

                // Warm plucked string body (triangle)
                const bodyOsc = ctx!.createOscillator();
                const bodyGain = ctx!.createGain();
                bodyOsc.type = 'triangle';
                bodyOsc.frequency.setValueAtTime(freq, now + start);
                bodyGain.gain.setValueAtTime(0.0001, now + start);
                bodyGain.gain.exponentialRampToValueAtTime(isTop ? 0.14 : 0.095, now + start + 0.008);
                bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
                bodyOsc.connect(bodyGain);
                bodyGain.connect(ctx!.destination);
                bodyOsc.start(now + start);
                bodyOsc.stop(now + start + dur + 0.02);

                // Bright octave qanun shimmer
                const overOsc = ctx!.createOscillator();
                const overGain = ctx!.createGain();
                overOsc.type = 'sine';
                overOsc.frequency.setValueAtTime(freq * 2, now + start);
                overGain.gain.setValueAtTime(0.0001, now + start);
                overGain.gain.exponentialRampToValueAtTime(isTop ? 0.075 : 0.045, now + start + 0.006);
                overGain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur * 0.85);
                overOsc.connect(overGain);
                overGain.connect(ctx!.destination);
                overOsc.start(now + start);
                overOsc.stop(now + start + dur + 0.02);
            });

            // 2. Heavy metallic gold dinar coin cascade clinks
            const clinkTimes = isGrand
                ? [0.02, 0.075, 0.135, 0.20, 0.27, 0.35]
                : [0.02, 0.085, 0.155, 0.23];
            clinkTimes.forEach((tOff, idx) => {
                const baseMeta = 2420 + (idx % 3) * 290;
                const partials = [baseMeta, baseMeta * 1.56];
                partials.forEach((pFreq, pIdx) => {
                    const osc = ctx!.createOscillator();
                    const gain = ctx!.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(pFreq, now + tOff);
                    const peak = pIdx === 0 ? 0.09 : 0.055;
                    const dur = pIdx === 0 ? 0.14 : 0.09;
                    gain.gain.setValueAtTime(0.0001, now + tOff);
                    gain.gain.exponentialRampToValueAtTime(peak, now + tOff + 0.004);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + tOff + dur);
                    osc.connect(gain);
                    gain.connect(ctx!.destination);
                    osc.start(now + tOff);
                    osc.stop(now + tOff + dur + 0.02);
                });
            });

            return true;
        } catch {
            return false;
        }
    }

    public setSteam(active: boolean, intensity = 0.6): void {
        if (!this._steamSource) return;
        if (!SaveManager.ins.soundOn || !active) {
            if (this._steamPlaying || this._steamSource.playing) {
                this._steamSource.volume = 0;
                this._steamSource.stop();
                this._steamPlaying = false;
            }
            return;
        }
        const clip = this._clips.get('iron_steam');
        if (!clip) return;
        if (!this._steamPlaying || !this._steamSource.playing) {
            this._steamSource.clip = clip;
            this._steamSource.loop = true;
            this._steamSource.volume = Math.max(0.1, Math.min(0.85, intensity));
            this._steamSource.play();
            this._steamPlaying = true;
        } else {
            this._steamSource.volume = Math.max(0.1, Math.min(0.85, intensity));
        }
    }
}
