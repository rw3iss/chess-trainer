// Step through a line: |◀ ◀ [5.Nc3] ▶ ▶| plus a range scrubber.
import type { JSX } from 'preact';
import { IconButton } from '@/components/common/IconButton';
import { Slider } from '@/components/common/Slider';
import { cx } from '@/lib/classNames';
import { plyLabel } from './format';
import './PlyScrubber.scss';

export interface PlyScrubberProps {
	ply: number;
	san: readonly string[];
	onChange: (ply: number) => void;
	/** 'compact' = one row: ◀ [range] ▶ label (preview cards). */
	variant?: 'full' | 'compact';
	class?: string;
}

export function PlyScrubber({ ply, san, onChange, variant = 'full', class: className }: PlyScrubberProps): JSX.Element {
	const plies = san.length;
	if (variant === 'compact') {
		return (
			<div class={cx('ply-scrubber', 'ply-scrubber--compact', className)}>
				<IconButton icon="step-back" label="Previous move" size="sm" disabled={ply <= 0} onClick={() => onChange(ply - 1)} />
				<Slider class="ply-scrubber__range" min={0} max={plies} value={ply} onChange={onChange} showValue={false} ariaLabel="Scrub through the line" />
				<IconButton icon="step-forward" label="Next move" size="sm" disabled={ply >= plies} onClick={() => onChange(ply + 1)} />
				<span class="ply-scrubber__label" aria-live="polite">
					{plyLabel(san, ply)}
				</span>
			</div>
		);
	}
	return (
		<div class={cx('ply-scrubber', className)}>
			<div class="ply-scrubber__buttons">
				<IconButton icon="first" label="Line start" size="sm" disabled={ply <= 0} onClick={() => onChange(0)} />
				<IconButton icon="step-back" label="Previous move" size="sm" disabled={ply <= 0} onClick={() => onChange(ply - 1)} />
				<span class="ply-scrubber__label" aria-live="polite">
					{plyLabel(san, ply)}
				</span>
				<IconButton icon="step-forward" label="Next move" size="sm" disabled={ply >= plies} onClick={() => onChange(ply + 1)} />
				<IconButton icon="last" label="Line end" size="sm" disabled={ply >= plies} onClick={() => onChange(plies)} />
			</div>
			{plies > 1 && <Slider class="ply-scrubber__range" min={0} max={plies} value={ply} onChange={onChange} showValue={false} ariaLabel="Scrub through the line" />}
		</div>
	);
}
