// Test fixtures: a tiny openings dataset (subset of the real data shape).
import type { GraphFile, OpeningsFile, OpeningsManifest } from '@chess/core/openings';

export const FIXTURE_OPENINGS: OpeningsFile = {
	"version": 1,
	"openings": [
		{
			"id": "0iesatll0z5",
			"name": "Zukertort Opening: Queen's Gambit Invitation",
			"family": "Zukertort Opening",
			"eco": "A06",
			"uci": [
				"g1f3",
				"d7d5",
				"d2d4"
			],
			"san": [
				"Nf3",
				"d5",
				"d4"
			],
			"plies": 3,
			"perspective": "white",
			"epd": "rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq -",
			"source": "lichess",
			"variation": "Queen's Gambit Invitation"
		},
		{
			"id": "1291nq3124k",
			"name": "Sicilian Defense",
			"family": "Sicilian Defense",
			"eco": "B20",
			"uci": [
				"e2e4",
				"c7c5"
			],
			"san": [
				"e4",
				"c5"
			],
			"plies": 2,
			"perspective": "black",
			"epd": "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
			"source": "lichess",
			"popularity": {
				"games": 1000,
				"white": 50,
				"draws": 20,
				"black": 30,
				"score": 95
			}
		},
		{
			"id": "27t78tyap15",
			"name": "Sicilian Defense: Smith-Morra Gambit",
			"family": "Sicilian Defense",
			"eco": "B21",
			"uci": [
				"e2e4",
				"c7c5",
				"d2d4",
				"c5d4",
				"c2c3"
			],
			"san": [
				"e4",
				"c5",
				"d4",
				"cxd4",
				"c3"
			],
			"plies": 5,
			"perspective": "white",
			"epd": "rnbqkbnr/pp1ppppp/8/8/3pP3/2P5/PP3PPP/RNBQKBNR b KQkq -",
			"source": "lichess",
			"variation": "Smith-Morra Gambit"
		},
		{
			"id": "19j7rx9h1c3",
			"name": "King's Pawn Game",
			"family": "King's Pawn Game",
			"eco": "C20",
			"uci": [
				"e2e4",
				"e7e5"
			],
			"san": [
				"e4",
				"e5"
			],
			"plies": 2,
			"perspective": "white",
			"epd": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
			"source": "lichess"
		},
		{
			"id": "1w3i1xzrmhy",
			"name": "Vienna Game",
			"family": "Vienna Game",
			"eco": "C25",
			"uci": [
				"e2e4",
				"e7e5",
				"b1c3"
			],
			"san": [
				"e4",
				"e5",
				"Nc3"
			],
			"plies": 3,
			"perspective": "white",
			"epd": "rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -",
			"source": "eco.json"
		},
		{
			"id": "18a8o30z9cc",
			"name": "King's Knight Opening",
			"family": "King's Knight Opening",
			"eco": "C40",
			"uci": [
				"e2e4",
				"e7e5",
				"g1f3"
			],
			"san": [
				"e4",
				"e5",
				"Nf3"
			],
			"plies": 3,
			"perspective": "white",
			"epd": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -",
			"source": "lichess",
			"aliases": [
				"Open Game: 2.Nf3"
			],
			"popularity": {
				"games": 1000,
				"white": 50,
				"draws": 20,
				"black": 30,
				"score": 90
			}
		},
		{
			"id": "0ffassxvtk8",
			"name": "Ruy Lopez",
			"family": "Ruy Lopez",
			"eco": "C60",
			"uci": [
				"e2e4",
				"e7e5",
				"g1f3",
				"b8c6",
				"f1b5"
			],
			"san": [
				"e4",
				"e5",
				"Nf3",
				"Nc6",
				"Bb5"
			],
			"plies": 5,
			"perspective": "white",
			"epd": "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -",
			"source": "lichess",
			"popularity": {
				"games": 1000,
				"white": 50,
				"draws": 20,
				"black": 30,
				"score": 80
			}
		},
		{
			"id": "1tn665zyq5f",
			"name": "Ruy Lopez: Berlin Defense",
			"family": "Ruy Lopez",
			"eco": "C65",
			"uci": [
				"e2e4",
				"e7e5",
				"g1f3",
				"b8c6",
				"f1b5",
				"g8f6"
			],
			"san": [
				"e4",
				"e5",
				"Nf3",
				"Nc6",
				"Bb5",
				"Nf6"
			],
			"plies": 6,
			"perspective": "black",
			"epd": "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -",
			"source": "lichess",
			"variation": "Berlin Defense"
		},
		{
			"id": "06h9n79hd6s",
			"name": "Ruy Lopez: Berlin Defense, Rio Gambit Accepted",
			"family": "Ruy Lopez",
			"eco": "C67",
			"uci": [
				"e2e4",
				"e7e5",
				"g1f3",
				"b8c6",
				"f1b5",
				"g8f6",
				"e1g1",
				"f6e4"
			],
			"san": [
				"e4",
				"e5",
				"Nf3",
				"Nc6",
				"Bb5",
				"Nf6",
				"O-O",
				"Nxe4"
			],
			"plies": 8,
			"perspective": "black",
			"epd": "r1bqkb1r/pppp1ppp/2n5/1B2p3/4n3/5N2/PPPP1PPP/RNBQ1RK1 w kq -",
			"source": "lichess",
			"variation": "Berlin Defense, Rio Gambit Accepted"
		},
		{
			"id": "1jcqpchurn1",
			"name": "Queen's Pawn Game: Zukertort Variation",
			"family": "Queen's Pawn Game",
			"eco": "D02",
			"uci": [
				"d2d4",
				"d7d5",
				"g1f3"
			],
			"san": [
				"d4",
				"d5",
				"Nf3"
			],
			"plies": 3,
			"perspective": "white",
			"epd": "rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq -",
			"source": "lichess",
			"variation": "Zukertort Variation"
		},
		{
			"id": "16y3vpktp2q",
			"name": "Queen's Gambit",
			"family": "Queen's Gambit",
			"eco": "D06",
			"uci": [
				"d2d4",
				"d7d5",
				"c2c4"
			],
			"san": [
				"d4",
				"d5",
				"c4"
			],
			"plies": 3,
			"perspective": "white",
			"epd": "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -",
			"source": "lichess",
			"popularity": {
				"games": 1000,
				"white": 50,
				"draws": 20,
				"black": 30,
				"score": 70
			}
		},
		{
			"id": "0tzh9j2z1r8",
			"name": "Queen's Gambit Declined",
			"family": "Queen's Gambit Declined",
			"eco": "D30",
			"uci": [
				"d2d4",
				"d7d5",
				"c2c4",
				"e7e6"
			],
			"san": [
				"d4",
				"d5",
				"c4",
				"e6"
			],
			"plies": 4,
			"perspective": "black",
			"epd": "rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -",
			"source": "lichess"
		},
		{
			"id": "najdorf0001",
			"name": "Sicilian Defense: Najdorf Variation",
			"family": "Sicilian Defense",
			"variation": "Najdorf Variation",
			"eco": "B90",
			"uci": [
				"e2e4",
				"c7c5",
				"g1f3",
				"d7d6",
				"d2d4",
				"c5d4",
				"f3d4",
				"g8f6",
				"b1c3",
				"a7a6"
			],
			"san": [
				"e4",
				"c5",
				"Nf3",
				"d6",
				"d4",
				"cxd4",
				"Nxd4",
				"Nf6",
				"Nc3",
				"a6"
			],
			"plies": 10,
			"perspective": "black",
			"epd": "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -",
			"source": "lichess",
			"hasNotes": true,
			"aliases": [
				"Sicilian: Najdorf"
			],
			"popularity": {
				"games": 500000,
				"white": 45,
				"draws": 10,
				"black": 45,
				"score": 88
			}
		},
		{
			"id": "najdorf0002",
			"name": "Sicilian Defense: Najdorf Variation, English Attack",
			"family": "Sicilian Defense",
			"variation": "Najdorf Variation, English Attack",
			"eco": "B90",
			"uci": [
				"e2e4",
				"c7c5",
				"g1f3",
				"d7d6",
				"d2d4",
				"c5d4",
				"f3d4",
				"g8f6",
				"b1c3",
				"a7a6",
				"c1e3"
			],
			"san": [
				"e4",
				"c5",
				"Nf3",
				"d6",
				"d4",
				"cxd4",
				"Nxd4",
				"Nf6",
				"Nc3",
				"a6",
				"Be3"
			],
			"plies": 11,
			"perspective": "white",
			"epd": "x",
			"source": "lichess"
		},
		{
			"id": "italian0001",
			"name": "Italian Game",
			"family": "Italian Game",
			"eco": "C50",
			"uci": [
				"e2e4",
				"e7e5",
				"g1f3",
				"b8c6",
				"f1c4"
			],
			"san": [
				"e4",
				"e5",
				"Nf3",
				"Nc6",
				"Bc4"
			],
			"plies": 5,
			"perspective": "white",
			"epd": "y",
			"source": "lichess",
			"aliases": [
				"Giuoco Piano Family"
			],
			"popularity": {
				"games": 900000,
				"white": 51,
				"draws": 8,
				"black": 41,
				"score": 97
			}
		}
	]
};

