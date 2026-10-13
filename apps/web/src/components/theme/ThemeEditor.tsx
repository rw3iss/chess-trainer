// ThemeEditor (PLAN §4.4): clone any board or piece theme → edit → live large
// Board2D preview → save as a custom theme (ThemesRepository) → active.
// Also manages custom themes (use / edit / rename / delete / export) and
// imports theme JSON validated by core validateBoardTheme / validatePieceTheme.
import { useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { legalDests, type Color } from '@chess/core/chess';
import type { BoardTextureKind, BoardTheme, PieceSideColors, PieceTheme } from '@chess/core/theme';
import { Board2D, type Arrow, type Mark } from '@/components/board';
import { Badge, Button, EmptyState, IconButton, Input, SegmentedControl, Select, Slider } from '@/components/common';
import { toast } from '@/services/toast';
import { settings, updateSettings } from '@/state/settings';
import { activeBoardTheme, activePieceSet, activePieceTheme, boardThemes, customBoardThemes, customPieceThemes, pieceSets, pieceThemes, themesActions } from '@/state/themes';
import { DEFAULT_BOARD_THEME_ID, DEFAULT_PIECE_THEME_ID } from '@chess/core/theme';
import { cx } from '@/lib/classNames';
import { AlphaColorField, ColorField } from './pickers';
import { PieceSetPreview } from './PieceSetPreview';
import { PREVIEW_CHECK, PREVIEW_FEN, PREVIEW_LAST_MOVE } from './previewPositions';
import { downloadText, exportThemes, importThemes, readFileText } from './themeIO';
import { saveThemeDraft, startBoardDraft, startPieceDraft, type ThemeDraft, type ThemeKind } from './themeEditorModel';
import './ThemeEditor.scss';

const KIND_OPTIONS: { value: ThemeKind; label: string; icon: 'board' | 'knight' }[] = [
	{ value: 'board', label: 'Board', icon: 'board' },
	{ value: 'piece', label: 'Pieces', icon: 'knight' },
];

const TEXTURES: { value: BoardTextureKind; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'gradient', label: 'Gradient' },
	{ value: 'wood', label: 'Wood' },
	{ value: 'marble', label: 'Marble' },
	{ value: 'slate', label: 'Slate' },
	{ value: 'felt', label: 'Felt' },
	{ value: 'paper', label: 'Paper' },
];

const HIGHLIGHTS: { key: keyof BoardTheme['highlights']; label: string }[] = [
	{ key: 'lastMove', label: 'Last move' },
	{ key: 'selected', label: 'Selected' },
	{ key: 'moveDest', label: 'Legal moves' },
	{ key: 'check', label: 'Check' },
	{ key: 'premove', label: 'Premove' },
	{ key: 'arrow', label: 'Arrows' },
];

const SIDE_FIELDS: { key: keyof PieceSideColors; label: string }[] = [
	{ key: 'body', label: 'Body' },
	{ key: 'line', label: 'Outline' },
	{ key: 'accent', label: 'Accent' },
];

const PREVIEW_ARROWS: Arrow[] = [{ from: 'f3', to: 'g5' }];
const PREVIEW_MARKS: Mark[] = [{ square: 'f2', kind: 'circle' }];
const NOOP = () => {};

export interface ThemeEditorProps {
	/** Start with this kind selected. */
	initialKind?: ThemeKind;
	class?: string;
}

// ── Preview ──────────────────────────────────────────────────────────────
function EditorPreview({ board, piece }: { board: BoardTheme; piece: PieceTheme }): JSX.Element | null {
	const set = pieceSets.find((s) => s.id === piece.assetId) ?? activePieceSet.value;
	const dests = useMemo(() => legalDests(PREVIEW_FEN), []);
	const coords = settings.value.board.coordinates;
	if (!set) return null;
	return (
		<div class="theme-editor__preview" aria-label="Live preview">
			<div class="theme-editor__board">
				<Board2D
					fen={PREVIEW_FEN}
					orientation="white"
					lastMove={PREVIEW_LAST_MOVE}
					check={PREVIEW_CHECK}
					dests={dests}
					movable="white"
					arrows={PREVIEW_ARROWS}
					marks={PREVIEW_MARKS}
					animationMs={0}
					coordinates={coords === 'none' ? 'inside' : coords}
					showLegalDots
					showLastMove
					showCheck
					input="click"
					onMove={NOOP}
					boardTheme={board}
					pieceTheme={piece}
					pieceSet={set}
				/>
			</div>
			<p class="theme-editor__preview-hint">Tap a white piece to preview the selection and legal-move colours.</p>
		</div>
	);
}

