import { describe, expect, it } from 'vitest';
import { INITIAL_FEN } from '../chess/types.js';
import { OpeningIndex, notesChunkOf, openingId, splitName } from './index.js';
import type { GraphFile, OpeningsFile } from './types.js';

// Generated from tools/openings-data/test/fixtures/mini.tsv + mini-eco.json (merge + buildGraph), with sample popularity.
const MINI_OPENINGS: OpeningsFile = {"version":1,"openings":[{"id":"0iesatll0z5","name":"Zukertort Opening: Queen's Gambit Invitation","family":"Zukertort Opening","eco":"A06","uci":["g1f3","d7d5","d2d4"],"san":["Nf3","d5","d4"],"plies":3,"perspective":"white","epd":"rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq -","source":"lichess","variation":"Queen's Gambit Invitation"},{"id":"1291nq3124k","name":"Sicilian Defense","family":"Sicilian Defense","eco":"B20","uci":["e2e4","c7c5"],"san":["e4","c5"],"plies":2,"perspective":"black","epd":"rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -","source":"lichess","popularity":{"games":1000,"white":50,"draws":20,"black":30,"score":95}},{"id":"27t78tyap15","name":"Sicilian Defense: Smith-Morra Gambit","family":"Sicilian Defense","eco":"B21","uci":["e2e4","c7c5","d2d4","c5d4","c2c3"],"san":["e4","c5","d4","cxd4","c3"],"plies":5,"perspective":"white","epd":"rnbqkbnr/pp1ppppp/8/8/3pP3/2P5/PP3PPP/RNBQKBNR b KQkq -","source":"lichess","variation":"Smith-Morra Gambit"},{"id":"19j7rx9h1c3","name":"King's Pawn Game","family":"King's Pawn Game","eco":"C20","uci":["e2e4","e7e5"],"san":["e4","e5"],"plies":2,"perspective":"white","epd":"rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -","source":"lichess"},{"id":"1w3i1xzrmhy","name":"Vienna Game","family":"Vienna Game","eco":"C25","uci":["e2e4","e7e5","b1c3"],"san":["e4","e5","Nc3"],"plies":3,"perspective":"white","epd":"rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -","source":"eco.json"},{"id":"18a8o30z9cc","name":"King's Knight Opening","family":"King's Knight Opening","eco":"C40","uci":["e2e4","e7e5","g1f3"],"san":["e4","e5","Nf3"],"plies":3,"perspective":"white","epd":"rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -","source":"lichess","aliases":["Open Game: 2.Nf3"],"popularity":{"games":1000,"white":50,"draws":20,"black":30,"score":90}},{"id":"0ffassxvtk8","name":"Ruy Lopez","family":"Ruy Lopez","eco":"C60","uci":["e2e4","e7e5","g1f3","b8c6","f1b5"],"san":["e4","e5","Nf3","Nc6","Bb5"],"plies":5,"perspective":"white","epd":"r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -","source":"lichess","popularity":{"games":1000,"white":50,"draws":20,"black":30,"score":80}},{"id":"1tn665zyq5f","name":"Ruy Lopez: Berlin Defense","family":"Ruy Lopez","eco":"C65","uci":["e2e4","e7e5","g1f3","b8c6","f1b5","g8f6"],"san":["e4","e5","Nf3","Nc6","Bb5","Nf6"],"plies":6,"perspective":"black","epd":"r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -","source":"lichess","variation":"Berlin Defense"},{"id":"06h9n79hd6s","name":"Ruy Lopez: Berlin Defense, Rio Gambit Accepted","family":"Ruy Lopez","eco":"C67","uci":["e2e4","e7e5","g1f3","b8c6","f1b5","g8f6","e1g1","f6e4"],"san":["e4","e5","Nf3","Nc6","Bb5","Nf6","O-O","Nxe4"],"plies":8,"perspective":"black","epd":"r1bqkb1r/pppp1ppp/2n5/1B2p3/4n3/5N2/PPPP1PPP/RNBQ1RK1 w kq -","source":"lichess","variation":"Berlin Defense, Rio Gambit Accepted"},{"id":"1jcqpchurn1","name":"Queen's Pawn Game: Zukertort Variation","family":"Queen's Pawn Game","eco":"D02","uci":["d2d4","d7d5","g1f3"],"san":["d4","d5","Nf3"],"plies":3,"perspective":"white","epd":"rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq -","source":"lichess","variation":"Zukertort Variation"},{"id":"16y3vpktp2q","name":"Queen's Gambit","family":"Queen's Gambit","eco":"D06","uci":["d2d4","d7d5","c2c4"],"san":["d4","d5","c4"],"plies":3,"perspective":"white","epd":"rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -","source":"lichess","popularity":{"games":1000,"white":50,"draws":20,"black":30,"score":70}},{"id":"0tzh9j2z1r8","name":"Queen's Gambit Declined","family":"Queen's Gambit Declined","eco":"D30","uci":["d2d4","d7d5","c2c4","e7e6"],"san":["d4","d5","c4","e6"],"plies":4,"perspective":"black","epd":"rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -","source":"lichess"}]};

