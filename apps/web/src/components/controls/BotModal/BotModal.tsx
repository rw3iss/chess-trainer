// Play with Bot (PLAN §4.3): engine, target Elo (presets), your colour, think
// time, optional clock, takebacks. Start attaches the bot to the session from
// its current position; when the session already plays a bot, the modal edits
// it (Update) or detaches it.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { CLOCK_PRESETS } from '@chess/core/clock';
import type { Session } from '@chess/core/game';
import { Button, Input, Modal, SegmentedControl, Select, Slider, Toggle } from '@/components/common';
import { botActions, engineEntries, enginesActions, enginesLoaded, sessionsActions, settings } from '@/state';
import { cx } from '@/lib/classNames';
import {
	ELO_PRESETS,
	THINK_CHOICES,
	clampElo,
	initialForm,
	presetElo,
	presetEnabled,
	toSetup,
	type BotFormState,
	type ThinkChoice,
	type UserColor,
} from './botForm';
import './BotModal.scss';

export interface BotModalProps {
	open: boolean;
	onClose: () => void;
	session: Session | null;
}

const COLOR_OPTIONS: { value: UserColor; label: string }[] = [
	{ value: 'white', label: 'White' },
	{ value: 'black', label: 'Black' },
	{ value: 'random', label: 'Random' },
];

const CLOCK_OPTIONS = CLOCK_PRESETS.map((p) => ({ value: p.id, label: p.label }));