// ── Board form ───────────────────────────────────────────────────────────
function BoardForm({ theme, onChange }: { theme: BoardTheme; onChange: (t: BoardTheme) => void }): JSX.Element {
	const set = (patch: Partial<BoardTheme>) => onChange({ ...theme, ...patch });
	const tex = (patch: Partial<BoardTheme['texture']>) => set({ texture: { ...theme.texture, ...patch } });
	const border = theme.border ?? { color: '#000000', width: 0 };
	return (
		<>
			<fieldset class="theme-editor__group">
				<legend class="theme-editor__legend">Squares</legend>
				<div class="theme-editor__grid">
					<ColorField label="Light squares" value={theme.light} onChange={(light) => set({ light })} />
					<ColorField label="Dark squares" value={theme.dark} onChange={(dark) => set({ dark })} />
				</div>
			</fieldset>
			<fieldset class="theme-editor__group">
				<legend class="theme-editor__legend">Texture</legend>
				<Select label="Kind" value={theme.texture.kind} options={TEXTURES} onChange={(kind) => tex({ kind, intensity: kind !== 'none' && theme.texture.intensity === 0 ? 0.5 : theme.texture.intensity })} />
				{theme.texture.kind !== 'none' && (
					<>
						<Slider label="Intensity" min={0} max={100} value={Math.round(theme.texture.intensity * 100)} onChange={(v) => tex({ intensity: v / 100 })} format={(v) => `${v}%`} />
						<Slider label="Scale" min={25} max={300} step={5} value={Math.round(theme.texture.scale * 100)} onChange={(v) => tex({ scale: v / 100 })} format={(v) => `${(v / 100).toFixed(2)}×`} />
						<div class="theme-editor__seed">
							<Slider label="Pattern seed" min={1} max={999} value={theme.texture.seed} onChange={(seed) => tex({ seed })} />
							<IconButton icon="redo" label="Shuffle pattern" onClick={() => tex({ seed: 1 + Math.floor(Math.random() * 999) })} />
						</div>
					</>
				)}
			</fieldset>
			<fieldset class="theme-editor__group">
				<legend class="theme-editor__legend">Highlights</legend>
				<div class="theme-editor__grid">
					{HIGHLIGHTS.map((h) => (
						<AlphaColorField key={h.key} label={h.label} value={theme.highlights[h.key]} onChange={(v) => set({ highlights: { ...theme.highlights, [h.key]: v } })} />
					))}
				</div>
			</fieldset>
			<fieldset class="theme-editor__group">
				<legend class="theme-editor__legend">Coordinates &amp; border</legend>
				<div class="theme-editor__grid">
					<ColorField label="On light squares" value={theme.coords.light} onChange={(v) => set({ coords: { ...theme.coords, light: v } })} />
					<ColorField label="On dark squares" value={theme.coords.dark} onChange={(v) => set({ coords: { ...theme.coords, dark: v } })} />
					<ColorField label="Border colour" value={border.color} onChange={(color) => set({ border: { ...border, color } })} />
					<Slider label="Border width" min={0} max={16} value={border.width} onChange={(width) => set({ border: width > 0 ? { ...border, width } : undefined })} format={(v) => `${v}px`} />
				</div>
			</fieldset>
		</>
	);
}

