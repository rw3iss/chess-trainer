// /settings/:section (PLAN §4.3 "Settings"). Desktop: section nav beside the
// content inside the wide panel. Mobile (stacked): /settings shows the section
// list; /settings/:section shows one section with a back link.
import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation, useRoute } from 'preact-iso';
import { Icon } from '@/components/common/Icon';
import { useIsStacked } from '@/hooks/useMediaQuery';
import { cx } from '@/lib/classNames';
import { DEFAULT_SECTION, SETTINGS_SECTIONS, findSection } from './sections';
import './Settings.scss';

function SectionList({ current, onPick, variant }: { current?: string; onPick: (id: string) => void; variant: 'nav' | 'list' }): JSX.Element {
	return (
		<nav class={cx('settings-nav', `settings-nav--${variant}`)} aria-label="Settings sections">
			<ul role="list">
				{SETTINGS_SECTIONS.map((s) => (
					<li key={s.id}>
						<a
							href={`/settings/${s.id}`}
							class={cx('settings-nav__item', current === s.id && 'settings-nav__item--active')}
							aria-current={current === s.id ? 'page' : undefined}
							onClick={(e) => {
								e.preventDefault();
								onPick(s.id);
							}}
						>
							<Icon name={s.icon} size={18} class="settings-nav__icon" />
							<span class="settings-nav__text">
								<span class="settings-nav__label">{s.label}</span>
								{variant === 'list' && <span class="settings-nav__summary">{s.summary}</span>}
							</span>
							{variant === 'list' && <Icon name="chevron-right" size={16} class="settings-nav__chevron" />}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}

export default function Settings(): JSX.Element {
	const { params } = useRoute();
	const { route } = useLocation();
	const stacked = useIsStacked();
	const contentRef = useRef<HTMLDivElement>(null);
	const requested = params.section;
	const section = findSection(requested) ?? (stacked ? undefined : findSection(DEFAULT_SECTION));
	const pick = (id: string) => route(`/settings/${id}`);

	// Unknown section → canonical URL.
	useEffect(() => {
		if (requested && !findSection(requested)) route(`/settings/${DEFAULT_SECTION}`, true);
	}, [requested]);

	// New section → scroll its content to the top.
	useEffect(() => {
		contentRef.current?.scrollTo?.({ top: 0 });
		contentRef.current?.closest('.shell__route')?.scrollTo?.({ top: 0 });
	}, [section?.id]);

	if (stacked && !section) {
		return (
			<div class="settings settings--list">
				<h1 class="settings__title">Settings</h1>
				<SectionList onPick={pick} variant="list" />
			</div>
		);
	}

	const Section = section?.component;
	return (
		<div class={cx('settings', stacked ? 'settings--single' : 'settings--split')}>
			{stacked ? (
				<button type="button" class="settings__back" onClick={() => route('/settings')}>
					<Icon name="chevron-left" size={16} />
					All settings
				</button>
			) : (
				<aside class="settings__aside">
					<h1 class="settings__title">Settings</h1>
					<SectionList current={section?.id} onPick={pick} variant="nav" />
				</aside>
			)}
			<div class="settings__content" ref={contentRef}>
				{Section && <Section />}
			</div>
		</div>
	);
}
