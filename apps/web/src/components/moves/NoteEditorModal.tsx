// Modal for editing a MOVE's user note (MoveNode.userNote) from the move list menu.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Textarea } from '@/components/common/Input';

export interface NoteEditorModalProps {
	open: boolean;
	moveLabel: string;
	initial: string;
	onSave: (text: string) => void;
	onClose: () => void;
}

export function NoteEditorModal({ open, moveLabel, initial, onSave, onClose }: NoteEditorModalProps): JSX.Element {
	const [text, setText] = useState(initial);
	useEffect(() => {
		if (open) setText(initial);
	}, [open, initial]);
	const save = () => {
		onSave(text);
		onClose();
	};
	return (
		<Modal
			open={open}
			onClose={onClose}
			title={`Note on ${moveLabel}`}
			description="Shown inline in the move list and exported as a PGN comment."
			size="sm"
			initialFocus="textarea"
			footer={
				<>
					{initial && (
						<Button variant="ghost" onClick={() => (onSave(''), onClose())}>
							Remove
						</Button>
					)}
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" onClick={save}>
						Save note
					</Button>
				</>
			}
		>
			<Textarea
				value={text}
				rows={4}
				placeholder="Why this move? What to watch for?"
				onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
				}}
			/>
		</Modal>
	);
}