// ── Piece form ───────────────────────────────────────────────────────────
function PieceForm({ theme, onChange }: { theme: PieceTheme; onChange: (t: PieceTheme) => void }): JSX.Element {
	const set = (patch: Partial<PieceTheme>) => onChange({ ...theme, ...patch });
	const side = (c: Color, patch: Partial<PieceSideColors>) => set({ colors: { ...theme.colors, [c]: { ...theme.colors[c], ...patch } } });
	const asset = pieceSets.find((s) => s.id === theme.assetId);
	return (
		<>
			<fieldset class="theme-editor__group">
				<legend class="theme-editor__legend">Piece set</legend>
				<Select
					label="Shapes"
					value={theme.assetId}
					options={pieceSets.map((s) => ({ value: s.id, label: `${s.name}${s.personalUseOnly ? ' (personal use)' : ''}` }))}
					onChange={(assetId) => set({ assetId })}
				/>
				{asset && (
					<p class="theme-editor__note">
						{asset.author} · {asset.license}
						{asset.personalUseOnly && (
							<Badge tone="warn" class="theme-editor__badge">
								Personal use only
							</Badge>
						)}
					</p>
				)}
			</fieldset>
			{(['white', 'black'] as const).map((c) => (
				<fieldset class="theme-editor__group" key={c}>
					<legend class="theme-editor__legend">{c === 'white' ? 'White pieces' : 'Black pieces'}</legend>
					<div class="theme-editor__grid theme-editor__grid--3">
						{SIDE_FIELDS.map((f) => (
							<ColorField key={f.key} label={f.label} value={theme.colors[c][f.key]} onChange={(v) => side(c, { [f.key]: v })} />
						))}
					</div>
				</fieldset>
			))}
			<fieldset class="theme-editor__group">
				<legend class="theme-editor__legend">Depth</legend>
				<Slider label="Shading" min={0} max={100} value={Math.round(theme.shading * 100)} onChange={(v) => set({ shading: v / 100 })} format={(v) => `${v}%`} />
				<Slider label="Shadow" min={0} max={100} value={Math.round(theme.shadow * 100)} onChange={(v) => set({ shadow: v / 100 })} format={(v) => `${v}%`} />
			</fieldset>
		</>
	);
}

// ── Custom theme list ────────────────────────────────────────────────────
interface CustomRowProps {
	theme: BoardTheme | PieceTheme;
	active: boolean;
	visual: JSX.Element;
	onUse: () => void;
	onEdit: () => void;
	onExport: () => void;
	onDelete: () => void;
	onRename: (name: string) => void;
}

function CustomRow({ theme, active, visual, onUse, onEdit, onExport, onDelete, onRename }: CustomRowProps): JSX.Element {
	const [renaming, setRenaming] = useState(false);
	const [name, setName] = useState(theme.name);
	const commit = () => {
		setRenaming(false);
		if (name.trim() && name.trim() !== theme.name) onRename(name.trim());
		else setName(theme.name);
	};
	return (
		<li class={cx('theme-editor__custom', active && 'theme-editor__custom--active')}>
			<span class="theme-editor__custom-visual">{visual}</span>
			{renaming ? (
				<Input
					aria-label="Theme name"
					value={name}
					autoFocus
					onInput={(e) => setName((e.target as HTMLInputElement).value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === 'Enter') commit();
						if (e.key === 'Escape') {
							setName(theme.name);
							setRenaming(false);
						}
					}}
					class="theme-editor__custom-input"
				/>
			) : (
				<span class="theme-editor__custom-name">
					{theme.name}
					{active && <Badge tone="accent">Active</Badge>}
				</span>
			)}
			<span class="theme-editor__custom-actions">
				{!active && (
					<Button size="sm" variant="secondary" onClick={onUse}>
						Use
					</Button>
				)}
				<IconButton size="sm" icon="edit" label={`Edit ${theme.name}`} onClick={onEdit} />
				<IconButton size="sm" icon="note" label={`Rename ${theme.name}`} onClick={() => setRenaming(true)} />
				<IconButton size="sm" icon="download" label={`Export ${theme.name}`} onClick={onExport} />
				<IconButton size="sm" icon="trash" label={`Delete ${theme.name}`} onClick={onDelete} />
			</span>
		</li>
	);
}

// ── Custom theme helpers ─────────────────────────────────────────────────
function renameTheme(t: BoardTheme | PieceTheme, k: ThemeKind, name: string): void {
	void (k === 'board' ? themesActions.saveBoard({ ...(t as BoardTheme), name }) : themesActions.savePiece({ ...(t as PieceTheme), name }));
}