export const FIXTURE_GRAPH: GraphFile = {"version":1,"epd":["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -","rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -","rnbqkbnr/ppp1pppp/8/3p4/8/5N2/PPPPPPPP/RNBQKB1R w KQkq -","rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R b KQkq -","rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -","rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -","rnbqkbnr/pp1ppppp/8/2p5/3PP3/8/PPP2PPP/RNBQKBNR b KQkq -","rnbqkbnr/pp1ppppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR w KQkq -","rnbqkbnr/pp1ppppp/8/8/3pP3/2P5/PP3PPP/RNBQKBNR b KQkq -","rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -","rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -","rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -","r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -","r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -","r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -","r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq -","r1bqkb1r/pppp1ppp/2n5/1B2p3/4n3/5N2/PPPP1PPP/RNBQ1RK1 w kq -","rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -","rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -","rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq -","rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -"],"edges":[[["g1f3","Nf3",1],["e2e4","e4",4],["d2d4","d4",17]],[["d7d5","d5",2]],[["d2d4","d4",3]],[],[["c7c5","c5",5],["e7e5","e5",9]],[["d2d4","d4",6]],[["c5d4","cxd4",7]],[["c2c3","c3",8]],[],[["b1c3","Nc3",10],["g1f3","Nf3",11]],[],[["b8c6","Nc6",12]],[["f1b5","Bb5",13]],[["g8f6","Nf6",14]],[["e1g1","O-O",15]],[["f6e4","Nxe4",16]],[],[["d7d5","d5",18]],[["g1f3","Nf3",3],["c2c4","c4",19]],[["e7e6","e6",20]],[]],"ends":{"3":["0iesatll0z5","1jcqpchurn1"],"5":["1291nq3124k"],"8":["27t78tyap15"],"9":["19j7rx9h1c3"],"10":["1w3i1xzrmhy"],"11":["18a8o30z9cc"],"13":["0ffassxvtk8"],"14":["1tn665zyq5f"],"16":["06h9n79hd6s"],"19":["16y3vpktp2q"],"20":["0tzh9j2z1r8"]}};

