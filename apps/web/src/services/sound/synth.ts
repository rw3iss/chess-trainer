// Tiny WebAudio synthesizer — every app sound is generated (no audio assets).
// Each recipe schedules a few oscillator / noise voices on an AudioContext.
export type SoundKind = 'move' | 'capture' | 'check' | 'lowTime' | 'gameEnd' | 'notify';

interface Voice {
	/** 'noise' = filtered white noise burst (wooden "clack"). */
	type: OscillatorType | 'noise';
	freq: number;
	/** Optional end frequency (exponential glide). */
	toFreq?: number;
	start: number;
	duration: number;
	gain: number;
	/** Band-pass centre for noise voices. */
	filter?: number;
}

const RECIPES: Record<SoundKind, Voice[]> = {
	move: [
		{ type: 'noise', freq: 0, start: 0, duration: 0.05, gain: 0.55, filter: 1800 },
		{ type: 'sine', freq: 220, toFreq: 140, start: 0, duration: 0.07, gain: 0.25 },
	],
	capture: [
		{ type: 'noise', freq: 0, start: 0, duration: 0.06, gain: 0.7, filter: 1200 },
		{ type: 'noise', freq: 0, start: 0.045, duration: 0.05, gain: 0.45, filter: 2400 },
		{ type: 'triangle', freq: 180, toFreq: 90, start: 0, duration: 0.1, gain: 0.3 },
	],
	check: [
		{ type: 'noise', freq: 0, start: 0, duration: 0.05, gain: 0.5, filter: 1800 },
		{ type: 'sine', freq: 880, start: 0.03, duration: 0.14, gain: 0.18 },
		{ type: 'sine', freq: 1320, start: 0.03, duration: 0.12, gain: 0.08 },
	],
	lowTime: [
		{ type: 'sine', freq: 990, start: 0, duration: 0.08, gain: 0.2 },
		{ type: 'sine', freq: 990, start: 0.14, duration: 0.08, gain: 0.2 },
	],
	gameEnd: [
		{ type: 'sine', freq: 523.25, start: 0, duration: 0.22, gain: 0.18 },
		{ type: 'sine', freq: 659.25, start: 0.12, duration: 0.22, gain: 0.16 },
		{ type: 'sine', freq: 783.99, start: 0.24, duration: 0.4, gain: 0.16 },
	],
	notify: [{ type: 'sine', freq: 740, toFreq: 980, start: 0, duration: 0.12, gain: 0.15 }],
};

let noiseBuffer: AudioBuffer | null = null;

function getNoise(ctx: BaseAudioContext): AudioBuffer {
	if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
	const len = Math.floor(ctx.sampleRate * 0.2);
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const data = buf.getChannelData(0);
	for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
	noiseBuffer = buf;
	return buf;
}

/** Schedule `kind` on `ctx` at master `volume` (0..1). */
export function playSynth(ctx: BaseAudioContext, kind: SoundKind, volume: number): void {
	const t0 = ctx.currentTime + 0.005;
	const master = ctx.createGain();
	master.gain.value = Math.max(0, Math.min(1, volume));
	master.connect(ctx.destination);
	for (const v of RECIPES[kind]) {
		const start = t0 + v.start;
		const end = start + v.duration;
		const env = ctx.createGain();
		env.gain.setValueAtTime(0.0001, start);
		env.gain.exponentialRampToValueAtTime(v.gain, start + 0.004);
		env.gain.exponentialRampToValueAtTime(0.0001, end);
		env.connect(master);
		if (v.type === 'noise') {
			const src = ctx.createBufferSource();
			src.buffer = getNoise(ctx);
			const bp = ctx.createBiquadFilter();
			bp.type = 'bandpass';
			bp.frequency.value = v.filter ?? 1500;
			bp.Q.value = 1.2;
			src.connect(bp).connect(env);
			src.start(start);
			src.stop(end + 0.02);
		} else {
			const osc = ctx.createOscillator();
			osc.type = v.type;
			osc.frequency.setValueAtTime(v.freq, start);
			if (v.toFreq) osc.frequency.exponentialRampToValueAtTime(v.toFreq, end);
			osc.connect(env);
			osc.start(start);
			osc.stop(end + 0.02);
		}
	}
}
