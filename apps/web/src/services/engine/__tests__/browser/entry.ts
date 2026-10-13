// Browser smoke entry (bundled by smoke.mjs). Exercises the real adapters in Chromium.
import { engineMeta, INITIAL_FEN, applyUci } from '@chess/core';
import { StockfishWorkerAdapter } from '../../adapters/StockfishWorkerAdapter';
import { MaiaAdapter } from '../../adapters/MaiaAdapter';
import { EngineAssetStore } from '../../assetStore';
import { EngineRegistry } from '../../registry';

const log: string[] = [];
const legal = (fen: string, uci: string): boolean => applyUci(fen, uci) !== null;

async function stockfish(): Promise<void> {
	const reg = new EngineRegistry({ idleDisposeMs: 0 });
	const list = await reg.list({ refreshRemote: false });
	log.push(`registry: ${list.map((e) => `${e.meta.id}=${e.availability.available ? 'ok' : e.availability.reason}`).join(' ')}`);
	const lite = await reg.getAdapter('sf-lite');
	const t0 = performance.now();
	await lite.init();
	log.push(`sf-lite init ${Math.round(performance.now() - t0)} ms`);
	const a = await lite.play({ fen: INITIAL_FEN, moves: [] }, { think: { movetimeMs: 300 } });
	if (!legal(INITIAL_FEN, a.uci)) throw new Error(`illegal ${a.uci}`);
	log.push(`sf-lite full strength: ${a.uci} depth ${a.info?.depth}`);
	const b = await lite.play({ fen: INITIAL_FEN, moves: ['e2e4'] }, { targetElo: 1400, think: { preset: 'fast' } });
	log.push(`sf-lite elo 1400: ${b.uci}`);
	let lines = 0;
	await new Promise<void>((resolve) => {
		const stop = lite.analyze({ fen: INITIAL_FEN, moves: [] }, { multiPv: 3, infinite: true }, (i) => {
			if (i.multipv === 3 && i.depth >= 10 && !lines++) {
				stop();
				resolve();
			}
		});
	});
	log.push('sf-lite multipv 3 analysis ok');
	lite.dispose();

	// On-demand path: same engine but wasm from Cache Storage via a blob: URL (as sf-full does).
	const store = new EngineAssetStore('smoke');
	const wasmUrl = new URL('/engines/stockfish/stockfish-19-lite-single.wasm', location.href).href;
	let lastFrac = 0;
	await store.download([{ url: wasmUrl }], (p) => (lastFrac = p.fraction));
	log.push(`download progress end ${lastFrac}`);
	const viaBlob = new StockfishWorkerAdapter(engineMeta('sf-full')!, {
		scriptUrl: '/engines/stockfish/stockfish-19-lite-single.js',
		resolveWasmUrl: () => store.blobUrl(wasmUrl, 'application/wasm'),
	});
	const c = await viaBlob.play({ fen: INITIAL_FEN, moves: [] }, { think: { movetimeMs: 100 } });
	log.push(`blob-wasm worker: ${c.uci}`);
	viaBlob.dispose();
	await store.remove([wasmUrl]);
}

async function maia(): Promise<void> {
	const res = await fetch('/models/maia_rapid.onnx', { method: 'HEAD' });
	if (!res.ok) {
		log.push('maia: model not served, skipped');
		return;
	}
	const store = new EngineAssetStore('smoke-maia');
	const modelUrl = new URL('/models/maia_rapid.onnx', location.href).href;
	await store.download([{ url: modelUrl }]);
	const m = new MaiaAdapter(engineMeta('maia')!, { store, modelUrl });
	const t0 = performance.now();
	await m.init();
	log.push(`maia init ${Math.round(performance.now() - t0)} ms`);
	const fen = 'r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 b kq - 1 7';
	const t1 = performance.now();
	const ev = await m.evaluate(fen, 1500);
	log.push(`maia eval ${Math.round(performance.now() - t1)} ms top ${ev.policy.slice(0, 3).map((p) => `${p.uci}:${p.prob.toFixed(2)}`).join(' ')}`);
	const play = await m.play({ fen, moves: [] }, { targetElo: 1500, think: { preset: 'fast' } });
	if (!legal(fen, play.uci)) throw new Error(`maia illegal ${play.uci}`);
	log.push(`maia play: ${play.uci}`);
	m.dispose();
	await store.remove([modelUrl]);
}

(window as unknown as { runSmoke: () => Promise<string[]> }).runSmoke = async () => {
	await stockfish();
	await maia();
	return log;
};
