import { Chess, normalizeMove } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { INITIAL_FEN, type Uci } from '../chess/types.js';
import { epdOf } from './id.js';
import type { Continuation, GraphFile, OpeningEntry, OpeningsFile } from './types.js';

/** Order for openings that share a final position: Lichess first, then shorter lines, then name. */
function compareSamePosition(a: OpeningEntry, b: OpeningEntry): number {
	const sa = a.source === 'lichess' ? 0 : 1;
	const sb = b.source === 'lichess' ? 0 : 1;
	return sa - sb || a.plies - b.plies || a.name.localeCompare(b.name);
}

function score(e: OpeningEntry | undefined): number {
	return e?.popularity?.score ?? -1;
}

/**
 * In-memory opening lookup over the shipped `openings` + `graph` datasets.
 * Positions are matched by EPD, so transpositions resolve to the same node.
 */
export class OpeningIndex {
	private readonly entries: OpeningEntry[];
	private readonly ids = new Map<string, OpeningEntry>();
	private readonly nodeByEpd = new Map<string, number>();
	/** node → openings ending there (sorted, best first). */
	private readonly endsAt = new Map<number, OpeningEntry[]>();
	/** node → openings whose line passes through or ends at it. */
	private readonly through = new Map<number, OpeningEntry[]>();

	private constructor(
		openings: OpeningsFile,
		private readonly graph: GraphFile,
	) {
		this.entries = openings.openings;
		for (const e of this.entries) this.ids.set(e.id, e);
		graph.epd.forEach((epd, i) => this.nodeByEpd.set(epd, i));
		for (const [node, list] of Object.entries(graph.ends)) {
			const found = list.map((id) => this.ids.get(id)).filter((e): e is OpeningEntry => !!e);
			if (found.length) this.endsAt.set(Number(node), found.sort(compareSamePosition));
		}
		for (const e of this.entries) {
			let node = 0;
			const seen = new Set<number>();
			for (const uci of e.uci) {
				const edge = graph.edges[node]?.find((ed) => ed[0] === uci);
				if (!edge) break;
				node = edge[2];
				if (seen.has(node)) continue;
				seen.add(node);
				let arr = this.through.get(node);
				if (!arr) this.through.set(node, (arr = []));
				arr.push(e);
			}
		}
	}

	static fromData(openings: OpeningsFile, graph: GraphFile): OpeningIndex {
		return new OpeningIndex(openings, graph);
	}

	byId(id: string): OpeningEntry | undefined {
		return this.ids.get(id);
	}

	all(): OpeningEntry[] {
		return this.entries;
	}

	private node(fenOrEpd: string): number | undefined {
		return this.nodeByEpd.get(epdOf(fenOrEpd));
	}

	/** Opening whose line ends exactly at this position (best match if several). */
	identify(fenOrEpd: string): OpeningEntry | undefined {
		const n = this.node(fenOrEpd);
		return n === undefined ? undefined : this.endsAt.get(n)?.[0];
	}

	/**
	 * Deepest named opening reached along a move sequence. Replays the moves, so
	 * transpositions and lines that leave and re-enter the book are recognised.
	 * Accepts standard (e1g1) or king-takes-rook (e1h1) castling UCI. Stops at the first illegal move.
	 */
	identifyLine(uci: Uci[], startFen: string = INITIAL_FEN): OpeningEntry | undefined {
		const setup = parseFen(startFen);
		if (setup.isErr) return undefined;
		const chess = Chess.fromSetup(setup.value);
		if (chess.isErr) return undefined;
		const pos = chess.value;
		let best = this.identify(startFen);
		for (const u of uci) {
			const parsed = parseUci(u);
			if (!parsed) break;
			const move = normalizeMove(pos, parsed);
			if (!pos.isLegal(move)) break;
			pos.play(move);
			const hit = this.identify(makeFen(pos.toSetup()));
			if (hit) best = hit;
		}
		return best;
	}

	/** Book moves from this position, most popular first. */
	continuations(fen: string): Continuation[] {
		const n = this.node(fen);
		if (n === undefined) return [];
		const out: Continuation[] = (this.graph.edges[n] ?? []).map(([uci, san, to]) => {
			const thru = this.through.get(to) ?? [];
			const named = this.endsAt.get(to)?.[0];
			const pop = named?.popularity?.score ?? thru.reduce((m, e) => Math.max(m, score(e)), -1);
			const c: Continuation = { uci, san, openingIds: thru.map((e) => e.id) };
			if (named) c.name = named.name;
			if (pop >= 0) c.popularity = pop;
			return c;
		});
		return out.sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1) || b.openingIds.length - a.openingIds.length);
	}

	/** Openings whose line passes through or ends at this position, shortest first. */
	openingsThrough(fenOrEpd: string): OpeningEntry[] {
		const n = this.node(fenOrEpd);
		if (n === undefined) return [];
		const list = n === 0 ? this.entries : (this.through.get(n) ?? []);
		return [...list].sort((a, b) => a.plies - b.plies || score(b) - score(a) || a.name.localeCompare(b.name));
	}

	/**
	 * ECO letter of the notes chunk that holds the note for this position (if any):
	 * the letter of the smallest ECO code among openings through / ending at it.
	 */
	notesChunk(fenOrEpd: string): string | undefined {
		const n = this.node(fenOrEpd);
		if (n === undefined) return undefined;
		return notesChunkOf(this.through.get(n) ?? []);
	}
}

/** Shared rule (also used by the data pipeline): min ECO letter among the given openings. */
export function notesChunkOf(openings: Pick<OpeningEntry, 'eco'>[]): string | undefined {
	let min: string | undefined;
	for (const o of openings) if (min === undefined || o.eco < min) min = o.eco;
	return min?.[0];
}