export function BotModal({ open, onClose, session }: BotModalProps): JSX.Element | null {
	const entries = engineEntries.value;
	const metaOf = (id: string) => entries.find((e) => e.meta.id === id)?.meta;
	const defaults = settings.value.engine;
	const editing = session?.mode === 'bot' && !!session.bot;
	const [form, setForm] = useState<BotFormState>(() => initialForm(session, { engineId: defaults.defaultEngineId, elo: defaults.defaultElo, think: defaults.think }, metaOf));

	// Fresh form each time the modal opens; refresh availability.
	useEffect(() => {
		if (!open) return;
		setForm(initialForm(session, { engineId: defaults.defaultEngineId, elo: defaults.defaultElo, think: defaults.think }, metaOf));
		if (!enginesLoaded.value) void enginesActions.refresh();
	}, [open]);

	const available = entries.filter((e) => e.availability.available);
	const unavailable = entries.filter((e) => !e.availability.available);
	const selected = entries.find((e) => e.meta.id === form.engineId);
	// Fall back to the first available engine when the chosen one is not usable.
	useEffect(() => {
		if (!open || !entries.length) return;
		if (!selected?.availability.available && available[0]) {
			const range = available[0].meta.eloRange;
			setForm((f) => ({ ...f, engineId: available[0]!.meta.id, elo: clampElo(f.elo, range) }));
		}
	}, [open, entries, form.engineId]);

	const range: [number, number] = selected?.meta.eloRange ?? [400, 3190];
	const set = (patch: Partial<BotFormState>) => setForm((f) => ({ ...f, ...patch }));
	const engineOptions = useMemo(() => available.map((e) => ({ value: e.meta.id, label: `${e.meta.name}${e.meta.kind === 'remote' ? ' (server)' : ''}` })), [entries]);
	const canStart = !!selected?.availability.available;

	const start = () => {
		if (!canStart) return;
		const target = session ?? sessionsActions.newSession();
		botActions.attach(toSetup(form), target.id);
		onClose();
	};
	const detach = () => {
		if (session) botActions.detach(session.id);
		onClose();
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={editing ? 'Bot game' : 'Play with a bot'}
			description={editing ? 'Change the bot or go back to analysis.' : 'The bot continues from the position on the board.'}
			size="md"
			class="bot-modal"
			footer={
				<div class="bot-modal__footer">
					{editing && (
						<Button variant="ghost" icon="close" onClick={detach} class="bot-modal__detach">
							Detach
						</Button>
					)}
					<span class="bot-modal__spacer" />
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" icon="bot" onClick={start} disabled={!canStart}>
						{editing ? 'Update' : 'Start'}
					</Button>
				</div>
			}
		>
			<div class="bot-modal__body">
				<section class="bot-modal__group">
					{engineOptions.length ? (
						<Select
							label="Engine"
							value={form.engineId}
							options={engineOptions}
							onChange={(id) => {
								const r = entries.find((e) => e.meta.id === id)?.meta.eloRange ?? range;
								set({ engineId: id, elo: clampElo(form.elo, r) });
							}}
						/>
					) : (
						<p class="bot-modal__note">{enginesLoaded.value ? 'No engine is available.' : 'Loading engines…'}</p>
					)}
					{selected && (
						<p class="bot-modal__note">
							{selected.meta.humanLike ? 'Human-like play. ' : ''}
							Strength {selected.meta.eloRange[0]}–{selected.meta.eloRange[1]}.
						</p>
					)}
					{unavailable.length > 0 && (
						<details class="bot-modal__unavailable">
							<summary>
								{unavailable.length} other engine{unavailable.length === 1 ? '' : 's'} not available
							</summary>
							<ul>
								{unavailable.map((e) => (
									<li key={e.meta.id}>
										<span class="bot-modal__unavail-name">{e.meta.name}</span>
										<span class="bot-modal__unavail-reason">{e.availability.message ?? 'Unavailable'}</span>
									</li>
								))}
							</ul>
						</details>
					)}
				</section>

				<section class="bot-modal__group">
					<Slider label="Target Elo" min={range[0]} max={range[1]} step={50} value={form.elo} onChange={(elo) => set({ elo })} format={(v) => String(v)} />
					<div class="bot-modal__presets" role="group" aria-label="Strength presets">
						{ELO_PRESETS.map((p) => {
							const elo = presetElo(p, range);
							const enabled = presetEnabled(p, range);
							return (
								<button
									key={p.id}
									type="button"
									class={cx('bot-modal__preset', enabled && form.elo === elo && 'bot-modal__preset--active')}
									disabled={!enabled}
									aria-pressed={enabled && form.elo === elo}
									title={enabled ? `${elo}` : `Outside ${selected?.meta.name ?? 'this engine'}'s range`}
									onClick={() => set({ elo })}
								>
									<span class="bot-modal__preset-label">{p.label}</span>
									<span class="bot-modal__preset-elo">{p.elo ?? elo}</span>
								</button>
							);
						})}
					</div>
				</section>

				<section class="bot-modal__group bot-modal__row">
					<div class="bot-modal__field">
						<span class="bot-modal__label">You play</span>
						<SegmentedControl ariaLabel="Your colour" options={COLOR_OPTIONS} value={form.userColor} onChange={(userColor) => set({ userColor })} />
					</div>
				</section>

				<section class="bot-modal__group">
					<div class="bot-modal__field">
						<span class="bot-modal__label">Think time</span>
						<SegmentedControl<ThinkChoice> ariaLabel="Think time" size="sm" options={THINK_CHOICES} value={form.think} onChange={(think) => set({ think })} />
					</div>
					{form.think === 'custom' && (
						<Input
							label="Milliseconds per move"
							type="number"
							min={20}
							max={60000}
							step={50}
							value={String(form.customMs)}
							onInput={(e) => set({ customMs: Number((e.currentTarget as HTMLInputElement).value) || 0 })}
							trailing={<span class="bot-modal__unit">ms</span>}
						/>
					)}
				</section>

				<section class="bot-modal__group">
					<Toggle checked={form.clockOn} onChange={(clockOn) => set({ clockOn })} label="Use a clock" description="Time control for both sides." />
					{form.clockOn && <Select label="Time control" value={form.clockPreset} options={CLOCK_OPTIONS} onChange={(clockPreset) => set({ clockPreset })} />}
					<Toggle checked={form.allowTakebacks} onChange={(allowTakebacks) => set({ allowTakebacks })} label="Allow takebacks" description="Undo your last move and the bot's reply." />
				</section>
			</div>
		</Modal>
	);
}
