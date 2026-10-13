// SaveModal (PLAN §3 Save rules). Linked session → clear choice between
// "Overwrite '<name>'" and "Save as new copy"; first save is always new.
// Fields: name, tags, notes. Rendered by SaveModalHost (remounted per request).
import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { Session } from '@chess/core/game';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Input, Textarea } from '@/components/common/Input';
import { Icon } from '@/components/common/Icon';
import { toast } from '@/services/toast';
import { savedGames } from '@/state/savedGames';
import { cx } from '@/lib/classNames';
import { formatRelativeTime } from '@/lib/format';
import { TagsInput } from './TagsInput';
import { linkedGame, submitSave, suggestedName, type SaveChoice } from './saveModalState';
import './SaveModal.scss';

export interface SaveModalProps {
	open: boolean;
	session: Session | null;
	initialChoice: SaveChoice;
	onClose: () => void;
}

interface Draft {
	name: string;
	tags: string[];
	notes: string;
}

function draftFor(session: Session, choice: SaveChoice): Draft {
	const linked = linkedGame(session);
	if (choice === 'overwrite' && linked) return { name: linked.name, tags: [...linked.tags], notes: linked.notes ?? '' };
	if (linked) return { name: `${linked.name} (copy)`, tags: [...linked.tags], notes: linked.notes ?? '' };
	return { name: suggestedName(session), tags: [], notes: '' };
}

export function SaveModal({ open, session, initialChoice, onClose }: SaveModalProps): JSX.Element {
	const linked = linkedGame(session);
	// State is initialised once per request: the host remounts this component (key) for each open.
	const [choice, setChoice] = useState<SaveChoice>(() => (linked ? initialChoice : 'new'));
	const [draft, setDraft] = useState<Draft>(() => (session ? draftFor(session, linked ? initialChoice : 'new') : { name: '', tags: [], notes: '' }));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const allTags = useMemo(() => [...new Set(savedGames.value.flatMap((g) => g.tags))].sort((a, b) => a.localeCompare(b)), [savedGames.value]);

	const pick = (c: SaveChoice) => {
		if (!session || c === choice) return;
		setChoice(c);
		setDraft(draftFor(session, c));
	};

	const submit = async (e?: Event) => {
		e?.preventDefault();
		if (!session || busy) return;
		const name = draft.name.trim();
		if (!name) {
			setError('Give the game a name');
			return;
		}
		setBusy(true);
		try {
			const g = await submitSave({ sessionId: session.id, choice, name, tags: draft.tags, notes: draft.notes });
			if (g) toast.success(choice === 'overwrite' && linked ? `Saved “${g.name}”` : `Saved new game “${g.name}”`, { id: 'save' });
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const overwrite = choice === 'overwrite' && !!linked;
	const title = linked ? 'Save game' : 'Save new game';

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={title}
			description={session?.dirty ? 'This session has unsaved changes.' : undefined}
			class="save-modal"
			initialFocus={linked ? '.save-modal__choice[aria-checked="true"]' : '.save-modal__name input'}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" icon="save" loading={busy} onClick={() => void submit()}>
						{overwrite ? 'Overwrite' : linked ? 'Save copy' : 'Save game'}
					</Button>
				</>
			}
		>
			<form class="save-modal__form" onSubmit={(e) => void submit(e)}>
				{linked && (
					<div class="save-modal__choices" role="radiogroup" aria-label="How to save">
						<button
							type="button"
							role="radio"
							aria-checked={choice === 'overwrite'}
							class={cx('save-modal__choice', choice === 'overwrite' && 'save-modal__choice--on')}
							onClick={() => pick('overwrite')}
						>
							<Icon name="save" size={18} class="save-modal__choice-icon" />
							<span class="save-modal__choice-text">
								<span class="save-modal__choice-title">Overwrite “{linked.name}”</span>
								<span class="save-modal__choice-desc">Replace the saved game · last saved {formatRelativeTime(linked.updatedAt)}</span>
							</span>
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={choice === 'new'}
							class={cx('save-modal__choice', choice === 'new' && 'save-modal__choice--on')}
							onClick={() => pick('new')}
						>
							<Icon name="copy" size={18} class="save-modal__choice-icon" />
							<span class="save-modal__choice-text">
								<span class="save-modal__choice-title">Save as new copy</span>
								<span class="save-modal__choice-desc">Keep “{linked.name}” and link this session to the copy</span>
							</span>
						</button>
					</div>
				)}
				<Input
					class="save-modal__name"
					label="Name"
					value={draft.name}
					maxLength={120}
					error={error}
					onInput={(e) => {
						setDraft({ ...draft, name: e.currentTarget.value });
						if (error) setError(undefined);
					}}
				/>
				<TagsInput value={draft.tags} suggestions={allTags} onChange={(tags) => setDraft({ ...draft, tags })} />
				<Textarea label="Notes" rows={3} value={draft.notes} placeholder="Ideas, plans, where you went wrong…" onInput={(e) => setDraft({ ...draft, notes: e.currentTarget.value })} />
				{/* Enter in the name field submits. */}
				<button type="submit" class="visually-hidden" tabIndex={-1}>
					Save
				</button>
			</form>
		</Modal>
	);
}
