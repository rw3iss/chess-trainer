// Import games from an online account (Lichess, Chess.com) — the "Lichess / Chess.com" tab of ImportModal.
// Fetches in the browser (services/importers), parses each game, skips games already imported, saves in
// batches into the current account's saved games. Cancel keeps what is already saved.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import { Icon } from '@/components/common/Icon';
import { Spinner } from '@/components/common/Spinner';
import { toast } from '@/services/toast';
import { parsePgn } from '@/services/pgn';
import { estimateTotal, isAbort, runImport, SITE_LABEL, USERNAME_INPUT_RE, type ImportProgress, type ImportSite } from '@/services/importers';
import { getSavedGame, savedGamesActions } from '@/state/savedGames';
import { authActions, isLoggedIn } from '@/state/auth';

type Amount = '20' | '100' | 'all';

type Status =
	| { kind: 'idle' }
	| { kind: 'running'; progress: ImportProgress; waitMs?: number }
	| { kind: 'done'; progress: ImportProgress }
	| { kind: 'error'; message: string; progress?: ImportProgress };

const SITES: { value: ImportSite; label: string }[] = [
	{ value: 'lichess', label: 'Lichess' },
	{ value: 'chesscom', label: 'Chess.com' },
];

export interface OnlineImportProps {
	/** Called when the import ends with the number of games added. */
	onImported?: (count: number) => void;
	/** Reports whether an import is running (the modal keeps its Close button honest). */
	onBusy?: (busy: boolean) => void;
}

export function summaryText(p: ImportProgress): string {
	const games = `${p.imported} game${p.imported === 1 ? '' : 's'}`;
	return p.skipped ? `Imported ${games} (${p.skipped} already here)` : `Imported ${games}`;
}

export function OnlineImport({ onImported, onBusy }: OnlineImportProps): JSX.Element {
	const [site, setSite] = useState<ImportSite>('lichess');
	const [username, setUsername] = useState('');
	const [amount, setAmount] = useState<Amount>('100');
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [ratedOnly, setRatedOnly] = useState(false);
	const [status, setStatus] = useState<Status>({ kind: 'idle' });
	const abort = useRef<AbortController | null>(null);
	const touched = useRef(false);

	// Stop a running import when the modal closes.
	useEffect(() => () => abort.current?.abort(), []);

	// Prefill the linked Lichess username (signed in with a Lichess identity).
	useEffect(() => {
		if (site !== 'lichess' || !isLoggedIn.value || touched.current) return;
		let live = true;
		authActions
			.identities()
			.then((ids) => {
				const li = ids.find((i) => i.provider === 'lichess');
				if (live && li && !touched.current) setUsername(li.label.replace(/^@/, ''));
			})
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [site]);

	const running = status.kind === 'running';
	const name = username.trim();
	const valid = USERNAME_INPUT_RE.test(name) && (!from || !to || from <= to);

	const start = async () => {
		if (!valid || running) return;
		const ctrl = new AbortController();
		abort.current = ctrl;
		onBusy?.(true);
		let last: ImportProgress = { fetched: 0, imported: 0, skipped: 0 };
		setStatus({ kind: 'running', progress: last });
		const opts = {
			username: name,
			max: amount === 'all' ? undefined : Number(amount),
			from: from || undefined,
			to: to || undefined,
			ratedOnly,
			signal: ctrl.signal,
			onWait: (ms: number) => setStatus({ kind: 'running', progress: last, waitMs: ms }),
		};
		try {
			const total = await estimateTotal(site, opts);
			last = { ...last, total };
			setStatus({ kind: 'running', progress: last });
			const done = await runImport(site, opts, {
				parse: parsePgn,
				hasId: (id) => !!getSavedGame(id),
				save: (games) => savedGamesActions.addMany(games),
				onProgress: (p) => {
					last = { ...p, total };
					setStatus({ kind: 'running', progress: last });
				},
			});
			const final = { ...done, total };
			setStatus({ kind: 'done', progress: final });
			if (!final.fetched) toast.info(`No games found for ${name} on ${SITE_LABEL[site]}.`, { id: 'online-import' });
			else toast.success(summaryText(final), { id: 'online-import' });
			onImported?.(final.imported);
		} catch (e) {
			if (isAbort(e)) {
				setStatus({ kind: 'done', progress: last });
				toast.info(`Import stopped. ${summaryText(last)}.`, { id: 'online-import' });
				onImported?.(last.imported);
			} else setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e), progress: last });
		} finally {
			abort.current = null;
			onBusy?.(false);
		}
	};

	const p = status.kind === 'idle' ? undefined : status.progress;
	return (
		<div class="online-import">
			<div class="online-import__row">
				<Select<ImportSite> label="Site" value={site} options={SITES} onChange={setSite} disabled={running} class="online-import__site" />
				<Input
					label="Username"
					value={username}
					disabled={running}
					autocomplete="off"
					spellcheck={false}
					placeholder={site === 'lichess' ? 'Lichess username' : 'Chess.com username'}
					onInput={(e) => {
						touched.current = true;
						setUsername(e.currentTarget.value);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') void start();
					}}
					class="online-import__user"
				/>
			</div>
			<div class="online-import__row online-import__row--opts">
				<SegmentedControl<Amount>
					ariaLabel="How many games"
					size="sm"
					value={amount}
					onChange={setAmount}
					options={[
						{ value: '20', label: 'Last 20' },
						{ value: '100', label: 'Last 100' },
						{ value: 'all', label: 'All' },
					]}
				/>
				<Toggle checked={ratedOnly} onChange={setRatedOnly} label="Rated only" disabled={running} />
			</div>
			<div class="online-import__row online-import__row--dates">
				<Input type="month" label="From month (optional)" value={from} max={to || undefined} disabled={running} onInput={(e) => setFrom(e.currentTarget.value)} />
				<Input type="month" label="To month (optional)" value={to} min={from || undefined} disabled={running} onInput={(e) => setTo(e.currentTarget.value)} />
			</div>

			<div class="online-import__actions">
				{running ? (
					<Button variant="secondary" icon="close" onClick={() => abort.current?.abort()}>
						Stop
					</Button>
				) : (
					<Button variant="primary" icon="download" disabled={!valid} onClick={() => void start()}>
						Import games
					</Button>
				)}
				<span class="online-import__hint">Public games only. Games you already imported are skipped.</span>
			</div>

			<div class="import-modal__preview" aria-live="polite">
				{status.kind === 'running' && (
					<span class="import-modal__status">
						<Spinner size={16} />
						{status.waitMs
							? ` ${SITE_LABEL[site]} asks us to slow down — waiting ${Math.round(status.waitMs / 1000)} s…`
							: ` Imported ${p!.imported}${p!.total ? ` of ~${p!.total}` : ''}${p!.skipped ? ` · ${p!.skipped} already here` : ''}…`}
					</span>
				)}
				{status.kind === 'done' && p!.fetched > 0 && (
					<span class="import-modal__status import-modal__status--ok">
						<Icon name="check" size={16} /> {summaryText(p!)}
					</span>
				)}
				{status.kind === 'done' && p!.fetched === 0 && (
					<span class="import-modal__status">
						<Icon name="info" size={16} /> No games found for these settings.
					</span>
				)}
				{status.kind === 'error' && (
					<span class="import-modal__status import-modal__status--error">
						<Icon name="warning" size={16} /> {status.message}
						{status.progress?.imported ? ` (${status.progress.imported} imported before the error)` : ''}
					</span>
				)}
			</div>
		</div>
	);
}
