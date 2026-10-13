// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyUci, engineMeta, INITIAL_FEN } from '@chess/core';
import { MaiaAdapter, type OrtLike } from '../adapters/MaiaAdapter';
import type { EngineAssetStore } from '../assetStore';
import { env, fsPath, nodeFs } from './nodeApi';
import { boardToTensor, decodePolicy, eloCategory, encodePosition, mirrorFen, mirrorUci, sampleMove } from '../maia/encode';

const { readFileSync, existsSync } = await nodeFs();
const vocab = JSON.parse(readFileSync(fsPath('../../../../public/engines/maia/all_moves.json', import.meta.url), 'utf8')) as Record<string, number>;
const fetchMoves = (async () => new Response(JSON.stringify(vocab))) as unknown as typeof fetch;

const line = (moves: string): string => moves.split(' ').reduce((f, m) => applyUci(f, m)!.fen, INITIAL_FEN);
const top = (p: { policy: { uci: string; prob: number }[] }): string =>
	p.policy
		.slice(0, 3)
		.map((m) => `${m.uci}:${m.prob.toFixed(2)}`)
		.join(' ');

function memStore(model?: Uint8Array): EngineAssetStore {
	const files = new Map<string, Uint8Array>();
	return {
		supported: true,
		has: async (urls: string[]) => urls.every((u) => files.has(u) || (model !== undefined && u.endsWith('.onnx'))),
		arrayBuffer: async (url: string) => (files.get(url) ?? model)?.slice().buffer,
		importBlob: async (url: string, b: Blob) => void files.set(url, new Uint8Array(await b.arrayBuffer())),
	} as unknown as EngineAssetStore;
}

describe('Maia-2 encoding', () => {
	it('elo categories', () => {
		expect([600, 1099, 1100, 1199, 1500, 1999, 2000, 2600].map(eloCategory)).toEqual([0, 0, 1, 1, 5, 9, 10, 10]);
	});

	it('start position planes', () => {
		const t = boardToTensor(INITIAL_FEN);
		expect(t.length).toBe(18 * 64);
		expect(t[8 + 4]).toBe(1); // white pawn e2 (plane 0)
		expect(t[5 * 64 + 4]).toBe(1); // white king e1
		expect(t[11 * 64 + 7 * 8 + 4]).toBe(1); // black king e8
		expect(t.slice(12 * 64, 17 * 64).every((v) => v === 1)).toBe(true); // turn + KQkq
		expect(t.slice(17 * 64).every((v) => v === 0)).toBe(true);
		expect(t.reduce((a, b) => a + b, 0)).toBe(32 + 5 * 64);
	});

	it('mirrors black-to-move positions and their moves', () => {
		const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b Kq e3 1 2';
		expect(mirrorFen(fen)).toBe('rnbqkb1r/pppp1ppp/5n2/4p3/4P3/8/PPPP1PPP/RNBQKBNR w Qk e6 1 2');
		expect(mirrorUci('e7e5')).toBe('e2e4');
		expect(mirrorUci('a2a1q')).toBe('a7a8q');
		const enc = encodePosition(fen);
		expect(enc.mirrored).toBe(true);
		expect(enc.legalModel).toContain('b1c3');
		expect(enc.legalReal).toContain('b8c6');
		// all legal moves exist in the 1880-move vocabulary
		expect(enc.legalModel.every((m) => vocab[m] !== undefined)).toBe(true);
	});

	it('drops illegal en-passant squares like python-chess', () => {
		const enc = encodePosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
		expect(enc.boards.slice(17 * 64).every((v) => v === 0)).toBe(true);
	});

	it('castling and promotions use the vocabulary format', () => {
		const enc = encodePosition('r3k2r/1P6/8/8/8/8/8/R3K2R w KQkq - 0 1');
		expect(enc.legalModel).toEqual(expect.arrayContaining(['e1g1', 'e1c1', 'b7b8n', 'b7a8q']));
		expect(enc.legalModel.every((m) => vocab[m] !== undefined)).toBe(true);
	});

	it('decodes policy over legal moves and samples', () => {
		const enc = encodePosition(INITIAL_FEN);
		const logits = new Float32Array(1880);
		logits[vocab['e2e4']!] = 5;
		logits[vocab['d2d4']!] = 4;
		logits[vocab['a1h8']!] = 100; // illegal: must be ignored
		const pol = decodePolicy(logits, enc, vocab);
		expect(pol.length).toBe(20);
		expect(pol[0]!.uci).toBe('e2e4');
		expect(pol.reduce((a, m) => a + m.prob, 0)).toBeCloseTo(1, 5);
		expect(sampleMove(pol, 0)!.uci).toBe('e2e4');
		expect(sampleMove(pol, 1, () => 0.9999)!.uci).not.toBe(undefined);
	});
});

