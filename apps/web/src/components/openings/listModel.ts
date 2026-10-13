// Pure: search results → VirtualList items (flat or grouped by family, with an
// optional inline preview block that spans several fixed-height rows).
import type { OpeningEntry } from '@chess/core/openings';

export type OpeningListItem =
	| { kind: 'opening'; index: number }
	| { kind: 'family'; family: string; count: number; expanded: boolean }
	| { kind: 'preview'; index: number }
	| { kind: 'spacer'; key: string };

export interface ListModelOptions {
	group: 'flat' | 'family';
	/** Families currently expanded (grouped mode). */
	expanded: ReadonlySet<string>;
	/** Expand every family (e.g. while searching). */
	expandAll?: boolean;
	/** Insert an inline preview after this entry index. */
	previewAfter?: number;
	/** Rows the inline preview occupies (1 preview + n-1 spacers). */
	previewRows?: number;
}

export function buildListItems(results: ArrayLike<number>, entries: readonly OpeningEntry[], opts: ListModelOptions): OpeningListItem[] {
	const out: OpeningListItem[] = [];
	const pushOpening = (index: number) => {
		out.push({ kind: 'opening', index });
		if (opts.previewAfter === index) {
			out.push({ kind: 'preview', index });
			for (let k = 1; k < (opts.previewRows ?? 1); k++) out.push({ kind: 'spacer', key: `sp${k}` });
		}
	};
	if (opts.group === 'flat') {
		for (let i = 0; i < results.length; i++) pushOpening(results[i]!);
		return out;
	}
	const groups = new Map<string, number[]>();
	for (let i = 0; i < results.length; i++) {
		const idx = results[i]!;
		const fam = entries[idx]!.family;
		let g = groups.get(fam);
		if (!g) groups.set(fam, (g = []));
		g.push(idx);
	}
	for (const [family, list] of groups) {
		const expanded = !!opts.expandAll || opts.expanded.has(family);
		out.push({ kind: 'family', family, count: list.length, expanded });
		if (expanded) for (const idx of list) pushOpening(idx);
	}
	return out;
}

export function itemKey(item: OpeningListItem, entries: readonly OpeningEntry[]): string {
	switch (item.kind) {
		case 'opening':
			return entries[item.index]!.id;
		case 'family':
			return `f:${item.family}`;
		case 'preview':
			return `p:${entries[item.index]!.id}`;
		case 'spacer':
			return item.key;
	}
}
