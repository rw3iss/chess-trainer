// MoveList — two-column SAN pairs with move numbers, figurines, variations
// (indented blocks, nested ones inline in parens), comments + user notes inline,
// current move highlighted + auto-scrolled, click to jump, context menu
// (right-click / long-press): fork here, delete from here, promote, add/edit note.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { isOnMainline, type MoveNode, type MoveTree } from '@chess/core/chess';
import type { Session } from '@chess/core/game';
import type { MenuItem } from '@/components/common/Menu';
import { useContextMenu } from '@/components/common/ContextMenu';
import { useLongPress } from '@/hooks/useLongPress';
import { figurineSan } from '@/lib/format';
import { cx } from '@/lib/classNames';
import { layoutLine, layoutMainline } from './moveLayout';
import './MoveList.scss';

export interface MoveListActions {
	goto(nodeId: string): void;
	fork(nodeId: string): void;
	deleteFrom(nodeId: string): void;
	promote(nodeId: string): void;
	editNote(nodeId: string): void;
}

export interface MoveListProps {
	session: Pick<Session, 'tree' | 'cursor'>;
	actions: MoveListActions;
	figurines?: boolean;
	class?: string;
}

const NAG_GLYPH: Record<number, string> = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };

function nagText(n: MoveNode): string {
	return (n.nags ?? []).map((g) => NAG_GLYPH[g] ?? '').join('');
}

interface MoveCtx {
	tree: MoveTree;
	cursor: string;
	figurines: boolean;
	onPick(id: string): void;
	onMenu(e: { clientX: number; clientY: number }, node: MoveNode): void;
	onEditNote(id: string): void;
}

/** SAN with the leading piece letter as a (slightly larger) figurine glyph. */
function SanText({ san, figurines }: { san: string; figurines: boolean }): JSX.Element {
	if (!figurines || !/^[KQRBN]/.test(san)) return <span class="move__san">{figurines ? figurineSan(san) : san}</span>;
	const fig = figurineSan(san);
	return (
		<span class="move__san">
			<span class="move__fig" aria-hidden="true">
				{fig[0]}
			</span>
			<span class="visually-hidden">{san[0]}</span>
			{fig.slice(1)}
		</span>
	);
}

function MoveButton({ node, ctx, label, cell }: { node: MoveNode; ctx: MoveCtx; label?: string; cell?: boolean }): JSX.Element {
	const longPress = useLongPress((pt) => ctx.onMenu(pt, node));
	const current = node.id === ctx.cursor;
	return (
		<button
			type="button"
			class={cx('move', cell && 'move--cell', current && 'move--current')}
			data-node={node.id}
			aria-current={current ? 'step' : undefined}
			onClick={() => ctx.onPick(node.id)}
			onContextMenu={(e) => {
				e.preventDefault();
				ctx.onMenu(e, node);
			}}
			{...longPress}
		>
			{label && <span class="move__num">{label}</span>}
			<SanText san={node.san} figurines={ctx.figurines} />
			{node.nags?.length ? <span class="move__nag">{nagText(node)}</span> : null}
			{node.userNote && !cell ? <span class="move__note-dot" aria-label="has note" /> : null}
		</button>
	);
}

function Annotation({ node, ctx }: { node: MoveNode; ctx: MoveCtx }): JSX.Element {
	return (
		<span class="move-annotation">
			{node.comment?.trim() && <span class="move-annotation__comment">{node.comment}</span>}
			{node.userNote?.trim() && (
				<button type="button" class="move-annotation__note" onClick={() => ctx.onEditNote(node.id)} title="Edit your note">
					{node.userNote}
				</button>
			)}
		</span>
	);
}

function Line({ start, ctx, nested }: { start: MoveNode; ctx: MoveCtx; nested: boolean }): JSX.Element {
	const tokens = layoutLine(ctx.tree, start);
	return (
		<span class={cx('move-line', nested && 'move-line--nested')}>
			{nested && <span class="move-line__paren">(</span>}
			{tokens.map((t) =>
				t.kind === 'move' ? (
					<MoveButton key={t.node.id} node={t.node} ctx={ctx} label={t.label} />
				) : t.kind === 'comment' ? (
					<Annotation key={`c-${t.node.id}`} node={t.node} ctx={ctx} />
				) : (
					t.lines.map((l) => <Line key={`v-${l.id}`} start={l} ctx={ctx} nested />)
				),
			)}
			{nested && <span class="move-line__paren">)</span>}
		</span>
	);
}

