import type { GraphFile } from './core.js';
import type { MergedOpening } from './merge.js';

/** Build the position graph: one node per EPD (transpositions merge), edges deduped by UCI per node. Node 0 = start. */
export function buildGraph(openings: MergedOpening[], version: number): GraphFile {
	const epd: string[] = [];
	const index = new Map<string, number>();
	const edges: GraphFile['edges'] = [];
	const ends: GraphFile['ends'] = {};
	const nodeOf = (e: string): number => {
		let i = index.get(e);
		if (i === undefined) {
			i = epd.length;
			index.set(e, i);
			epd.push(e);
			edges.push([]);
		}
		return i;
	};
	if (openings.length) nodeOf(openings[0]!.epds[0]!);
	for (const { entry, epds } of openings) {
		let from = nodeOf(epds[0]!);
		for (let p = 0; p < entry.uci.length; p++) {
			const to = nodeOf(epds[p + 1]!);
			const list = edges[from]!;
			if (!list.some((e) => e[0] === entry.uci[p])) list.push([entry.uci[p]!, entry.san[p]!, to]);
			from = to;
		}
		(ends[from] ??= []).push(entry.id);
	}
	return { version, epd, edges, ends };
}
