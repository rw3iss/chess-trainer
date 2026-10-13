// Renders children into a shared, lazily-created #portal-root on <body>.
// Every overlay (Modal, Sheet, Menu, ContextMenu, Tooltip) goes through here.

import type { ComponentChildren, JSX } from 'preact';
import { createPortal } from 'preact/compat';

const ROOT_ID = 'portal-root';

/** Returns the shared portal container, creating it on first use. */
export function getPortalRoot(): HTMLElement {
	let root = document.getElementById(ROOT_ID);
	if (!root) {
		root = document.createElement('div');
		root.id = ROOT_ID;
		document.body.appendChild(root);
	}
	return root;
}

export interface PortalProps {
	children?: ComponentChildren;
}

export function Portal({ children }: PortalProps): JSX.Element | null {
	if (typeof document === 'undefined') return null;
	return createPortal(children, getPortalRoot());
}
