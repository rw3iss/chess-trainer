// Settings building blocks: a titled group card and a label/control row.
import type { ComponentChildren, JSX } from 'preact';
import { cx } from '@/lib/classNames';

export interface SettingsGroupProps {
	title: string;
	description?: ComponentChildren;
	/** Right side of the group header (e.g. a Reset button). */
	actions?: ComponentChildren;
	class?: string;
	children?: ComponentChildren;
}

export function SettingsGroup({ title, description, actions, class: className, children }: SettingsGroupProps): JSX.Element {
	return (
		<section class={cx('settings-group', className)}>
			<header class="settings-group__head">
				<div class="settings-group__titles">
					<h3 class="settings-group__title">{title}</h3>
					{description && <p class="settings-group__desc">{description}</p>}
				</div>
				{actions && <div class="settings-group__actions">{actions}</div>}
			</header>
			<div class="settings-group__body">{children}</div>
		</section>
	);
}

export interface SettingsRowProps {
	label: string;
	hint?: ComponentChildren;
	/** Stack the control under the label (wide controls). */
	stacked?: boolean;
	class?: string;
	children?: ComponentChildren;
}

export function SettingsRow({ label, hint, stacked, class: className, children }: SettingsRowProps): JSX.Element {
	return (
		<div class={cx('settings-row', stacked && 'settings-row--stacked', className)}>
			<div class="settings-row__text">
				<span class="settings-row__label">{label}</span>
				{hint && <span class="settings-row__hint">{hint}</span>}
			</div>
			<div class="settings-row__control">{children}</div>
		</div>
	);
}

export interface SectionHeaderProps {
	title: string;
	description?: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps): JSX.Element {
	return (
		<header class="settings-section__head">
			<h2 class="settings-section__title">{title}</h2>
			{description && <p class="settings-section__desc">{description}</p>}
		</header>
	);
}
