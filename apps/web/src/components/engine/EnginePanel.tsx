// Engine tab (panelSlots.engine): analysis toggle, engine pick, stats, MultiPV
// lines and the bot game card. Analysis itself lives in the engines store, so it
// keeps running (eval bar + arrows) when another tab is shown.
import type { JSX } from 'preact';
import { getNode } from '@chess/core/chess';
import { Badge, Button, EmptyState, SegmentedControl, Select, Toggle, type BadgeTone } from '@/components/common';
import type { PanelSlotProps } from '@/components/shell/panelSlots';
import { commands } from '@/services/commands';
import {
	analysis,
	analysisActions,
	analysisEngineId,
	analysisError,
	analysisPrefs,
	analysisStatus,
	availableEngines,
	engineEntry,
	sessionsActions,
	MULTIPV_MAX,
	type AnalysisStatus,
} from '@/state';
import { BotStatusCard } from './BotStatusCard';
import { PvLines } from './PvLines';
import { focusedLine } from './engineShapes';
import { compactNumber } from './pvFormat';
import './EnginePanel.scss';

const STATUS: Record<AnalysisStatus, { label: string; tone: BadgeTone }> = {
	off: { label: 'Off', tone: 'neutral' },
	loading: { label: 'Loading', tone: 'info' },
	running: { label: 'Running', tone: 'success' },
	paused: { label: 'Paused', tone: 'warn' },
	idle: { label: 'Idle', tone: 'neutral' },
	error: { label: 'Error', tone: 'danger' },
};

const MULTIPV_OPTIONS = Array.from({ length: MULTIPV_MAX }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export function EnginePanel({ session }: PanelSlotProps): JSX.Element {
	const prefs = analysisPrefs.value;
	const status = analysisStatus.value;
	const engineId = analysisEngineId.value;
	const meta = engineEntry(engineId)?.meta;
	const a = analysis.value;
	const fen = session ? getNode(session.tree, session.cursor).fen : null;
	const current = a && fen && a.fen === fen ? a : null;
	const engines = availableEngines.value;
	const options = engines.length ? engines.map((e) => ({ value: e.meta.id, label: e.meta.name })) : [{ value: engineId, label: meta?.name ?? engineId }];
	const st = STATUS[status];

	return (
		<div class="engine-panel">
			<section class="engine-panel__card" aria-label="Analysis">
				<div class="engine-panel__head">
					<Toggle checked={prefs.enabled} onChange={analysisActions.setEnabled} label="Analysis" description={meta ? `${meta.name}${meta.kind === 'remote' ? ' · server' : ''}` : undefined} />
					<Badge tone={st.tone} class="engine-panel__status">
						{st.label}
					</Badge>
				</div>

				<div class="engine-panel__controls">
					<Select label="Engine" value={engineId} options={options} onChange={(id) => analysisActions.setEngine(id)} class="engine-panel__engine" />
					<div class="engine-panel__multipv">
						<span class="engine-panel__label">
							Lines
						</span>
						<SegmentedControl size="sm" ariaLabel="Number of lines" options={MULTIPV_OPTIONS} value={String(prefs.multiPv)} onChange={(v) => analysisActions.setMultiPv(Number(v))} />
					</div>
				</div>

				{prefs.enabled && (
					<dl class="engine-panel__stats">
						<div>
							<dt>Depth</dt>
							<dd>{current?.depth || '–'}</dd>
						</div>
						<div>
							<dt>Nodes</dt>
							<dd>{compactNumber(current?.nodes)}</dd>
						</div>
						<div>
							<dt>Speed</dt>
							<dd>{current?.nps ? `${compactNumber(current.nps)}/s` : '–'}</dd>
						</div>
					</dl>
				)}

				{prefs.enabled && analysisError.value && <p class="engine-panel__error">{analysisError.value}</p>}

				{prefs.enabled && session && fen ? (
					<PvLines
						fen={fen}
						lines={current?.lines ?? []}
						count={status === 'running' || status === 'loading' ? prefs.multiPv : (current?.lines.length ?? 0)}
						onPlay={(uci) => sessionsActions.move(uci, session.id)}
						onFocus={(n) => (focusedLine.value = n)}
						disabled={session.mode === 'bot' && session.bot?.color === (fen.split(' ')[1] === 'w' ? 'white' : 'black')}
					/>
				) : (
					!prefs.enabled && (
						<EmptyState icon="eye" title="Analysis is off" description="Turn it on for an evaluation bar, best-move arrows and the top engine lines." compact>
							<Button size="sm" variant="primary" onClick={() => analysisActions.setEnabled(true)}>
								Analyse position
							</Button>
						</EmptyState>
					)
				)}
				{prefs.enabled && status === 'paused' && <p class="engine-panel__hint">Paused while the app is in the background.</p>}
			</section>

			{session?.mode === 'bot' ? (
				<BotStatusCard session={session} />
			) : (
				<section class="engine-panel__card engine-panel__bot" aria-label="Play with bot">
					<div>
						<h3 class="engine-panel__title">Play with a bot</h3>
						<p class="engine-panel__hint">Continue from this position against an engine at your level.</p>
					</div>
					<Button variant="secondary" icon="bot" onClick={() => commands.dispatch('openBot')}>
						Play vs bot
					</Button>
				</section>
			)}
		</div>
	);
}
