// Engine catalog card (Settings → Engines): name, local/remote, size, Elo range,
// human-like, pros/cons, license, status and the one relevant action.
import type { JSX } from 'preact';
import { Badge, Button } from '@/components/common';
import type { DownloadProgress, EngineEntry } from '@/services/engine';
import { cx } from '@/lib/classNames';
import './EngineCard.scss';

export interface EngineCardProps {
	entry: EngineEntry;
	isDefault: boolean;
	progress?: DownloadProgress;
	onUse: (id: string) => void;
	onDownload: (id: string) => void;
	onCancel: (id: string) => void;
	onRemove: (id: string) => void;
}

const SHORT_REASON: Record<string, string> = {
	'needs-download': 'Not downloaded',
	'model-missing': 'Not downloaded',
	'needs-server': 'Needs server',
	'binary-missing': 'Not installed',
	'needs-isolation': 'Needs COOP/COEP',
	'server-unavailable': 'Not on server',
};

function sizeLabel(mb: number | undefined): string | null {
	if (mb === undefined) return null;
	return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function EngineCard({ entry, isDefault, progress, onUse, onDownload, onCancel, onRemove }: EngineCardProps): JSX.Element {
	const { meta, availability: av } = entry;
	const size = sizeLabel(meta.sizeMb);
	const pct = progress ? Math.round(progress.fraction * 100) : 0;

	let status: { label: string; tone: 'success' | 'warn' | 'neutral' | 'info' };
	if (progress) status = { label: `Downloading ${pct}%`, tone: 'info' };
	else if (av.available) status = { label: av.downloadable ? 'Installed' : meta.kind === 'remote' ? 'On server' : 'Ready', tone: 'success' };
	else status = { label: (av.reason && SHORT_REASON[av.reason]) ?? 'Unavailable', tone: av.reason === 'needs-download' || av.reason === 'model-missing' ? 'neutral' : 'warn' };
	// Explain only the reasons the badge cannot (download / server ones are obvious from the action).
	const reason = !av.available && !progress && av.message && (av.reason === 'binary-missing' || av.reason === 'needs-isolation' || av.reason === 'server-unavailable') ? av.message : null;

	let action: JSX.Element | null = null;
	if (progress) {
		action = (
			<Button size="sm" variant="ghost" onClick={() => onCancel(meta.id)}>
				Cancel
			</Button>
		);
	} else if (av.available) {
		action = (
			<>
				{av.downloadable && av.installed && (
					<Button size="sm" variant="ghost" icon="trash" onClick={() => onRemove(meta.id)}>
						Remove
					</Button>
				)}
				<Button size="sm" variant={isDefault ? 'secondary' : 'primary'} icon={isDefault ? 'check' : undefined} disabled={isDefault} onClick={() => onUse(meta.id)}>
					{isDefault ? 'Default' : 'Use'}
				</Button>
			</>
		);
	} else if (av.downloadable) {
		action = (
			<Button size="sm" variant="primary" icon="download" onClick={() => onDownload(meta.id)}>
				Download{size ? ` · ${size}` : ''}
			</Button>
		);
	} else if (av.reason === 'needs-server') {
		action = (
			<Button size="sm" variant="ghost" icon="server" disabled>
				Needs server
			</Button>
		);
	}

	return (
		<article class={cx('engine-card', isDefault && 'engine-card--default', !av.available && 'engine-card--unavailable')} aria-label={meta.name}>
			<header class="engine-card__head">
				<h3 class="engine-card__name">{meta.name}</h3>
				<div class="engine-card__badges">
					<Badge tone={meta.kind === 'local' ? 'neutral' : 'info'}>{meta.kind === 'local' ? 'Local' : 'Server'}</Badge>
					{meta.humanLike && <Badge tone="accent">Human-like</Badge>}
				</div>
			</header>
			<p class="engine-card__desc">{meta.description}</p>
			<dl class="engine-card__facts">
				<div>
					<dt>Elo</dt>
					<dd>
						{meta.eloRange[0]}–{meta.eloRange[1]}
					</dd>
				</div>
				{size && (
					<div>
						<dt>Size</dt>
						<dd>{size}</dd>
					</div>
				)}
				<div>
					<dt>License</dt>
					<dd class="engine-card__license">{meta.license}</dd>
				</div>
			</dl>
			{(meta.pros.length > 0 || meta.cons.length > 0) && (
				<div class="engine-card__pc">
					<ul class="engine-card__list engine-card__list--pros" aria-label="Pros">
						{meta.pros.map((p) => (
							<li key={p}>{p}</li>
						))}
					</ul>
					<ul class="engine-card__list engine-card__list--cons" aria-label="Cons">
						{meta.cons.map((c) => (
							<li key={c}>{c}</li>
						))}
					</ul>
				</div>
			)}
			{progress && (
				<div class="engine-card__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Downloading ${meta.name}`}>
					<span style={{ width: `${pct}%` }} />
				</div>
			)}
			{reason && <p class="engine-card__reason">{reason}</p>}
			<footer class="engine-card__foot">
				<Badge tone={status.tone}>
					{status.label}
				</Badge>
				<div class="engine-card__actions">{action}</div>
			</footer>
		</article>
	);
}
