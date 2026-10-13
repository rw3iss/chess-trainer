// New game (PLAN §4.3 "Local player vs player"): mode Analysis / Local 2-player /
// vs Bot, start position (initial / current / FEN), and for local games a clock
// (time control), auto-flip and tabletop. vs Bot creates the session and hands
// off to the 'openBot' command.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, Modal, SegmentedControl } from '@/components/common';
import { activeSession } from '@/state/sessions';
import { settings } from '@/state/settings';
import { buildNewGamePlan, initialNewGameForm, validateNewGame, type NewGameForm, type NewGameMode } from './newGameForm';
import { PvpSetupFields, StartPositionField } from './SetupFields';
import { startNewGame } from './startNewGame';
import './NewGameModal.scss';

export interface NewGameModalProps {
	open: boolean;
	onClose: () => void;
	/** Preselected mode when opening. */
	mode?: NewGameMode;
}

const MODE_OPTIONS: { value: NewGameMode; label: string; icon: 'board' | 'user' | 'bot' }[] = [
	{ value: 'analysis', label: 'Analysis', icon: 'board' },
	{ value: 'local-pvp', label: '2 players', icon: 'user' },
	{ value: 'bot', label: 'vs Bot', icon: 'bot' },
];

const MODE_HINT: Record<NewGameMode, string> = {
	analysis: 'Free analysis: move both sides, branch into variations.',
	'local-pvp': 'Two players on this device, with an optional chess clock.',
	bot: 'Pick an engine and strength next.',
};

export function NewGameModal({ open, onClose, mode }: NewGameModalProps): JSX.Element | null {
	const current = activeSession.value;
	const currentFen = current ? (current.tree.nodes[current.cursor]?.fen ?? null) : null;
	const [form, setForm] = useState<NewGameForm>(() => initialNewGameForm(settings.value.clock, mode));
	const [touched, setTouched] = useState(false);

	useEffect(() => {
		if (!open) return;
		setForm(initialNewGameForm(settings.value.clock, mode));
		setTouched(false);
	}, [open]);

	const set = (patch: Partial<NewGameForm>) => setForm((f) => ({ ...f, ...patch }));
	const error = validateNewGame(form, currentFen);
	const start = () => {
		setTouched(true);
		if (error) return;
		const plan = buildNewGamePlan(form, currentFen);
		onClose();
		startNewGame(plan);
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="New game"
			size="md"
			class="new-game"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" icon={form.mode === 'bot' ? 'bot' : 'play'} onClick={start} disabled={touched && !!error}>
						{form.mode === 'bot' ? 'Next: bot' : 'Start'}
					</Button>
				</>
			}
		>
			<form
				class="new-game__body"
				onSubmit={(e) => {
					e.preventDefault();
					start();
				}}
			>
				<div class="new-game__field">
					<span class="new-game__label">Mode</span>
					<SegmentedControl options={MODE_OPTIONS} value={form.mode} onChange={(m) => set({ mode: m })} ariaLabel="Mode" />
					<p class="new-game__hint">{MODE_HINT[form.mode]}</p>
				</div>

				<StartPositionField
					form={form}
					set={set}
					hasCurrent={!!currentFen}
					error={touched || form.fen.trim() ? (error ?? undefined) : undefined}
				/>

				{form.mode === 'local-pvp' && <PvpSetupFields form={form} set={set} />}
				<button type="submit" hidden aria-hidden="true" tabIndex={-1} />
			</form>
		</Modal>
	);
}
