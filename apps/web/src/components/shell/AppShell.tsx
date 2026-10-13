// AppShell (PLAN §4.1): TopNav · BoardStage (persistent) · SidePanel (route content
// + panel tabs) · GameControls. Desktop = board left / panel right. Stacked
// (< 900 px) = board on top, tabs below, sticky controls; 'sheet'/'wide' routes
// open as full-height sheets with a floating "now playing" chip.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { ErrorBoundary, Route, Router, useLocation } from 'preact-iso';
import { BoardStage } from '@/components/stage/BoardStage';
import { GameControls } from '@/components/controls/GameControls';
import { TopNav } from './TopNav';
import { NowPlayingChip } from './NowPlayingChip';
import { panelSlots } from './panelSlots';
import { Tabs } from '@/components/common/Tabs';
import { Icon } from '@/components/common/Icon';
import { EmptyState } from '@/components/common/EmptyState';
import { Spinner } from '@/components/common/Spinner';
import { ToastHost } from '@/components/common/Toast';
import { NOT_FOUND_ROUTE, PANEL_TABS, ROUTES, routeFor } from '@/app/routes';
import { activeSession } from '@/state/sessions';
import { useIsStacked } from '@/hooks/useMediaQuery';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { cx } from '@/lib/classNames';
import './AppShell.scss';

const APP_TITLE = 'Chess Openings';

function EnginePanelFallback(): JSX.Element {
	return (
		<EmptyState icon="bot" title="Engine analysis" description="Stockfish evaluation, best lines and arrows arrive with the engine feature." compact />
	);
}

export function AppShell(): JSX.Element {
	const { path, route } = useLocation();
	const stacked = useIsStacked();
	const [override, setOverride] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const def = routeFor(path);
	const asSheet = stacked && def.layout !== 'panel';

	useKeyboardShortcuts();

	// A route change always shows the route content (clears the Engine tab override).
	useEffect(() => {
		setOverride(null);
		document.title = def.path === '/' ? APP_TITLE : `${def.title} · ${APP_TITLE}`;
	}, [path]);

	const tabValue = override ?? PANEL_TABS.find((t) => t.match?.(path))?.id ?? '';
	const onTab = (id: string) => {
		const tab = PANEL_TABS.find((t) => t.id === id);
		if (!tab) return;
		if (tab.href) {
			setOverride(null);
			if (!tab.match?.(path)) route(tab.href);
		} else setOverride(id);
	};

	return (
		<div class={cx('shell', `shell--${def.layout}`, stacked && 'shell--stacked', asSheet && 'shell--sheet-open')}>
			<a href="#panel" class="shell__skip">
				Skip to panel
			</a>
			<TopNav compact={stacked} />
			<div class="shell__body">
				<BoardStage class="shell__stage" />
				<aside class="shell__panel" id="panel" aria-label="Side panel">
					<div class="shell__tabs">
						<Tabs items={PANEL_TABS.map(({ id, label, icon }) => ({ id, label, icon }))} value={tabValue} onChange={onTab} ariaLabel="Panel" size="sm" />
					</div>
					<div class={cx('shell__content', asSheet && 'shell__content--sheet')} role={asSheet ? 'region' : undefined} aria-label={asSheet ? def.title : undefined}>
						{asSheet && (
							<header class="shell__sheet-header">
								<button type="button" class="shell__sheet-back" onClick={() => route('/')}>
									<Icon name="chevron-left" size={18} />
									Board
								</button>
							</header>
						)}
						<div class={cx('shell__route', override && 'shell__route--hidden')}>
							{loading && (
								<div class="shell__loading">
									<Spinner size={18} />
								</div>
							)}
							<ErrorBoundary>
								<Router onLoadStart={() => setLoading(true)} onLoadEnd={() => setLoading(false)}>
									{[...ROUTES.map((r) => <Route path={r.path} component={r.component} />), <Route default component={NOT_FOUND_ROUTE.component} />]}
								</Router>
							</ErrorBoundary>
						</div>
						{override === 'engine' && (
							<div class="shell__override">
								<panelSlots.engine.Render session={activeSession.value} fallback={<EnginePanelFallback />} />
							</div>
						)}
					</div>
					<div class="shell__controls game-controls-wrap">
						<GameControls />
					</div>
				</aside>
			</div>
			{asSheet && <NowPlayingChip />}
			<ToastHost />
		</div>
	);
}