export const FIXTURE_NOTES = {
	version: 1,
	notes: {
		'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': { text: 'The Sicilian Defence.', source: 'Wikibooks — Chess Opening Theory (CC BY-SA 4.0)', url: 'https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...c5' },
	},
};

export const FIXTURE_MANIFEST: OpeningsManifest = {
	version: 1,
	generatedAt: '2026-10-12T00:00:00.000Z',
	counts: { openings: FIXTURE_OPENINGS.openings.length, positions: FIXTURE_GRAPH.epd.length, notes: 1, withPopularity: 5 },
	files: { openings: 'openings.v1.aaaa.json', graph: 'graph.v1.bbbb.json', notes: { B: 'notes.v1.B.cccc.json' } },
	attribution: ['Opening names: lichess-org/chess-openings (CC0)'],
};

/** In-memory fetch serving the fixture files under /data. */
export function fixtureFetch(overrides: Record<string, unknown> = {}): { fetch: (url: string) => Promise<Response>; calls: string[] } {
	const files: Record<string, unknown> = {
		'/data/manifest.json': FIXTURE_MANIFEST,
		'/data/openings.v1.aaaa.json': FIXTURE_OPENINGS,
		'/data/graph.v1.bbbb.json': FIXTURE_GRAPH,
		'/data/notes.v1.B.cccc.json': FIXTURE_NOTES,
		...overrides,
	};
	const calls: string[] = [];
	return {
		calls,
		fetch: async (url: string) => {
			calls.push(url);
			const body = files[url];
			if (body === undefined) return new Response('not found', { status: 404 });
			if (body instanceof Error) throw body;
			return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
		},
	};
}

/** Minimal Cache Storage stand-in (one cache). */
export function memoryCaches(): CacheStorage {
	const store = new Map<string, Response>();
	const cache = {
		match: async (req: RequestInfo) => store.get(typeof req === 'string' ? req : req.url)?.clone(),
		put: async (req: RequestInfo, res: Response) => void store.set(typeof req === 'string' ? req : req.url, res.clone()),
		delete: async (req: RequestInfo) => store.delete(typeof req === 'string' ? req : req.url),
		keys: async () => [...store.keys()].map((url) => ({ url }) as Request),
	} as unknown as Cache;
	return { open: async () => cache, has: async () => true, delete: async () => true, keys: async () => [], match: async () => undefined } as unknown as CacheStorage;
}
