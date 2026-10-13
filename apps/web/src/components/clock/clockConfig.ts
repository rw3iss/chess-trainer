// Clock settings ↔ core ClockConfig helpers (pure).
import { CLOCK_PRESETS, type ClockConfig } from '@chess/core/clock';
import type { ClockSettings } from '@/state/settings';

export const CUSTOM_PRESET_ID = 'custom';

/** The time control described by the clock settings (preset or custom, plus delay). */
export function resolveClockConfig(s: Pick<ClockSettings, 'presetId' | 'custom' | 'delayMs'>): ClockConfig {
	const preset = CLOCK_PRESETS.find((p) => p.id === s.presetId);
	const base = preset?.config ?? s.custom;
	const config: ClockConfig = { initialMs: Math.max(1000, base.initialMs), incrementMs: Math.max(0, base.incrementMs) };
	if (s.delayMs > 0) config.delayMs = s.delayMs;
	return config;
}

/** '5+3', '90+30', '10+0 d5' — minutes + increment seconds (+ delay). */
export function describeClockConfig(c: ClockConfig): string {
	const min = c.initialMs / 60_000;
	const mins = Number.isInteger(min) ? String(min) : min.toFixed(1);
	const base = `${mins}+${Math.round(c.incrementMs / 1000)}`;
	return c.delayMs ? `${base} d${Math.round(c.delayMs / 1000)}` : base;
}

/** Speed category for a time control (estimated game length = initial + 40 × increment). */
export function clockCategory(c: ClockConfig): 'Bullet' | 'Blitz' | 'Rapid' | 'Classical' {
	const est = c.initialMs + 40 * c.incrementMs;
	if (est < 3 * 60_000) return 'Bullet';
	if (est < 8 * 60_000) return 'Blitz';
	if (est < 25 * 60_000) return 'Rapid';
	return 'Classical';
}