function exportTheme(t: BoardTheme | PieceTheme, k: ThemeKind): void {
	const file = `${t.name.replace(/[^\w-]+/g, '-').toLowerCase()}.theme.json`;
	downloadText(file, exportThemes(k === 'board' ? [t as BoardTheme] : [], k === 'piece' ? [t as PieceTheme] : []));
}

async function importThemeFile(e: JSX.TargetedEvent<HTMLInputElement>): Promise<void> {
	const file = e.currentTarget.files?.[0];
	e.currentTarget.value = '';
	if (!file) return;
	const res = importThemes(await readFileText(file));
	await Promise.all([...res.board.map((t) => themesActions.saveBoard(t)), ...res.piece.map((t) => themesActions.savePiece(t))]);
	const n = res.board.length + res.piece.length;
	if (n) toast.success(`Imported ${n} theme${n === 1 ? '' : 's'}`);
	if (res.errors.length) toast.error(res.errors.slice(0, 3).join(' '), { id: 'theme-import' });
}

// ── Editor ───────────────────────────────────────────────────────────────
export function ThemeEditor({ initialKind = 'board', class: className }: ThemeEditorProps): JSX.Element {
	const [kind, setKind] = useState<ThemeKind>(initialKind);
	const [draft, setDraft] = useState<ThemeDraft | null>(null);
	const [sourceId, setSourceId] = useState<string>('');
	const [saving, setSaving] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const board = activeBoardTheme.value;
	const piece = activePieceTheme.value;
	const pieceSet = activePieceSet.value;
	const boards = boardThemes.value;
	const pieces = pieceThemes.value;
	const customBoards = customBoardThemes.value;
	const customPieces = customPieceThemes.value;
	const s = settings.value;
	if (!board || !piece || !pieceSet) return <EmptyState icon="board" title="Loading themes…" compact />;

	const list = kind === 'board' ? boards : pieces;
	const source = list.find((t) => t.id === sourceId) ?? (kind === 'board' ? board : piece);

	const begin = (k: ThemeKind, t: BoardTheme | PieceTheme, clone?: boolean) => {
		setKind(k);
		setDraft(k === 'board' ? startBoardDraft(t as BoardTheme, clone) : startPieceDraft(t as PieceTheme, clone));
	};

	const save = async (asNew: boolean) => {
		if (!draft) return;
		setSaving(true);
		try {
			const saved = await saveThemeDraft(draft, asNew);
			toast.success(`Saved “${saved.name}” and set it active`, { id: 'theme-save' });
			setDraft(null);
		} catch (e) {
			toast.error(`Could not save theme: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setSaving(false);
		}
	};

	const remove = async (t: BoardTheme | PieceTheme, k: ThemeKind) => {
		const wasActive = k === 'board' ? s.boardThemeId === t.id : s.pieceThemeId === t.id;
		await themesActions.remove(t.id);
		if (wasActive) updateSettings(k === 'board' ? { boardThemeId: DEFAULT_BOARD_THEME_ID } : { pieceThemeId: DEFAULT_PIECE_THEME_ID });
		if (draft?.theme.id === t.id) setDraft(null);
		toast.info(`Deleted “${t.name}”`, {
			id: 'theme-delete',
			action: {
				label: 'Undo',
				onClick: () => {
					void (k === 'board' ? themesActions.saveBoard(t as BoardTheme) : themesActions.savePiece(t as PieceTheme)).then(() => {
						if (wasActive) updateSettings(k === 'board' ? { boardThemeId: t.id } : { pieceThemeId: t.id });
					});
				},
			},
		});
	};

	const exportAll = () => downloadText('chess-themes.json', exportThemes(customBoards, customPieces));

	const previewBoard = draft?.kind === 'board' ? draft.theme : board;
	const previewPiece = draft?.kind === 'piece' ? draft.theme : piece;
	const customs = kind === 'board' ? customBoards : customPieces;

	return (
		<div class={cx('theme-editor', className)}>
			<div class="theme-editor__toolbar">
				<SegmentedControl
					options={KIND_OPTIONS}
					value={draft?.kind ?? kind}
					onChange={(k) => {
						setKind(k);
						setDraft(null);
						setSourceId('');
					}}
					ariaLabel="Theme kind"
					size="sm"
				/>
				<span class="theme-editor__toolbar-spacer" />
				<span class="theme-editor__io">
					<Button size="sm" variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>
						Import
					</Button>
					<Button size="sm" variant="ghost" icon="download" onClick={exportAll} disabled={!customBoards.length && !customPieces.length}>
						Export all
					</Button>
				</span>
				<input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importThemeFile(e)} aria-label="Import theme JSON" />
			</div>

			{!draft && (
				<div class="theme-editor__start">
					<Select
						label={kind === 'board' ? 'Start from board theme' : 'Start from piece theme'}
						value={source.id}
						options={list.map((t) => ({ value: t.id, label: `${t.name}${t.builtIn ? '' : ' (custom)'}` }))}
						onChange={setSourceId}
					/>
					<Button variant="primary" icon="copy" onClick={() => begin(kind, source, true)}>
						Clone &amp; edit
					</Button>
				</div>
			)}

			<div class={cx('theme-editor__workspace', draft && 'theme-editor__workspace--editing')}>
				<EditorPreview board={previewBoard} piece={previewPiece} />
				{draft && (
					<form
						class="theme-editor__form"
						onSubmit={(e) => {
							e.preventDefault();
							void save(false);
						}}
					>
						<Input
							label="Theme name"
							value={draft.theme.name}
							onInput={(e) => {
								const name = (e.target as HTMLInputElement).value;
								setDraft(draft.kind === 'board' ? { ...draft, theme: { ...draft.theme, name } } : { ...draft, theme: { ...draft.theme, name } });
							}}
						/>
						{draft.kind === 'board' ? (
							<BoardForm theme={draft.theme} onChange={(theme) => setDraft({ ...draft, theme })} />
						) : (
							<PieceForm theme={draft.theme} onChange={(theme) => setDraft({ ...draft, theme })} />
						)}
						<div class="theme-editor__actions">
							<Button variant="ghost" onClick={() => setDraft(null)}>
								Cancel
							</Button>
							{!draft.isNew && (
								<Button variant="secondary" onClick={() => void save(true)} loading={saving}>
									Save as new
								</Button>
							)}
							<Button type="submit" variant="primary" icon="save" loading={saving}>
								{draft.isNew ? 'Save theme' : 'Save changes'}
							</Button>
						</div>
					</form>
				)}
			</div>

			<section class="theme-editor__customs" aria-label="Custom themes">
				<h3 class="theme-editor__heading">Your {kind === 'board' ? 'board' : 'piece'} themes</h3>
				{customs.length === 0 ? (
					<p class="theme-editor__note">No custom {kind === 'board' ? 'board' : 'piece'} themes yet — clone one above.</p>
				) : (
					<ul class="theme-editor__custom-list" role="list">
						{kind === 'board'
							? customBoards.map((t) => (
									<CustomRow
										key={t.id}
										theme={t}
										active={s.boardThemeId === t.id}
										visual={<span class="theme-editor__swatch" style={{ '--sw-light': t.light, '--sw-dark': t.dark }} />}
										onUse={() => updateSettings({ boardThemeId: t.id })}
										onEdit={() => begin('board', t, false)}
										onExport={() => exportTheme(t, 'board')}
										onDelete={() => void remove(t, 'board')}
										onRename={(n) => renameTheme(t, 'board', n)}
									/>
								))
							: customPieces.map((t) => {
									const set = pieceSets.find((p) => p.id === t.assetId) ?? pieceSet;
									return (
										<CustomRow
											key={t.id}
											theme={t}
											active={s.pieceThemeId === t.id}
											visual={<PieceSetPreview pieceTheme={t} pieceSet={set} boardTheme={board} roles={['knight']} />}
											onUse={() => updateSettings({ pieceThemeId: t.id })}
											onEdit={() => begin('piece', t, false)}
											onExport={() => exportTheme(t, 'piece')}
											onDelete={() => void remove(t, 'piece')}
											onRename={(n) => renameTheme(t, 'piece', n)}
										/>
									);
								})}
					</ul>
				)}
			</section>
		</div>
	);
}
