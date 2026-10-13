// Sound service — plays synthesized sounds, respecting settings.sounds
// (enabled + volume). The AudioContext is created lazily on first use and
// resumed on the next user gesture if the browser suspended it.
//   import { sound } from '@/services/sound';
//   sound.play('capture');
// Framework-free: the settings source is injected (`sound.setSource`) by the
// feature installer, so services never import state.
import { playSynth, type SoundKind } from './synth';

type AudioCtor = new () => AudioContext;

export interface SoundSettingsSource {
	(): { enabled: boolean; volume: number };
}

export class SoundService {
	private ctx: AudioContext | null = null;
	private unlocked = false;

	constructor(
		private source: SoundSettingsSource = () => ({ enabled: true, volume: 0.6 }),
		private readonly synth: typeof playSynth = playSynth,
	) {}

	setSource(source: SoundSettingsSource): void {
		this.source = source;
	}

	private context(): AudioContext | null {
		if (this.ctx) return this.ctx;
		const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
		const Ctor = g.AudioContext ?? g.webkitAudioContext;
		if (!Ctor) return null;
		try {
			this.ctx = new Ctor();
		} catch {
			return null;
		}
		this.unlockOnGesture();
		return this.ctx;
	}

	/** Browsers start contexts suspended until a gesture: resume on the first pointer/key. */
	private unlockOnGesture(): void {
		if (this.unlocked || typeof window === 'undefined') return;
		this.unlocked = true;
		const resume = () => void this.ctx?.resume().catch(() => {});
		window.addEventListener('pointerdown', resume, { capture: true, passive: true });
		window.addEventListener('keydown', resume, { capture: true });
	}

	/** Play a sound; `force` ignores the enabled flag (settings "test" button). */
	play(kind: SoundKind, opts: { force?: boolean; volume?: number } = {}): boolean {
		const s = this.source();
		if (!s.enabled && !opts.force) return false;
		const volume = opts.volume ?? s.volume;
		if (volume <= 0) return false;
		const ctx = this.context();
		if (!ctx) return false;
		if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
		this.synth(ctx, kind, volume);
		return true;
	}
}

export const sound = new SoundService();
