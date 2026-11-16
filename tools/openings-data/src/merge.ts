import { openingId, splitName, type OpeningEntry } from './core.js';
import { perspectiveFor } from './perspective.js';
import { replaySan, type ReplayedLine } from './replay.js';
import { SOURCE_ORDER, type RawLine, type SourceTag } from './sources.js';
import { canonicalName, cleanName, hasMoveText, isRedundantAlias, nameKey } from './names.js';

/** Merged opening plus the per-ply EPDs of its line (needed by graph/notes, not shipped). */
export interface MergedOpening {
	entry: OpeningEntry;
	epds: string[];
}

export interface SourceMergeStats {
	/** New entries (a line no earlier source has). */
	new: number;
	/** Merged into an existing entry (same line or same final position); its name kept as an alias when it is a real alternative. */
	merged: number;
	failed: number;
	/** New line with no ECO code and no opening it extends (dropped). */
	noEco: number;
	/** New line whose name is not new (Wikibooks repeats names down the tree; dropped). */
	notNew?: number;
}

export interface MergeStats {
	lichess: number;
	ecoJson: number;
	failed: number;
	lichessDupLines: number;
	ecoMergedAsAlias: number;
	ecoNew: number;
	/** Per extra source (eco.json, scid, wikibooks). */
	bySource: Record<string, SourceMergeStats>;
}

/**
 * Add `name` as an alias when it is a real alternative: not the same name spelled differently
 * (case, accents, punctuation, Defence/Defense) and not a name made of move text.
 */
export function addAlias(entry: OpeningEntry, name: string): void {
	const n = cleanName(name);
	if (!n || hasMoveText(n) || /^[A-E]\d\d$/.test(n)) return;
	const key = nameKey(n);
	if (!key || nameKey(entry.name) === key || isRedundantAlias(n, entry.name)) return;
	entry.aliases ??= [];
	if (entry.aliases.some((a) => nameKey(a) === key)) return;
	entry.aliases.push(n);
}

function makeEntry(raw: RawLine, line: ReplayedLine, name = raw.name, eco = raw.eco): OpeningEntry {
	const { family, variation } = splitName(name);
	const plies = line.uci.length;
	const entry: OpeningEntry = {
		id: openingId(line.uci),
		name,
		family,
		eco,
		uci: line.uci,
		san: line.san,
		plies,
		perspective: perspectiveFor(name, plies),
		epd: line.epds[plies]!,
		source: raw.source,
	};
	if (variation) entry.variation = variation;
	return entry;
}

/**
 * Lichess lines are canonical: each distinct move sequence is an entry (same line twice → alias).
 * Then each extra source in order (eco.json, SCID, Wikibooks), shortest lines first: a line that
 * already exists — same moves, or the same final position by another move order — adds its name
 * as an alias (real alternatives only, see addAlias); a new line becomes an entry with a
 * canonical name (canonicalName) and the ECO of the opening it extends when it has none.
 * So every move line appears once, under its best (earliest-source) name.
 */
export function mergeOpenings(lichess: RawLine[], eco: RawLine[], extra: RawLine[] = []): { openings: MergedOpening[]; stats: MergeStats } {
	const stats: MergeStats = { lichess: 0, ecoJson: 0, failed: 0, lichessDupLines: 0, ecoMergedAsAlias: 0, ecoNew: 0, bySource: {} };
	const byLine = new Map<string, MergedOpening>();
	const byEpd = new Map<string, MergedOpening[]>();
	const out: MergedOpening[] = [];

	const add = (raw: RawLine, line: ReplayedLine, name?: string, ecoCode?: string) => {
		const m: MergedOpening = { entry: makeEntry(raw, line, name, ecoCode), epds: line.epds };
		for (const a of raw.aliases) addAlias(m.entry, a);
		byLine.set(line.uci.join(' '), m);
		const list = byEpd.get(m.entry.epd) ?? [];
		list.push(m);
		byEpd.set(m.entry.epd, list);
		out.push(m);
		return m;
	};
	/** Deepest existing opening whose line is a strict prefix of `uci`. */
	const ancestorOf = (uci: string[]): OpeningEntry | undefined => {
		for (let k = uci.length - 1; k > 0; k--) {
			const hit = byLine.get(uci.slice(0, k).join(' '));
			if (hit) return hit.entry;
		}
		return undefined;
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
	const families = new Set(out.map((m) => nameKey(m.entry.family)));
	const usedNames = new Set(out.map((m) => nameKey(m.entry.name)));

	const ordered = [...eco, ...extra].map((raw, i) => ({ raw, i }));
	const rank = (r: RawLine) => SOURCE_ORDER.indexOf(r.source);
	ordered.sort((a, b) => rank(a.raw) - rank(b.raw) || a.raw.sans.length - b.raw.sans.length || a.i - b.i);
	for (const { raw } of ordered) {
		const st = (stats.bySource[raw.source] ??= { new: 0, merged: 0, failed: 0, noEco: 0 });
		const line = replaySan(raw.sans);
		if (!line || line.uci.length === 0) {
			stats.failed++;
			st.failed++;
			continue;
		}
		const epd = line.epds[line.uci.length]!;
		const same = byLine.get(line.uci.join(' ')) ?? byEpd.get(epd)?.[0];
		const ancestor = ancestorOf(line.uci);
		if (same) {
			addAlias(same.entry, canonicalName(raw.name, ancestorOf(same.entry.uci)));
			for (const a of raw.aliases) addAlias(same.entry, canonicalName(a));
			st.merged++;
			if (raw.source === 'eco.json') stats.ecoMergedAsAlias++;
			continue;
		}
		const code = raw.eco || ancestor?.eco;
		if (!code) {
			st.noEco++;
			continue;
		}
		// Only Wikibooks gives bare variation names ("English attack"); other sources name the family.
		const name = canonicalName(raw.name, ancestor, raw.source === 'wikibooks' ? families : undefined);
		// Wikibooks repeats names down the tree: keep a page only when it names something new.
		if (raw.source === 'wikibooks' && (hasMoveText(name) || name.length > 80 || usedNames.has(nameKey(name)) || (ancestor && isRedundantAlias(cleanName(raw.name), ancestor.name)))) {
			st.notNew = (st.notNew ?? 0) + 1;
			continue;
		}
		add(raw, line, name, code);
		usedNames.add(nameKey(name));
		st.new++;
		if (raw.source === 'eco.json') stats.ecoNew++;
	}
	stats.ecoJson = eco.length;

	// An alias that is another opening's own name is not an alternative name for this one.
	const primaryKeys = new Set(out.map((m) => nameKey(m.entry.name)));
	for (const { entry } of out) {
		if (!entry.aliases) continue;
		entry.aliases = entry.aliases.filter((a) => !primaryKeys.has(nameKey(a)));
		if (!entry.aliases.length) delete entry.aliases;
	}

	const ids = new Map<string, OpeningEntry>();
	for (const { entry } of out) {
		const prev = ids.get(entry.id);
		if (prev) throw new Error(`openingId collision: ${entry.id} (${prev.name} / ${entry.name})`);
		ids.set(entry.id, entry);
	}

	out.sort(
		(a, b) =>
			a.entry.eco.localeCompare(b.entry.eco) ||
			SOURCE_ORDER.indexOf(a.entry.source as SourceTag) - SOURCE_ORDER.indexOf(b.entry.source as SourceTag) ||
			a.entry.name.localeCompare(b.entry.name) ||
			a.entry.plies - b.entry.plies,
	);
	return { openings: out, stats };
}
