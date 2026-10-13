import type { Color, Role } from '@chess/core';
import type { PieceSetAsset } from '@chess/core/theme';

/**
 * Piece sprites are fetched once per set and inlined into one hidden <svg> so
 * that <use href="#set--K"> works in every browser (external-file <use> with
 * gradients is unreliable) and CSS custom properties cascade into the symbols.
 * Symbol ids are namespaced `${setId}--${symbolId}`.
 */

const ROLE_LETTER: Record<Role, string> = {
	king: 'K',
	queen: 'Q',
	rook: 'R',
	bishop: 'B',
	knight: 'N',
	pawn: 'P',
};

const CONTAINER_ID = 'piece-sprites';
const loads = new Map<string, Promise<void>>();
const injected = new Set<string>();

export function pieceSymbolId(set: Pick<PieceSetAsset, 'id' | 'layout'>, color: Color, role: Role): string {
	const letter = ROLE_LETTER[role];
	return `${set.id}--${set.layout === 'shared' ? letter : (color === 'white' ? 'w' : 'b') + letter}`;
}

export function pieceSymbolHref(set: Pick<PieceSetAsset, 'id' | 'layout'>, color: Color, role: Role): string {
	return `#${pieceSymbolId(set, color, role)}`;
}

export function spriteUrl(set: Pick<PieceSetAsset, 'sprite'>): string {
	if (/^(https?:|data:|\/)/.test(set.sprite)) return set.sprite;
	const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
	return base.replace(/\/?$/, '/') + set.sprite;
}

function container(): SVGSVGElement {
	let el = document.getElementById(CONTAINER_ID) as SVGSVGElement | null;
	if (!el) {
		el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		el.id = CONTAINER_ID;
		el.setAttribute('aria-hidden', 'true');
		el.setAttribute('focusable', 'false');
		el.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
		document.body.appendChild(el);
	}
	return el;
}

/** Inject sprite markup for a set (idempotent). Exported for tests / custom sets. */
export function injectSpriteMarkup(setId: string, svgText: string): void {
	if (injected.has(setId)) return;
	const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
	const root = doc.documentElement;
	if (!root || root.nodeName !== 'svg') throw new Error(`Invalid sprite for ${setId}`);
	const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	group.setAttribute('data-set', setId);
	for (const child of Array.from(root.children)) {
		const node = document.importNode(child, true) as Element;
		if (node.nodeName === 'symbol' && node.id) node.id = `${setId}--${node.id}`;
		group.appendChild(node);
	}
	container().appendChild(group);
	injected.add(setId);
}

export function isSpriteLoaded(setId: string): boolean {
	return injected.has(setId);
}

/** Fetch + inject a set's sprite. Cached per set; failures are retried on next call. */
export function loadPieceSprite(set: Pick<PieceSetAsset, 'id' | 'sprite'>): Promise<void> {
	if (injected.has(set.id)) return Promise.resolve();
	let p = loads.get(set.id);
	if (!p) {
		p = fetch(spriteUrl(set))
			.then((r) => {
				if (!r.ok) throw new Error(`Sprite ${set.id}: HTTP ${r.status}`);
				return r.text();
			})
			.then((text) => injectSpriteMarkup(set.id, text))
			.catch((err) => {
				loads.delete(set.id);
				throw err;
			});
		loads.set(set.id, p);
	}
	return p;
}