const MINI_GRAPH: GraphFile = {"version":1,"epd":["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -","rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -","rnbqkbnr/ppp1pppp/8/3p4/8/5N2/PPPPPPPP/RNBQKB1R w KQkq -","rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq -","rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -","rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -","rnbqkbnr/pp1ppppp/8/2p5/3PP3/8/PPP2PPP/RNBQKBNR b KQkq -","rnbqkbnr/pp1ppppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR w KQkq -","rnbqkbnr/pp1ppppp/8/8/3pP3/2P5/PP3PPP/RNBQKBNR b KQkq -","rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -","rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -","rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -","r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -","r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -","r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -","r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq -","r1bqkb1r/pppp1ppp/2n5/1B2p3/4n3/5N2/PPPP1PPP/RNBQ1RK1 w kq -","rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -","rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -","rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -","rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -"],"edges":[[["g1f3","Nf3",1],["e2e4","e4",4],["d2d4","d4",17]],[["d7d5","d5",2]],[["d2d4","d4",3]],[],[["c7c5","c5",5],["e7e5","e5",9]],[["d2d4","d4",6]],[["c5d4","cxd4",7]],[["c2c3","c3",8]],[],[["b1c3","Nc3",10],["g1f3","Nf3",11]],[],[["b8c6","Nc6",12]],[["f1b5","Bb5",13]],[["g8f6","Nf6",14]],[["e1g1","O-O",15]],[["f6e4","Nxe4",16]],[],[["d7d5","d5",18]],[["g1f3","Nf3",3],["c2c4","c4",19]],[["e7e6","e6",20]],[]],"ends":{"3":["0iesatll0z5","1jcqpchurn1"],"5":["1291nq3124k"],"8":["27t78tyap15"],"9":["19j7rx9h1c3"],"10":["1w3i1xzrmhy"],"11":["18a8o30z9cc"],"13":["0ffassxvtk8"],"14":["1tn665zyq5f"],"16":["06h9n79hd6s"],"19":["16y3vpktp2q"],"20":["0tzh9j2z1r8"]}};

const idx = OpeningIndex.fromData(MINI_OPENINGS, MINI_GRAPH);
const byName = (n: string) => MINI_OPENINGS.openings.find((o) => o.name === n)!;
const AFTER_E4_E5_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

describe('openingId', () => {
	it('is stable, short and line-sensitive', () => {
		expect(openingId(['e2e4', 'e7e5'])).toBe(openingId(['e2e4', 'e7e5']));
		expect(openingId(['e2e4', 'e7e5'])).not.toBe(openingId(['e7e5', 'e2e4']));
		expect(openingId(['e2e4'])).toMatch(/^[0-9a-z]{11}$/);
		// Pinned value: changing the hash would orphan every saved favourite.
		expect(openingId(['e2e4', 'e7e5', 'g1f3'])).toBe(byName("King's Knight Opening").id);
		expect(openingId([])).toMatch(/^[0-9a-z]{11}$/);
	});

	it('has no collisions over many lines', () => {
		const files = 'abcdefgh';
		const seen = new Set<string>();
		for (const a of files) for (const b of files) for (const c of files) seen.add(openingId([`${a}2${a}4`, `${b}7${b}5`, `${c}1${c}3`]));
		expect(seen.size).toBe(512);
	});
});