describe('MaiaAdapter', () => {
	it("is 'unavailable' with reason 'model not downloaded' until the model is cached", async () => {
		const a = new MaiaAdapter(engineMeta('maia')!, { store: memStore(), fetchFn: fetchMoves, loadOrt: async () => ({}) as OrtLike });
		await expect(a.init()).rejects.toThrow(/model not downloaded/);
		expect(a.status).toBe('unavailable');
		expect(a.unavailableReason).toBe('model not downloaded');
	});

	it('runs inference through an injected runtime (mock ORT) and un-mirrors for black', async () => {
		const runs: Record<string, unknown>[] = [];
		const ort: OrtLike = {
			env: { wasm: {} },
			Tensor: class {
				constructor(
					readonly type: string,
					readonly data: unknown,
					readonly dims?: readonly number[],
				) {}
			} as unknown as OrtLike['Tensor'],
			InferenceSession: {
				create: async () => ({
					run: async (feeds: Record<string, unknown>) => {
						runs.push(feeds);
						const logits = new Float32Array(1880);
						logits[vocab['g1f3']!] = 10; // model frame: Nf3 → real frame for black: Nf6 (g8f6)
						return { logits_maia: { data: logits }, logits_value: { data: new Float32Array([0.5]) } };
					},
				}),
			},
		};
		let t = 0;
		const a = new MaiaAdapter(engineMeta('maia')!, { store: memStore(new Uint8Array([1])), fetchFn: fetchMoves, loadOrt: async () => ort, now: () => (t += 1000) });
		const res = await a.play({ fen: INITIAL_FEN, moves: ['e2e4'] }, { targetElo: 1500, think: { preset: 'fast' } });
		expect(res.uci).toBe('g8f6');
		expect(res.info?.policy).toBeGreaterThan(0.9);
		const feeds = runs[0] as { elo_self: { data: BigInt64Array }; boards: { dims: number[] } };
		expect(feeds.elo_self.data[0]).toBe(5n);
		expect(feeds.boards.dims).toEqual([1, 18, 8, 8]);
	});

	it('uses the openingMove hook before ply 10 (Maia-2 was not trained on plies 0–9)', async () => {
		const asked: number[] = [];
		const a = new MaiaAdapter(engineMeta('maia')!, {
			store: memStore(new Uint8Array([1])),
			fetchFn: fetchMoves,
			loadOrt: async () => {
				throw new Error('model must not run for book moves');
			},
			openingMove: (_fen, ply) => (asked.push(ply), 'e7e5'),
			now: () => 1e12 + asked.length * 1e6,
		});
		const res = await a.play({ fen: INITIAL_FEN, moves: ['e2e4'] }, { targetElo: 1500, think: { preset: 'fast' } });
		expect(res.uci).toBe('e7e5');
		expect(asked).toEqual([1]);
	});

	// REAL model: set MAIA_MODEL_PATH or place it at /tmp/maia/dl/maia_rapid.onnx (89 MB, see README).
	const modelPath: string | undefined = env('MAIA_MODEL_PATH') ?? '/tmp/maia/dl/maia_rapid.onnx';
	it.skipIf(!modelPath || !existsSync(modelPath))('real Maia-2 ONNX: plausible human moves for both colours', async () => {
		const model = new Uint8Array(readFileSync(modelPath!));
		const a = new MaiaAdapter(engineMeta('maia')!, {
			store: memStore(model),
			fetchFn: fetchMoves,
			loadOrt: async () => (await import('onnxruntime-web')) as unknown as OrtLike,
		});
		// Maia-2 was trained with `first_n_moves: 10` (plies 0–9 skipped), so test from ply 10+.
		// Ruy Lopez after 5…Be7 (White to move): 6.Re1 is the overwhelming human choice.
		const ruyW = await a.evaluate(line('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7'), 1500);
		// …6.Re1 (Black to move): 6…b5 — exercises mirroring + un-mirroring.
		const ruyB = await a.evaluate(line('e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1'), 1500);
		// Black queen hangs on d5 to the e4 pawn (White to move).
		const hang = await a.evaluate('rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 6', 1900);
		// Back-rank mate for Black: …Rd1#.
		const mateB = await a.evaluate('6k1/5ppp/8/8/8/8/3r1PPP/6K1 b - - 0 30', 1900);
		console.log('ruyW', top(ruyW), 'ruyB', top(ruyB), 'hang', top(hang), 'mateB', top(mateB), 'winP(ruyW)', ruyW.whiteWinProb);
		expect(ruyW.policy[0]!.uci).toBe('f1e1');
		expect(ruyB.policy[0]!.uci).toBe('b7b5');
		expect(hang.policy[0]!.uci).toBe('e4d5');
		expect(mateB.policy[0]!.uci).toBe('d2d1');
		expect(ruyW.whiteWinProb).toBeGreaterThan(0.35);
		expect(ruyW.whiteWinProb).toBeLessThan(0.7);
	}, 60_000);
});
