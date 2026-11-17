// MovesPanel — the '/' panel for the active session: OpeningHeader · MoveList · "Clear board" ·
// movesSlots.afterList (variations) · NotesCard.
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { ROOT_ID, getNode } from '@chess/core/chess';
import { Button } from '@/components/common/Button';
import { getUISetting } from '@/lib/uiSettings';
import { navigate } from '@/lib/navigate';
import { isBoardLinkPath, openingPath, shareLink } from '@/lib/openingLinks';
import { openingIndex } from '@/state/openings';
import { lineStatus } from '@/components/openings/lineStatus';
import type { Session } from '@chess/core/game';
import { sessionsActions } from '@/state/sessions';
import { describeMove } from '@/lib/format';
import { toast } from '@/services/toast';
import { MoveList, type MoveListActions } from './MoveList';
import { OpeningHeader } from './OpeningHeader';
import { NotesCard } from './NotesCard';
import { NoteEditorModal } from './NoteEditorModal';
import { movesSlots } from './movesSlots';
import './MovesPanel.scss';

export function MovesPanel({ session }: { session: Session }): JSX.Element {
	const [noteFor, setNoteFor] = useState<string | null>(null);
	const noteNode = noteFor ? session.tree.nodes[noteFor] : undefined;
	const fen = getNode(session.tree, session.cursor).fen;

	const actions: MoveListActions = {
		goto: (id) => sessionsActions.goto(id, session.id),
		fork: (id) => {
			if (sessionsActions.fork(session.id, id)) toast.info('Forked into a new session', { id: 'fork' });
		},
		deleteFrom: (id) => {
			const before = session;
			sessionsActions.deleteFrom(id, session.id);
			toast.show({
				message: 'Moves deleted',
				action: { label: 'Undo', onClick: () => sessionsActions.replace(before) },
			});
		},
		loadFrom: (id) => {
			const before = session;
			const index = openingIndex.value;
			const onLink = isBoardLinkPath(location.pathname);
			// The opening the shorter line reaches (its "built on") becomes the session's opening.
			const st = index ? lineStatus(index, session.tree, id) : undefined;
			const exact = st?.base && st.extra === 0 ? st.base : undefined;
			const source =
				session.source.kind === 'opening' && st?.base
					? { openingId: st.base.id }
					: onLink && exact
						? { kind: 'opening' as const, openingId: exact.id }
						: undefined;
			const next = sessionsActions.cutAfter(id, session.id, { source });
			// On a board link: the address follows the shorter line (its opening, or its line code).
			if (next && onLink) navigate(exact && index ? openingPath(index, exact) : (shareLink(index, next)?.path ?? '/'), { replace: true });
			toast.show({
				message: `Loaded from ${describeMove(session.tree.nodes[id]!.ply, session.tree.nodes[id]!.san)}`,
				action: { label: 'Undo', onClick: () => sessionsActions.replace(before) },
			});
		},
		promote: (id) => sessionsActions.promoteVariation(id, session.id),
		editNote: (id) => setNoteFor(id),
	};

	const empty = session.tree.nodes[ROOT_ID]!.children.length === 0 && session.source.kind === 'new';
	const clear = () => {
		const before = session;
		// "Flip board" on → back to White's side (as a new game); off → keep the current side.
		sessionsActions.clear(session.id, { orientation: getUISetting('openings.flipBoard') ? 'white' : session.orientation });
		// No opening any more: leave its address.
		if (isBoardLinkPath(location.pathname)) navigate('/', { replace: true });
		toast.show({
			message: 'Board cleared',
			action: { label: 'Undo', onClick: () => sessionsActions.replace(before) },
		});
	};

	return (
		<div class="moves-panel">
			<OpeningHeader session={session} />
			<div class="moves-panel__list">
				<MoveList session={session} actions={actions} />
			</div>
			<div class="moves-panel__actions">
				<Button variant="ghost" size="sm" icon="undo" disabled={empty} onClick={clear} title="Start position, no moves, no opening">
					Clear board
				</Button>
			</div>
			<movesSlots.afterList.Render session={session} />
			<NotesCard fen={fen} />
			<NoteEditorModal
				open={!!noteNode}
				moveLabel={noteNode ? describeMove(noteNode.ply, noteNode.san) : ''}
				initial={noteNode?.userNote ?? ''}
				onSave={(t) => noteNode && sessionsActions.setUserNote(noteNode.id, t, session.id)}
				onClose={() => setNoteFor(null)}
			/>
		</div>
	);
}
