// Import: PGN games, a FEN position, or a board image (2D screenshot / diagram).
// • File tab: .pgn / .txt (many games) or an image → read in the browser (services/vision).
// • Paste tab: PGN text, a FEN, or an image pasted from the clipboard (Ctrl/⌘+V works anywhere
//   in the dialog).
// PGN → preview (count + first games) → "Import N games" saves them.
// FEN / image → PositionEditor (fix squares, side to move, castling; shows setup errors) → "Open on board" opens a new
// unsaved analysis session (save it later from the board's menu).
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { checkSetup } from '@chess/core/chess';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { Textarea } from '@/components/common/Input';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Icon } from '@/components/common/Icon';
import { Spinner } from '@/components/common/Spinner';
import { PositionEditor } from '@/components/position';
import { toast } from '@/services/toast';
import { parsePgn, savedGameFromImport, type ImportedGame } from '@/services/pgn';
import { IMAGE_ACCEPT, isImageFile, readBoardImage, type VisionResult } from '@/services/vision';
import { savedGamesActions } from '@/state/savedGames';
import { sessionsActions } from '@/state/sessions';
import { navigate } from '@/lib/navigate';
import { cx } from '@/lib/classNames';
import './ImportModal.scss';

export interface ImportModalProps {
	open: boolean;
	onClose: () => void;
	/** Called with the number of games imported (PGN). */
	onImported?: (count: number) => void;
}

