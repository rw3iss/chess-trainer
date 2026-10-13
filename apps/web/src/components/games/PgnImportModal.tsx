// Import PGN: file picker (multi-file) or paste → parsed in the PGN worker →
// preview (count + first games) → import as saved games.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Textarea } from '@/components/common/Input';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Icon } from '@/components/common/Icon';
import { Spinner } from '@/components/common/Spinner';
import { toast } from '@/services/toast';
import { parsePgn, savedGameFromImport, type ImportedGame } from '@/services/pgn';
import { savedGamesActions } from '@/state/savedGames';
import { cx } from '@/lib/classNames';
import './PgnImportModal.scss';

export interface PgnImportModalProps {
	open: boolean;
	onClose: () => void;
	/** Called with the number of games imported. */
	onImported?: (count: number) => void;
}

type SourceTab = 'file' | 'paste';
const PREVIEW_ROWS = 6;
/** Parse pasted text automatically after typing stops. */
const PASTE_PARSE_DELAY_MS = 350;

function resultText(g: ImportedGame): string {
	if (!g.result) return '*';
	return g.result.winner === 'white' ? '1–0' : g.result.winner === 'black' ? '0–1' : '½–½';
}

export function PgnImportModal({ open, onClose, onImported }: PgnImportModalProps): JSX.Element {
	const [tab, setTab] = useState<SourceTab>('file');
	const [text, setText] = useState('');
	const [fileNames, setFileNames] = useState<string[]>([]);
	const [games, setGames] = useState<ImportedGame[] | null>(null);
	const [parsing, setParsing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [dragOver, setDragOver] = useState(false);
	const parseSeq = useRef(0);

	useEffect(() => {
		if (!open) return;
		setTab('file');
		setText('');
		setFileNames([]);
		setGames(null);
		setError(undefined);
		setParsing(false);
		setImporting(false);
	}, [open]);

	const parse = async (pgn: string) => {
		const seq = ++parseSeq.current;
		if (!pgn.trim()) {
			setGames(null);
			setError(undefined);
			return;
		}
		setParsing(true);
		setError(undefined);
		try {
			const parsed = await parsePgn(pgn);
			if (seq !== parseSeq.current) return;
			setGames(parsed);
			if (!parsed.length) setError('No games found in this PGN.');
		} catch (e) {
			if (seq !== parseSeq.current) return;
			setGames(null);
			setError(`Could not read PGN: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			if (seq === parseSeq.current) setParsing(false);
		}
	};

	// Paste tab: parse after typing settles.
	useEffect(() => {
		if (!open || tab !== 'paste') return;
		const t = setTimeout(() => void parse(text), PASTE_PARSE_DELAY_MS);
		return () => clearTimeout(t);
	}, [text, tab, open]);

	const readFiles = async (files: FileList | File[] | null) => {
		const list = files ? [...files] : [];
		if (!list.length) return;
		setFileNames(list.map((f) => f.name));
		const contents = await Promise.all(list.map((f) => f.text()));
		await parse(contents.join('\n\n'));
	};

	const switchTab = (t: SourceTab) => {
		setTab(t);
		parseSeq.current++;
		setGames(null);
		setError(undefined);
		setParsing(false);
		setFileNames([]);
		if (t === 'paste' && text) void parse(text);
	};

	const doImport = async () => {
		if (!games?.length || importing) return;
		setImporting(true);
		try {
			const now = Date.now();
			// Keep the PGN order when the list is sorted by "updated": first game = newest.
			const saved = games.map((g, i) => savedGameFromImport(g, now - i));
			const n = await savedGamesActions.addMany(saved);
			toast.success(`Imported ${n} game${n === 1 ? '' : 's'}`, { id: 'pgn-import' });
			onImported?.(n);
			onClose();
		} catch (e) {
			setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setImporting(false);
		}
	};

	const count = games?.length ?? 0;

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Import PGN"
			description="One file can hold many games. Variations, comments and results are kept."
			class="pgn-import"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" icon="upload" disabled={!count || parsing} loading={importing} onClick={() => void doImport()}>
						{count ? `Import ${count} game${count === 1 ? '' : 's'}` : 'Import'}
					</Button>
				</>
			}
		>
			<div class="pgn-import__body">
				<SegmentedControl<SourceTab>
					ariaLabel="PGN source"
					value={tab}
					onChange={switchTab}
					options={[
						{ value: 'file', label: 'File', icon: 'upload' },
						{ value: 'paste', label: 'Paste', icon: 'copy' },
					]}
				/>
				{tab === 'file' ? (
					<label
						class={cx('pgn-import__drop', dragOver && 'pgn-import__drop--over')}
						onDragOver={(e) => {
							e.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
						onDrop={(e) => {
							e.preventDefault();
							setDragOver(false);
							void readFiles(e.dataTransfer?.files ?? null);
						}}
					>
						<input
							type="file"
							accept=".pgn,.txt,application/x-chess-pgn,text/plain"
							multiple
							class="visually-hidden"
							onChange={(e) => void readFiles(e.currentTarget.files)}
						/>
						<Icon name="upload" size={26} class="pgn-import__drop-icon" />
						<span class="pgn-import__drop-title">{fileNames.length ? fileNames.join(', ') : 'Choose PGN files'}</span>
						<span class="pgn-import__drop-hint">{fileNames.length ? 'Click to choose different files' : 'or drop them here · .pgn / .txt'}</span>
					</label>
				) : (
					<Textarea
						label="PGN text"
						class="pgn-import__paste"
						rows={8}
						value={text}
						spellcheck={false}
						placeholder={'[Event "My game"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 *'}
						onInput={(e) => setText(e.currentTarget.value)}
					/>
				)}

				<div class="pgn-import__preview" aria-live="polite">
					{parsing ? (
						<span class="pgn-import__status">
							<Spinner size={16} /> Reading games…
						</span>
					) : error ? (
						<span class="pgn-import__status pgn-import__status--error">
							<Icon name="warning" size={16} /> {error}
						</span>
					) : games && count > 0 ? (
						<>
							<span class="pgn-import__status pgn-import__status--ok">
								<Icon name="check" size={16} /> Found <strong>{count}</strong> game{count === 1 ? '' : 's'}
							</span>
							<ul class="pgn-import__list">
								{games.slice(0, PREVIEW_ROWS).map((g, i) => (
									<li key={i} class="pgn-import__item">
										<span class="pgn-import__item-name">{g.name}</span>
										<span class="pgn-import__item-meta">
											{Math.ceil(g.moveCount / 2)} moves · {resultText(g)}
										</span>
									</li>
								))}
								{count > PREVIEW_ROWS && <li class="pgn-import__item pgn-import__item--more">and {count - PREVIEW_ROWS} more…</li>}
							</ul>
						</>
					) : null}
				</div>
			</div>
		</Modal>
	);
}
