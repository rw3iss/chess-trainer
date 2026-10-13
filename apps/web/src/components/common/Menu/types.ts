import type { IconName } from '../Icon';

export type MenuItem =
	| {
			id: string;
			label: string;
			icon?: IconName;
			shortcut?: string;
			danger?: boolean;
			disabled?: boolean;
			checked?: boolean;
			onSelect: () => void;
	  }
	| { separator: true }
	| { heading: string };

export type MenuActionItem = Extract<MenuItem, { id: string }>;

export type MenuCloseReason = 'select' | 'escape' | 'tab' | 'outside';

export function isActionItem(item: MenuItem): item is MenuActionItem {
	return 'id' in item;
}
