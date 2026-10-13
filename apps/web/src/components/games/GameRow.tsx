// GameRow — one saved game: thumbnail, name (inline rename), opening, moves,
// result/mode/open badges, tags, updated time; ★ and a "more" menu.
// The whole row opens the game (stretched button under the actions).
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { mainline } from '@chess/core/chess';
import type { SavedGame } from '@chess/core/game';
import { Badge, type BadgeTone } from '@/components/common/Badge';
import { Chip } from '@/components/common/Chip';
import { IconButton } from '@/components/common/IconButton';
import { Menu, type MenuItem } from '@/components/common/Menu';
import { cx } from '@/lib/classNames';
import { formatRelativeTime } from '@/lib/format';
import { GameThumbnail } from './GameThumbnail';
import type { GameOpeningInfo } from './gamesQuery';
import './GameRow.scss';

/** Fixed row height (VirtualList). Keep in sync with GameRow.scss. */
export const GAME_ROW_HEIGHT = 92;
const MAX_TAGS = 2;

const MODE_LABEL: Record<SavedGame['mode'], string> = { analysis: 'Analysis', bot: 'vs Bot', 'local-pvp': 'Local', online: 'Online' };
const SOURCE_LABEL: Record<SavedGame['source']['kind'], string> = { opening: 'From opening', new: 'New game', fork: 'Fork', import: 'Imported', saved: 'Saved game', online: 'Online' };

export interface GameRowProps {
	game: SavedGame;
	opening?: GameOpeningInfo;
	/** A session linked to this game is open. */
	isOpen?: boolean;
	onOpen: () => void;
	onToggleFavorite: () => void;
	onRename: (name: string) => void;
	onDuplicate: () => void;
	onExport: () => void;
	onDelete: () => void;
}

export function resultLabel(game: SavedGame): { text: string; tone: BadgeTone; title: string } | null {
	if (!game.result) return null;
	if (game.result.winner === 'white') return { text: '1–0', tone: 'neutral', title: 'White won' };
	if (game.result.winner === 'black') return { text: '0–1', tone: 'neutral', title: 'Black won' };
	return { text: '½–½', tone: 'neutral', title: 'Draw' };
}

export function moveCountLabel(game: SavedGame): string {
	const plies = mainline(game.tree).length;
	if (!plies) return 'No moves';
	const moves = Math.ceil(plies / 2);
	return `${moves} move${moves === 1 ? '' : 's'}`;
}

export function GameRow({ game, opening, isOpen, onOpen, onToggleFavorite, onRename, onDuplicate, onExport, onDelete }: GameRowProps): JSX.Element {
	const [renaming, setRenaming] = useState(false);
	const [draft, setDraft] = useState(game.name);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!renaming) return;
		setDraft(game.name);
		requestAnimationFrame(() => inputRef.current?.select());
	}, [renaming]);

	const commit = () => {
		setRenaming(false);
		if (draft.trim() && draft.trim() !== game.name) onRename(draft.trim());
	};

	const result = resultLabel(game);
	const tags = game.tags.slice(0, MAX_TAGS);
	const moreTags = game.tags.length - tags.length;

	const items: MenuItem[] = [
		{ id: 'open', label: isOpen ? 'Go to session' : 'Open', icon: 'play', onSelect: onOpen },
		{ id: 'rename', label: 'Rename', icon: 'edit', onSelect: () => setRenaming(true) },
		{ id: 'duplicate', label: 'Duplicate', icon: 'copy', onSelect: onDuplicate },
		{ id: 'export', label: 'Export PGN', icon: 'download', onSelect: onExport },
		{ separator: true },
		{ id: 'delete', label: 'Delete', icon: 'trash', danger: true, onSelect: onDelete },
	];

	return (
		<article class={cx('game-row', isOpen && 'game-row--open', renaming && 'game-row--renaming')} aria-label={game.name}>
			{!renaming && (
				<button type="button" class="game-row__hit" onClick={onOpen} aria-label={`${isOpen ? 'Go to' : 'Open'} ${game.name}`} />
			)}
			<span class="game-row__thumb">
				<GameThumbnail fen={game.finalFen} label={`Final position of ${game.name}`} />
			</span>
			<span class="game-row__body">
				{renaming ? (
					<input
						ref={inputRef}
						class="game-row__rename"
						value={draft}
						maxLength={120}
						aria-label="Game name"
						onInput={(e) => setDraft(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								commit();
							} else if (e.key === 'Escape') {
								e.preventDefault();
								e.stopPropagation();
								setRenaming(false);
							}
						}}
						onBlur={commit}
					/>
				) : (
					<span class="game-row__name" title={game.name}>
						{game.name}
					</span>
				)}
				<span class="game-row__meta">
					{opening ? (
						<>
							{opening.eco && (
								<Chip size="sm" mono class="game-row__eco">
									{opening.eco}
								</Chip>
							)}
							<span class="game-row__opening" title={opening.name}>
								{opening.name}
							</span>
						</>
					) : (
						<span class="game-row__opening">{SOURCE_LABEL[game.source.kind]}</span>
					)}
					<span class="game-row__dot" aria-hidden="true">
						·
					</span>
					<span class="game-row__moves">{moveCountLabel(game)}</span>
				</span>
				<span class="game-row__foot">
					<span class="game-row__badges">
						{result && (
							<Badge tone={result.tone} title={result.title}>
								{result.text}
							</Badge>
						)}
						{game.mode !== 'analysis' && <Badge tone="accent">{MODE_LABEL[game.mode]}</Badge>}
						{isOpen && <Badge tone="success">Open</Badge>}
						{tags.map((t) => (
							<Chip key={t} size="sm" label={t} class="game-row__tag" />
						))}
						{moreTags > 0 && <span class="game-row__more-tags">+{moreTags}</span>}
					</span>
					<time class="game-row__time" dateTime={new Date(game.updatedAt).toISOString()} title={new Date(game.updatedAt).toLocaleString()}>
						{formatRelativeTime(game.updatedAt)}
					</time>
				</span>
			</span>
			<span class="game-row__actions">
				<IconButton
					icon={game.favorite ? 'star-filled' : 'star'}
					label={game.favorite ? 'Remove from favourites' : 'Add to favourites'}
					size="sm"
					active={game.favorite}
					class={cx('game-row__fav', game.favorite && 'game-row__fav--on')}
					onClick={onToggleFavorite}
				/>
				<Menu items={items} align="end" ariaLabel={`Actions for ${game.name}`} trigger={(p) => <IconButton {...p} icon="more" label="More actions" size="sm" />} />
			</span>
		</article>
	);
}
