// Route table (preact-iso, lazy). Routes only swap SIDE-PANEL content; the board
// stage never unmounts (PLAN §4.1). To add a page: create src/pages/<Name>/,
// add an entry here. `layout` controls the panel:
//   'panel' — normal side panel (desktop) / inline below the board (mobile)
//   'wide'  — wider side panel (board shrinks) / full-height sheet on mobile
//   'sheet' — normal width on desktop, full-height sheet on mobile
import { lazy } from 'preact-iso';
import type { ComponentType } from 'preact';
import type { IconName } from '@/components/common/Icon';

export type RouteLayout = 'panel' | 'wide' | 'sheet';

export interface AppRoute {
	path: string;
	component: ComponentType<Record<string, unknown>>;
	layout: RouteLayout;
	/** Title for the mobile sheet header / document title. */
	title: string;
}

export interface PanelTab {
	id: string;
	label: string;
	icon: IconName;
	/** Route this tab navigates to; tabs without a route render `panelSlot` content inline. */
	href?: string;
	/** Paths (prefix match) that light this tab up. */
	match?: (path: string) => boolean;
}

const Home = lazy(() => import('@/pages/Home/Home'));
const Openings = lazy(() => import('@/pages/Openings/Openings'));
const OpeningDetail = lazy(() => import('@/pages/OpeningDetail/OpeningDetail'));
const Games = lazy(() => import('@/pages/Games/Games'));
const Sessions = lazy(() => import('@/pages/Sessions/Sessions'));
const Settings = lazy(() => import('@/pages/Settings/Settings'));
const Play = lazy(() => import('@/pages/Play/Play'));
const QuickPlay = lazy(() => import('@/pages/QuickPlay/QuickPlay'));
const NotFound = lazy(() => import('@/pages/NotFound/NotFound'));

export const ROUTES: AppRoute[] = [
	{ path: '/', component: Home, layout: 'panel', title: 'Moves' },
	{ path: '/openings', component: Openings, layout: 'sheet', title: 'Openings' },
	{ path: '/openings/:id', component: OpeningDetail, layout: 'sheet', title: 'Opening' },
	{ path: '/games', component: Games, layout: 'sheet', title: 'Saved games' },
	{ path: '/sessions', component: Sessions, layout: 'wide', title: 'Open sessions' },
	{ path: '/settings', component: Settings, layout: 'wide', title: 'Settings' },
	{ path: '/settings/:section', component: Settings, layout: 'wide', title: 'Settings' },
	{ path: '/play', component: QuickPlay, layout: 'panel', title: 'Play' },
	{ path: '/play/:roomId', component: Play, layout: 'panel', title: 'Online game' },
];

export const NOT_FOUND_ROUTE: AppRoute = { path: '*', component: NotFound, layout: 'panel', title: 'Not found' };

/** Find the route definition for a path (for layout/title decisions outside the Router). */
export function routeFor(path: string): AppRoute {
	const clean = path.split('?')[0]!.replace(/\/+$/, '') || '/';
	for (const r of ROUTES) {
		const re = new RegExp(`^${r.path.replace(/:[^/]+/g, '[^/]+')}$`);
		if (re.test(clean)) return r;
	}
	return NOT_FOUND_ROUTE;
}

/** Side-panel tabs (desktop header / mobile tab bar below the board). */
export const PANEL_TABS: PanelTab[] = [
	{ id: 'moves', label: 'Moves', icon: 'list', href: '/', match: (p) => p === '/' },
	{ id: 'openings', label: 'Openings', icon: 'book', href: '/openings', match: (p) => p.startsWith('/openings') },
	{ id: 'games', label: 'Games', icon: 'games', href: '/games', match: (p) => p.startsWith('/games') },
	{ id: 'engine', label: 'Engine', icon: 'bot' },
];
