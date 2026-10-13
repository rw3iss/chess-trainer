// Icon path data. 24x24 viewBox, stroke-based (Lucide-like geometry, drawn for
// this app). Each entry is a function so every render gets fresh vnodes.

import type { JSX } from 'preact';

export const ICON_NAMES = [
	'play', 'pause', 'step-forward', 'step-back', 'first', 'last', 'flip', 'fork', 'save', 'bot',
	'star', 'star-filled', 'search', 'settings', 'close', 'menu', 'chevron-down', 'chevron-up',
	'chevron-left', 'chevron-right', 'more', 'plus', 'minus', 'trash', 'edit', 'note', 'check',
	'info', 'warning', 'board', 'book', 'games', 'sessions', 'sun', 'moon', 'monitor', 'wifi-off',
	'server', 'download', 'upload', 'copy', 'external', 'filter', 'sort', 'clock', 'user', 'undo',
	'redo', 'promote', 'eye', 'knight', 'speed', 'home', 'grid', 'list', 'logo',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const p = (...ds: string[]): JSX.Element => (
	<>
		{ds.map((d) => (
			<path d={d} />
		))}
	</>
);

const STAR = '12 2.5 15 8.6 21.7 9.6 16.8 14.3 18 21 12 17.8 6 21 7.2 14.3 2.3 9.6 9 8.6 12 2.5';

// Knight head facing left: muzzle at left, ear at top, mane curving down the back.
const KNIGHT_OUTLINE =
	'M8 18 L9.6 13.8 L7.3 14.7 C6 15.2 4.6 14.4 4.4 13.1 C4.2 12 4.8 11 5.7 10.4 L9.8 6.8 L10.4 3.8 L12.4 5.3 C16.4 5.9 19 9.4 18.6 14 L18.2 18 Z';

export const ICONS: Record<IconName, () => JSX.Element> = {
	play: () => <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />,
	pause: () => (
		<>
			<rect x="6" y="4" width="4" height="16" rx="1" />
			<rect x="14" y="4" width="4" height="16" rx="1" />
		</>
	),
	'step-forward': () => p('M5 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 5 5.5Z', 'M20 5v14'),
	'step-back': () => p('M19 5.5v13a1 1 0 0 1-1.5.86l-10-6.5a1 1 0 0 1 0-1.72l10-6.5A1 1 0 0 1 19 5.5Z', 'M4 5v14'),
	first: () => p('m17 18-6-6 6-6', 'M7 6v12'),
	last: () => p('m7 18 6-6-6-6', 'M17 6v12'),
	flip: () => p('m21 16-4 4-4-4', 'M17 20V4', 'm3 8 4-4 4 4', 'M7 4v16'),
	fork: () => (
		<>
			<circle cx="12" cy="18" r="3" />
			<circle cx="6" cy="6" r="3" />
			<circle cx="18" cy="6" r="3" />
			<path d="M18 9v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9" />
			<path d="M12 12v3" />
		</>
	),
	save: () =>
		p(
			'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
			'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7',
			'M7 3v4a1 1 0 0 0 1 1h7',
		),
	bot: () => (
		<>
			<path d="M12 8V4H8" />
			<rect x="4" y="8" width="16" height="12" rx="2" />
			<path d="M2 14h2" />
			<path d="M20 14h2" />
			<path d="M15 13v2" />
			<path d="M9 13v2" />
		</>
	),
	star: () => <polygon points={STAR} />,
	'star-filled': () => <polygon points={STAR} fill="currentColor" />,
	search: () => (
		<>
			<circle cx="11" cy="11" r="7.5" />
			<path d="m20.5 20.5-4.2-4.2" />
		</>
	),
	settings: () => (
		<>
			<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
			<circle cx="12" cy="12" r="3" />
		</>
	),
	close: () => p('M18 6 6 18', 'm6 6 12 12'),
	menu: () => p('M4 6h16', 'M4 12h16', 'M4 18h16'),
	'chevron-down': () => p('m6 9 6 6 6-6'),
	'chevron-up': () => p('m18 15-6-6-6 6'),
	'chevron-left': () => p('m15 18-6-6 6-6'),
	'chevron-right': () => p('m9 18 6-6-6-6'),
	more: () => (
		<>
			<circle cx="5" cy="12" r="1" />
			<circle cx="12" cy="12" r="1" />
			<circle cx="19" cy="12" r="1" />
		</>
	),
	plus: () => p('M5 12h14', 'M12 5v14'),
	minus: () => p('M5 12h14'),
	trash: () =>
		p(
			'M3 6h18',
			'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
			'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
			'M10 11v6',
			'M14 11v6',
		),
	edit: () =>
		p(
			'M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z',
			'm15 5 4 4',
		),
	note: () =>
		p('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'),
	check: () => p('M20 6 9 17l-5-5'),
	info: () => (
		<>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4" />
			<path d="M12 8h.01" />
		</>
	),
	warning: () => p('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'),
	board: () => (
		<>
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<path d="M9 3h6v6H9zM3 9h6v6H3zM15 9h6v6h-6zM9 15h6v6H9z" fill="currentColor" stroke="none" opacity="0.85" />
		</>
	),
	book: () => p('M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20', 'M9 7h6'),
	games: () =>
		p(
			'M14.5 17.5 3 6V3h3l11.5 11.5',
			'm13 19 6-6',
			'm16 16 4 4',
			'm19 21 2-2',
			'M14.5 6.5 18 3h3v3l-3.5 3.5',
			'm5 14 4 4',
			'm7 17-3 3',
			'm3 19 2 2',
		),
	sessions: () => p('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'),
	sun: () => (
		<>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</>
	),
	moon: () => p('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'),
	monitor: () => (
		<>
			<rect x="2" y="3" width="20" height="14" rx="2" />
			<path d="M8 21h8" />
			<path d="M12 17v4" />
		</>
	),
	'wifi-off': () =>
		p(
			'M12 20h.01',
			'M8.5 16.43a5 5 0 0 1 7 0',
			'M5 12.86a10 10 0 0 1 5.17-2.69',
			'M19 12.86a10 10 0 0 0-2-1.52',
			'M2 8.82a15 15 0 0 1 4.18-2.64',
			'M22 8.82a15 15 0 0 0-11.29-3.76',
			'm2 2 20 20',
		),
	server: () => (
		<>
			<rect x="2" y="2" width="20" height="8" rx="2" />
			<rect x="2" y="14" width="20" height="8" rx="2" />
			<path d="M6 6h.01" />
			<path d="M6 18h.01" />
		</>
	),
	download: () => p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'),
	upload: () => p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'),
	copy: () => (
		<>
			<rect x="8" y="8" width="14" height="14" rx="2" />
			<path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" />
		</>
	),
	external: () => p('M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'),
	filter: () => p('M22 3H2l8 9.46V19l4 2v-8.54L22 3z'),
	sort: () => p('m3 16 4 4 4-4', 'M7 20V4', 'M11 4h10', 'M11 8h7', 'M11 12h4'),
	clock: () => (
		<>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 6v6l4 2" />
		</>
	),
	user: () => (
		<>
			<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
			<circle cx="12" cy="7" r="4" />
		</>
	),
	undo: () => p('M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'),
	redo: () => p('M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7'),
	promote: () =>
		p(
			'M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.27-3.67a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.67a1 1 0 0 0 1.52-.3z',
			'M5 21h14',
		),
	eye: () => (
		<>
			<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
			<circle cx="12" cy="12" r="3" />
		</>
	),
	knight: () => (
		<>
			<path d={KNIGHT_OUTLINE} />
			<rect x="5.5" y="18" width="13" height="3.2" rx="1" />
			<path d="M9.2 9.6h.01" />
		</>
	),
	speed: () => p('m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'),
	home: () =>
		p(
			'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
			'M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
		),
	grid: () => (
		<>
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
		</>
	),
	list: () => p('M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'),
	// Filled knight mark: head with eye cut-out (evenodd) on a two-tier plinth.
	logo: () => (
		<g fill="currentColor" stroke="none">
			<path
				fill-rule="evenodd"
				d="M7.6 17.6 9.1 13.9 7.1 14.7C5.6 15.3 3.9 14.4 3.6 12.9 3.4 11.6 4 10.4 5.1 9.7L9.2 6.3 9.9 2.6 12.6 4.6C17 5.4 19.9 9.3 19.4 14.2L19 17.6Z M9.5 8.6a1 1 0 1 0 0.01 0Z"
			/>
			<path d="M12.6 6.6c2.6 1.1 4.3 3.7 4.1 7.4l-.2 2.2h-1.2l.2-2.3c.2-3-1.2-5.3-3.4-6.3z" fill-opacity="0.35" />
			<rect x="6.6" y="18.4" width="10.8" height="1.5" rx="0.6" />
			<rect x="5" y="20.4" width="14" height="1.8" rx="0.8" />
		</g>
	),
};