type SourceTab = 'file' | 'paste';
const PREVIEW_ROWS = 6;
/** Parse pasted text automatically after typing stops. */
const PASTE_PARSE_DELAY_MS = 350;
/** FEN piece placement (8 ranks), optionally followed by the other fields. */
const FEN_RE = /^\s*([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8}(\s+[wb](\s+(-|[KQkq]{1,4})(\s+(-|[a-h][36])(\s+\d+\s+\d+)?)?)?)?\s*$/;

/** A position to check and open: from a FEN, or read from a board image. */
type PositionSource =
	| { kind: 'fen'; fen: string }
	| { kind: 'image'; name: string; url: string; status: 'reading' | 'done' | 'error'; result?: VisionResult; error?: string; fen: string };

function resultText(g: ImportedGame): string {
	if (!g.result) return '*';
	return g.result.winner === 'white' ? '1–0' : g.result.winner === 'black' ? '0–1' : '½–½';
}

/** Full FEN from a pasted one (missing fields → white to move, no castling, no en passant). */
function completeFen(text: string): string {
	const parts = text.trim().split(/\s+/);
	return [parts[0], parts[1] ?? 'w', parts[2] ?? '-', parts[3] ?? '-', parts[4] ?? '0', parts[5] ?? '1'].join(' ');
}

export function ImportModal({ open, onClose, onImported }: ImportModalProps): JSX.Element {
	const [tab, setTab] = useState<SourceTab>('file');
	const [text, setText] = useState('');
	const [fileNames, setFileNames] = useState<string[]>([]);
	const [games, setGames] = useState<ImportedGame[] | null>(null);
	const [parsing, setParsing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [dragOver, setDragOver] = useState(false);
	const [position, setPosition] = useState<PositionSource | null>(null);
	const parseSeq = useRef(0);

	const resetPosition = () =>
		setPosition((p) => {
			if (p?.kind === 'image') URL.revokeObjectURL(p.url);
			return null;
		});

	useEffect(() => {
		if (!open) return;
		setTab('file');
		setText('');
		setFileNames([]);
		setGames(null);
		setError(undefined);
		setParsing(false);
		setImporting(false);
		resetPosition();
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

	/** Read a board image in the browser and show the position editor. */
	const readImage = async (image: Blob, name: string) => {
		const seq = ++parseSeq.current;
		setGames(null);
		setError(undefined);
		setParsing(false);
		resetPosition();
		const url = URL.createObjectURL(image);
		setPosition({ kind: 'image', name, url, status: 'reading', fen: '' });
		try {
			const result = await readBoardImage(image);
			if (seq !== parseSeq.current) return;
			setPosition({ kind: 'image', name, url, status: 'done', result, fen: result.fen });
		} catch (e) {
			if (seq !== parseSeq.current) return;
			setPosition({ kind: 'image', name, url, status: 'error', error: e instanceof Error ? e.message : String(e), fen: '' });
		}
	};

	/** Text input: a FEN → position editor; anything else → PGN. */
	const readText = (value: string) => {
		if (FEN_RE.test(value)) {
			parseSeq.current++;
			setGames(null);
			setError(undefined);
			setParsing(false);
			setPosition({ kind: 'fen', fen: completeFen(value) });
			return;
		}
		if (position?.kind === 'fen') setPosition(null);
		void parse(value);
	};

	// Paste tab: read after typing settles.
	useEffect(() => {
		if (!open || tab !== 'paste') return;
		const t = setTimeout(() => readText(text), PASTE_PARSE_DELAY_MS);
		return () => clearTimeout(t);
	}, [text, tab, open]);

	const readFiles = async (files: FileList | File[] | null) => {
		const list = files ? [...files] : [];
		if (!list.length) return;
		const image = list.find((f) => isImageFile(f));
		if (image) {
			setFileNames([image.name]);
			await readImage(image, image.name);
			return;
		}
		resetPosition();
		setFileNames(list.map((f) => f.name));
		const contents = await Promise.all(list.map((f) => f.text()));
		readText(contents.join('\n\n'));
	};

	// An image pasted anywhere in the dialog (screenshot in the clipboard).
	const onPaste = (e: ClipboardEvent) => {
		const file = [...(e.clipboardData?.files ?? [])].find((f) => isImageFile(f));
		if (!file) return;
		e.preventDefault();
		void readImage(file, 'Pasted image');
	};

	const switchTab = (t: SourceTab) => {
		setTab(t);
		parseSeq.current++;
		setGames(null);
		setError(undefined);
		setParsing(false);
		setFileNames([]);
		resetPosition();
		if (t === 'paste' && text) readText(text);
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

	const positionFen = position?.fen ?? '';
	const setup = positionFen ? checkSetup(positionFen) : null;
	const openPosition = () => {
		if (!position || !setup?.ok) return;
		const title = position.kind === 'image' ? 'Position from image' : 'Position from FEN';
		sessionsActions.newSession({ fen: positionFen, title, source: { kind: 'import' } });
		toast.success('Opened on the board as a new game (not saved). Save it from the board menu to keep it.', { id: 'position-import' });
		onClose();
		navigate('/');
	};

	const count = games?.length ?? 0;
	const isPosition = !!position;

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Import"
			description="PGN games, a FEN position, or a picture of a board: a 2D screenshot or diagram from any site, app or book."
			size={isPosition ? 'lg' : 'md'}
			class="import-modal"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					{isPosition ? (
						<Button variant="primary" icon="board" disabled={!setup?.ok} onClick={openPosition}>
							Open on board
						</Button>
					) : (
						<Button variant="primary" icon="upload" disabled={!count || parsing} loading={importing} onClick={() => void doImport()}>
							{count ? `Import ${count} game${count === 1 ? '' : 's'}` : 'Import'}
						</Button>
					)}
				</>
			}
		>
			<div class="import-modal__body" onPaste={onPaste}>
				<SegmentedControl<SourceTab>
					ariaLabel="Import source"
					value={tab}
					onChange={switchTab}
					options={[
						{ value: 'file', label: 'File or image', icon: 'upload' },
						{ value: 'paste', label: 'Paste', icon: 'copy' },
					]}
				/>
				{tab === 'file' ? (
					<label
						class={cx('import-modal__drop', dragOver && 'import-modal__drop--over', isPosition && 'import-modal__drop--compact')}
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
							accept={`.pgn,.txt,application/x-chess-pgn,text/plain,${IMAGE_ACCEPT}`}
							multiple
							class="visually-hidden"
							onChange={(e) => void readFiles(e.currentTarget.files)}
						/>
						<Icon name="upload" size={isPosition ? 18 : 26} class="import-modal__drop-icon" />
						<span class="import-modal__drop-title">{fileNames.length ? fileNames.join(', ') : 'Choose PGN files or a board image'}</span>
						<span class="import-modal__drop-hint">
							{fileNames.length ? 'Click to choose a different file' : 'or drop them here · .pgn / .txt · PNG / JPEG / WebP screenshot · or paste an image'}
						</span>
					</label>
				) : (
					<Textarea
						label="PGN, FEN, or paste an image"
						class="import-modal__paste"
						rows={isPosition ? 2 : 8}
						value={text}
						spellcheck={false}
						placeholder={'[Event "My game"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 *\n\nor a FEN: rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'}
						onInput={(e) => setText(e.currentTarget.value)}
					/>
				)}

				{position ? (
					<PositionPanel position={position} onFen={(fen) => setPosition({ ...position, fen })} />
				) : (
					<div class="import-modal__preview" aria-live="polite">
						{parsing ? (
							<span class="import-modal__status">
								<Spinner size={16} /> Reading games…
							</span>
						) : error ? (
							<span class="import-modal__status import-modal__status--error">
								<Icon name="warning" size={16} /> {error}
							</span>
						) : games && count > 0 ? (
							<>
								<span class="import-modal__status import-modal__status--ok">
									<Icon name="check" size={16} /> Found <strong>{count}</strong> game{count === 1 ? '' : 's'}
								</span>
								<ul class="import-modal__list">
									{games.slice(0, PREVIEW_ROWS).map((g, i) => (
										<li key={i} class="import-modal__item">
											<span class="import-modal__item-name">{g.name}</span>
											<span class="import-modal__item-meta">
												{Math.ceil(g.moveCount / 2)} moves · {resultText(g)}
											</span>
										</li>
									))}
									{count > PREVIEW_ROWS && <li class="import-modal__item import-modal__item--more">and {count - PREVIEW_ROWS} more…</li>}
								</ul>
							</>
						) : null}
					</div>
				)}
			</div>
		</Modal>
	);
}

/** Image preview (with the board found) + reading status + the position editor. */
function PositionPanel({ position, onFen }: { position: PositionSource; onFen: (fen: string) => void }): JSX.Element {
	if (position.kind === 'image' && position.status !== 'done') {
		return (
			<div class="import-modal__position import-modal__position--single" aria-live="polite">
				<ImagePreview url={position.url} />
				{position.status === 'reading' ? (
					<span class="import-modal__status">
						<Spinner size={16} /> Reading the board… The first time, the board reader downloads once (about 4 MB).
					</span>
				) : (
					<span class="import-modal__status import-modal__status--error">
						<Icon name="warning" size={16} /> {position.error ?? 'Could not read this image.'} Try a tighter screenshot of the board.
					</span>
				)}
			</div>
		);
	}
	const r = position.kind === 'image' ? position.result : undefined;
	return (
		<div class="import-modal__position" aria-live="polite">
			{position.kind === 'image' && r && (
				<div class="import-modal__source">
					<ImagePreview url={position.url} board={r.board} size={r.image} />
					<ul class="import-modal__notes">
						<li>
							<Icon name="check" size={14} /> Board read in {r.ms} ms
						</li>
						<li>
							<Icon name={r.orientation === 'black' ? 'flip' : 'check'} size={14} />
							{r.orientation === 'black' ? 'Black was at the bottom: turned so White is at the bottom' : 'White at the bottom'}
							{r.orientationConfidence < 0.34 ? ' (not sure: use Rotate position if it is upside down)' : ''}
						</li>
						<li>
							<Icon name={r.turnFrom === 'highlight' ? 'check' : 'info'} size={14} />
							{r.turnFrom === 'highlight'
								? `${r.turn === 'white' ? 'White' : 'Black'} to move (from the last-move highlight)`
								: 'Side to move is not shown in the image: check it below'}
						</li>
						{r.uncertain.length > 0 && (
							<li class="import-modal__note--warn">
								<Icon name="warning" size={14} /> Check {r.uncertain.length === 1 ? 'square' : 'squares'} {r.uncertain.join(', ')}
							</li>
						)}
						{r.gridFallback && (
							<li class="import-modal__note--warn">
								<Icon name="warning" size={14} /> No clear grid found: the whole image was used as the board
							</li>
						)}
					</ul>
				</div>
			)}
			<div class="import-modal__editor">
				<PositionEditor fen={position.fen} onChange={onFen} uncertain={r?.uncertain} />
			</div>
		</div>
	);
}

/** The uploaded image, with the detected board outlined. */
function ImagePreview({ url, board, size }: { url: string; board?: VisionResult['board']; size?: VisionResult['image'] }): JSX.Element {
	return (
		<div class="import-modal__image">
			<img src={url} alt="Uploaded board image" />
			{board && size && (
				<span
					class="import-modal__box"
					aria-hidden="true"
					style={{
						left: `${(board.x / size.width) * 100}%`,
						top: `${(board.y / size.height) * 100}%`,
						width: `${(board.size / size.width) * 100}%`,
						height: `${(board.size / size.height) * 100}%`,
					}}
				/>
			)}
		</div>
	);
}
