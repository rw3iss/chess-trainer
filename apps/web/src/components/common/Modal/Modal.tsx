import type { ComponentChildren, JSX } from 'preact';
import { useId, useRef } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { IconButton } from '../IconButton';
import { Portal, useOverlayLayer, usePresence } from '../Portal';
import './Modal.scss';

export interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: string;
	description?: string;
	size?: 'sm' | 'md' | 'lg';
	footer?: ComponentChildren;
	class?: string;
	/** CSS selector (inside the dialog) to focus on open. */
	initialFocus?: string;
	children?: ComponentChildren;
}

export const MODAL_EXIT_MS = 180;

export function Modal({ open, onClose, title, description, size = 'md', footer, class: className, initialFocus, children }: ModalProps): JSX.Element | null {
	const { mounted, state } = usePresence(open, MODAL_EXIT_MS);
	const dialogRef = useRef<HTMLDivElement>(null);
	const id = useId();
	const titleId = `mdl-${id}-t`;
	const descId = `mdl-${id}-d`;

	useOverlayLayer(open, onClose, { lockScroll: true });
	useFocusTrap(dialogRef, open && mounted, { initialFocus });

	if (!mounted) return null;

	return (
		<Portal>
			<div class="modal-layer" data-state={state}>
				<div class="modal-layer__backdrop" aria-hidden="true" onClick={onClose} />
				<div
					ref={dialogRef}
					class={cx('modal', `modal--${size}`, className)}
					role="dialog"
					aria-modal="true"
					aria-labelledby={title ? titleId : undefined}
					aria-describedby={description ? descId : undefined}
					tabIndex={-1}
				>
					{(title || description) && (
						<header class="modal__header">
							<div class="modal__heading">
								{title && (
									<h2 class="modal__title" id={titleId}>
										{title}
									</h2>
								)}
								{description && (
									<p class="modal__description" id={descId}>
										{description}
									</p>
								)}
							</div>
							<IconButton icon="close" label="Close" size="sm" class="modal__close" onClick={onClose} />
						</header>
					)}
					{!title && !description && <IconButton icon="close" label="Close" size="sm" class="modal__close modal__close--floating" onClick={onClose} />}
					<div class="modal__body">{children}</div>
					{footer && <footer class="modal__footer">{footer}</footer>}
				</div>
			</div>
		</Portal>
	);
}
