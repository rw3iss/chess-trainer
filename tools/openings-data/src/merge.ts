import { openingId, splitName, type OpeningEntry } from './core.js';
import { perspectiveFor } from './perspective.js';
import { replaySan, type ReplayedLine } from './replay.js';
import type { RawLine } from './sources.js';

/** Merged opening plus the per-ply EPDs of its line (needed by graph/notes, not shipped). */
export interface MergedOpening {
	entry: OpeningEntry;
	epds: string[];
}

export interface MergeStats {
	lichess: number;
	ecoJson: number;
	failed: number;
	lichessDupLines: number;
	ecoMergedAsAlias: number;
	ecoNew: number;
}

function addAlias(entry: OpeningEntry, name: string): void {
	const n = name.replace(/\s+/g, ' ').trim();
	if (!n) return;
	const key = n.toLowerCase();
	if (entry.name.toLowerCase() === key) return;
	entry.aliases ??= [];
	if (entry.aliases.some((a) => a.toLowerCase() === key)) return;
	entry.aliases.push(n);
}

function makeEntry(raw: RawLine, line: ReplayedLine): OpeningEntry {
	const { family, variation } = splitName(raw.name);
	const plies = line.uci.length;
	const entry: OpeningEntry = {
		id: openingId(line.uci),
		name: raw.name,
		family,
		eco: raw.eco,
		uci: line.uci,
		san: line.san,
		plies,
		perspective: perspectiveFor(raw.name, plies),
		epd: line.epds[plies]!,
		source: raw.source,
	};
	if (variation) entry.variation = variation;
	return entry;
}

/**
 * Lichess lines are canonical: each distinct move sequence is an entry (same line twice → alias).
 * eco.json lines whose final EPD matches an existing entry contribute names as aliases;
 * otherwise they become new entries (several eco.json names at one EPD → one entry + aliases).
 */
export function mergeOpenings(lichess: RawLine[], eco: RawLine[]): { openings: MergedOpening[]; stats: MergeStats } {
	const stats: MergeStats = { lichess: 0, ecoJson: 0, failed: 0, lichessDupLines: 0, ecoMergedAsAlias: 0, ecoNew: 0 };
	const byLine = new Map<string, MergedOpening>();
	const byEpd = new Map<string, MergedOpening[]>();
	const out: MergedOpening[] = [];

	const add = (raw: RawLine, line: ReplayedLine) => {
		const m: MergedOpening = { entry: makeEntry(raw, line), epds: line.epds };
		for (const a of raw.aliases) addAlias(m.entry, a);
		byLine.set(line.uci.join(' '), m);
		const list = byEpd.get(m.entry.epd) ?? [];
		list.push(m);
		byEpd.set(m.entry.epd, list);
		out.push(m);
		return m;
	};

	for (const raw of lichess) {
		const line = replaySan(raw.sans);
		if (!line || line.uci.length === 0) {
			stats.failed++;
			continue;
		}
		const existing = byLine.get(line.uci.join(' '));
		if (existing) {
			addAlias(existing.entry, raw.name);
			stats.lichessDupLines++;
			continue;
		}
		add(raw, line);
		stats.lichess++;
	}

	for (const raw of eco) {
		const line = replaySan(raw.sans);
		if (!line || line.uci.length === 0) {
			stats.failed++;
			continue;
		}
		const epd = line.epds[line.uci.length]!;
		const same = byLine.get(line.uci.join(' ')) ?? byEpd.get(epd)?.[0];
		if (same) {
			addAlias(same.entry, raw.name);
			for (const a of raw.aliases) addAlias(same.entry, a);
			stats.ecoMergedAsAlias++;
			continue;
		}
		add(raw, line);
		stats.ecoNew++;
	}
	stats.ecoJson = eco.length;

	const ids = new Map<string, OpeningEntry>();
	for (const { entry } of out) {
		const prev = ids.get(entry.id);
		if (prev) throw new Error(`openingId collision: ${entry.id} (${prev.name} / ${entry.name})`);
		ids.set(entry.id, entry);
	}

	out.sort(
		(a, b) =>
			a.entry.eco.localeCompare(b.entry.eco) ||
			(a.entry.source === b.entry.source ? 0 : a.entry.source === 'lichess' ? -1 : 1) ||
			a.entry.name.localeCompare(b.entry.name) ||
			a.entry.plies - b.entry.plies,
	);
	return { openings: out, stats };
}