describe('splitName', () => {
	it('splits family and variation', () => {
		expect(splitName('Sicilian Defense')).toEqual({ family: 'Sicilian Defense' });
		expect(splitName('Ruy Lopez: Berlin Defense, Rio Gambit Accepted')).toEqual({ family: 'Ruy Lopez', variation: 'Berlin Defense, Rio Gambit Accepted' });
		expect(splitName('Odd: ')).toEqual({ family: 'Odd' });
	});
});

describe('OpeningIndex', () => {
	it('byId / all', () => {
		const e = byName('Ruy Lopez');
		expect(idx.byId(e.id)).toBe(e);
		expect(idx.byId('nope')).toBeUndefined();
		expect(idx.all()).toHaveLength(MINI_OPENINGS.openings.length);
	});

	it('identify by FEN or EPD', () => {
		expect(idx.identify(AFTER_E4_E5_NF3)?.name).toBe("King's Knight Opening");
		expect(idx.identify(byName('Ruy Lopez').epd)?.name).toBe('Ruy Lopez');
		expect(idx.identify(INITIAL_FEN)).toBeUndefined();
	});

	it('identify prefers the Lichess entry at a transposed position', () => {
		const zuk = byName("Queen's Pawn Game: Zukertort Variation");
		const hit = idx.identify(zuk.epd)!;
		expect(hit.source).toBe('lichess');
		expect([zuk.id, byName("Zukertort Opening: Queen's Gambit Invitation").id]).toContain(hit.id);
	});

	it('identifyLine returns the deepest named opening along the line', () => {
		expect(idx.identifyLine(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'])?.name).toBe('Ruy Lopez');
		expect(idx.identifyLine(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4'])?.name).toBe('Ruy Lopez: Berlin Defense, Rio Gambit Accepted');
		// King-takes-rook castling form also works.
		expect(idx.identifyLine(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6', 'e1h1', 'f6e4'])?.name).toBe('Ruy Lopez: Berlin Defense, Rio Gambit Accepted');
		expect(idx.identifyLine(['a2a3'])).toBeUndefined();
		// Stops at an illegal move but keeps what it found.
		expect(idx.identifyLine(['e2e4', 'c7c5', 'e1e3'])?.name).toBe('Sicilian Defense');
	});

	it('identifyLine recognises transpositions through out-of-book move orders', () => {
		// 1.Nf3 d5 2.d4 is in the book; reaching it via a different order still identifies it.
		expect(idx.identifyLine(['d2d4', 'd7d5', 'g1f3'])?.epd).toBe(byName("Queen's Pawn Game: Zukertort Variation").epd);
	});

	it('identifyLine from a custom start FEN', () => {
		expect(idx.identifyLine(['g1f3'], 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')?.name).toBe("King's Knight Opening");
	});

	it('continuations list book moves, most popular first', () => {
		const c = idx.continuations('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
		expect(c.map((x) => x.san)).toEqual(['c5', 'e5']);
		expect(c[0]).toMatchObject({ uci: 'c7c5', name: 'Sicilian Defense', popularity: 95 });
		expect(c[1]!.name).toBe("King's Pawn Game");
		// popularity falls back to the best opening through the position.
		expect(c[1]!.popularity).toBe(90);
		expect(c[1]!.openingIds).toContain(byName('Ruy Lopez').id);
		expect(idx.continuations('8/8/8/8/8/8/8/K6k w - - 0 1')).toEqual([]);
	});

	it('openingsThrough lists openings passing through or ending at a position', () => {
		const names = idx.openingsThrough(AFTER_E4_E5_NF3).map((o) => o.name);
		expect(names).toEqual(["King's Knight Opening", 'Ruy Lopez', 'Ruy Lopez: Berlin Defense', 'Ruy Lopez: Berlin Defense, Rio Gambit Accepted']);
		expect(idx.openingsThrough(INITIAL_FEN)).toHaveLength(MINI_OPENINGS.openings.length);
		expect(idx.openingsThrough('8/8/8/8/8/8/8/K6k w - - 0 1')).toEqual([]);
	});

	it('notesChunk = smallest ECO letter through the position', () => {
		expect(idx.notesChunk('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe('B');
		expect(idx.notesChunk(AFTER_E4_E5_NF3)).toBe('C');
		expect(notesChunkOf([])).toBeUndefined();
	});
});