export function MoveList({ session, actions, figurines = true, class: className }: MoveListProps): JSX.Element {
	const { tree, cursor } = session;
	const listRef = useRef<HTMLDivElement>(null);
	const menu = useContextMenu();
	const items = useMemo(() => layoutMainline(tree), [tree]);

	useEffect(() => {
		const el = listRef.current?.querySelector<HTMLElement>(`[data-node="${CSS.escape(cursor)}"]`);
		if (el) scrollIntoContainer(el);
	}, [cursor, tree]);

	const ctx: MoveCtx = {
		tree,
		cursor,
		figurines,
		onPick: actions.goto,
		onEditNote: actions.editNote,
		onMenu: (pt, node) => {
			const mainline = isOnMainline(tree, node.id);
			const parent = node.parentId ? tree.nodes[node.parentId] : undefined;
			const isFirstChild = parent?.children[0] === node.id;
			const menuItems: MenuItem[] = [
				{ heading: `${node.san}` },
				{ id: 'goto', label: 'Go to move', icon: 'eye', onSelect: () => actions.goto(node.id) },
				{ id: 'fork', label: 'Fork here', icon: 'fork', onSelect: () => actions.fork(node.id) },
				{ id: 'note', label: node.userNote ? 'Edit note' : 'Add note', icon: 'note', onSelect: () => actions.editNote(node.id) },
				{ id: 'promote', label: 'Promote variation', icon: 'promote', disabled: mainline && isFirstChild, onSelect: () => actions.promote(node.id) },
				{ separator: true },
				{ id: 'delete', label: 'Delete from here', icon: 'trash', danger: true, onSelect: () => actions.deleteFrom(node.id) },
			];
			menu.open(pt.clientX || pt.clientY ? pt : centerOf(node.id, listRef.current), menuItems);
		},
	};

	if (!items.length) {
		return (
			<div class={cx('move-list', 'move-list--empty', className)} ref={listRef}>
				<p class="move-list__hint">Make a move on the board, or press play to step through a loaded line.</p>
			</div>
		);
	}

	return (
		<div class={cx('move-list', className)} ref={listRef} role="list" aria-label="Moves">
			{items.map((it, i) => {
				if (it.kind === 'row') {
					return (
						<div class="move-row" role="listitem" key={`r-${i}`}>
							<span class="move-row__num">{it.num}</span>
							{it.white ? <MoveButton node={it.white} ctx={ctx} cell /> : <span class="move-row__elided">…</span>}
							{it.black ? <MoveButton node={it.black} ctx={ctx} cell /> : <span class="move-row__empty" />}
						</div>
					);
				}
				if (it.kind === 'comment') {
					return (
						<div class="move-block move-block--comment" role="listitem" key={`c-${it.node.id}`}>
							<Annotation node={it.node} ctx={ctx} />
						</div>
					);
				}
				return (
					<div class="move-block move-block--variations" role="listitem" key={`v-${i}`}>
						{it.lines.map((l) => (
							<div class="move-block__line" key={l.id}>
								<Line start={l} ctx={ctx} nested={false} />
							</div>
						))}
					</div>
				);
			})}
			{menu.element}
		</div>
	);
}

/** Scroll only the nearest scrollable ancestor (never the page) so the board stays put. */
function scrollIntoContainer(el: HTMLElement): void {
	let parent = el.parentElement;
	while (parent && parent !== document.body) {
		const oy = getComputedStyle(parent).overflowY;
		if ((oy === 'auto' || oy === 'scroll') && parent.scrollHeight > parent.clientHeight) break;
		parent = parent.parentElement;
	}
	if (!parent || parent === document.body) return;
	const p = parent.getBoundingClientRect();
	const r = el.getBoundingClientRect();
	const margin = 48;
	if (r.top < p.top + margin) parent.scrollTop -= p.top + margin - r.top;
	else if (r.bottom > p.bottom - margin) parent.scrollTop += r.bottom - (p.bottom - margin);
}

function centerOf(nodeId: string, root: HTMLElement | null): { clientX: number; clientY: number } {
	const el = root?.querySelector<HTMLElement>(`[data-node="${CSS.escape(nodeId)}"]`);
	const r = el?.getBoundingClientRect();
	return r ? { clientX: r.left + r.width / 2, clientY: r.bottom } : { clientX: 0, clientY: 0 };
}

