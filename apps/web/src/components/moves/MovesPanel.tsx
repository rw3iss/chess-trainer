// MovesPanel — the '/' panel for the active session: OpeningHeader · MoveList · NotesCard.
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { getNode } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import { sessionsActions } from '@/state/sessions';
import { describeMove } from '@/lib/format';
import { toast } from '@/services/toast';
import { MoveList, type MoveListActions } from './MoveList';
import { OpeningHeader } from './OpeningHeader';
import { NotesCard } from './NotesCard';
import { NoteEditorModal } from './NoteEditorModal';
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
		promote: (id) => sessionsActions.promoteVariation(id, session.id),
		editNote: (id) => setNoteFor(id),
	};

	return (
		<div class="moves-panel">
			<OpeningHeader session={session} />
			<div class="moves-panel__list">
				<MoveList session={session} actions={actions} />
			</div>
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
