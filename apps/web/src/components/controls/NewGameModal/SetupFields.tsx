// New-game fields shared by the NewGameModal and the Play page:
// start position (initial / current / FEN) and the local 2-player options (clock, tabletop, flip).
import type { JSX } from 'preact';
import { Input, SegmentedControl, Toggle } from '@/components/common';
import { ClockConfigForm } from '@/components/clock';
import type { NewGameForm, StartPosition } from './newGameForm';
import './NewGameModal.scss';

interface FieldsProps {
	form: NewGameForm;
	set: (patch: Partial<NewGameForm>) => void;
}

export function StartPositionField({ form, set, hasCurrent, error }: FieldsProps & { hasCurrent: boolean; error?: string }): JSX.Element {
	const options: { value: StartPosition; label: string }[] = [
		{ value: 'initial', label: 'Initial' },
		...(hasCurrent ? [{ value: 'current' as const, label: 'Current' }] : []),
		{ value: 'fen', label: 'FEN' },
	];
	return (
		<div class="new-game__field">
			<span class="new-game__label">Start position</span>
			<SegmentedControl options={options} value={form.start} onChange={(v) => set({ start: v })} ariaLabel="Start position" size="sm" />
			{form.start === 'fen' && (
				<Input
					label="FEN"
					placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
					value={form.fen}
					onInput={(e) => set({ fen: (e.target as HTMLInputElement).value })}
					error={error}
					spellcheck={false}
					autoComplete="off"
					class="new-game__fen"
				/>
			)}
		</div>
	);
}

export function PvpSetupFields({ form, set }: FieldsProps): JSX.Element {
	return (
		<div class="new-game__group">
			<Toggle checked={form.clockOn} onChange={(v) => set({ clockOn: v })} label="Chess clock" description="Each side's clock runs on its turn; flag = loss on time." />
			{form.clockOn && <ClockConfigForm value={form.clock} onChange={(clock) => set({ clock })} />}
			<Toggle
				checked={form.tabletop}
				onChange={(v) => set({ tabletop: v })}
				label="Tabletop"
				description="Face-to-face on one device: the top clock is rotated toward the far player."
			/>
			<Toggle
				checked={form.autoFlip && !form.tabletop}
				disabled={form.tabletop}
				onChange={(v) => set({ autoFlip: v })}
				label="Flip board each move"
				description="The side to move always plays from the bottom."
			/>
		</div>
	);
}
