import type { WorkerLike } from '../types';

/**
 * In-process fake of a Stockfish worker speaking UCI. Records every command.
 * Bounded `go` replies after `searchMs`; `go infinite` streams infos until `stop`.
 */
export class FakeUciWorker implements WorkerLike {
	onmessage: ((ev: { data: unknown }) => void) | null = null;
	onerror: ((ev: unknown) => void) | null = null;
	readonly commands: string[] = [];
	/** Interleaved log of commands (`> cmd`) and output (`< line`). */
	readonly log: string[] = [];
	terminated = false;
	searching = false;
	multiPv = 1;
	bestmove = 'e2e4';
	searchMs = 5;
	options = ['Threads', 'Hash', 'MultiPV', 'Skill Level', 'UCI_LimitStrength', 'UCI_Elo'];
	private timer: ReturnType<typeof setTimeout> | null = null;

	postMessage(cmd: string): void {
		this.commands.push(cmd);
		this.log.push(`> ${cmd}`);
		queueMicrotask(() => this.handle(cmd));
	}

	terminate(): void {
		this.terminated = true;
		if (this.timer) clearTimeout(this.timer);
	}

	emit(line: string): void {
		if (this.terminated) return;
		this.log.push(`< ${line}`);
		this.onmessage?.({ data: line });
	}

	private handle(cmd: string): void {
		if (this.terminated) return;
		const [head] = cmd.split(' ');
		if (cmd === 'uci') {
			this.emit('id name FakeFish');
			for (const o of this.options) this.emit(`option name ${o} type spin default 1 min 1 max 500`);
			this.emit('uciok');
		} else if (cmd === 'isready') {
			this.emit('readyok');
		} else if (cmd.startsWith('setoption name MultiPV value ')) {
			this.multiPv = Number(cmd.split(' ').pop());
		} else if (head === 'go') {
			this.searching = true;
			this.infos(1);
			if (cmd !== 'go infinite') this.timer = setTimeout(() => this.finish(), this.searchMs);
		} else if (cmd === 'stop') {
			if (this.searching) {
				// Real engines answer `stop` asynchronously.
				if (this.timer) clearTimeout(this.timer);
				this.timer = setTimeout(() => this.finish(), 2);
			}
		}
	}

	infos(depth: number): void {
		for (let k = 1; k <= this.multiPv; k++) {
			this.emit(`info depth ${depth} seldepth ${depth + 2} multipv ${k} score cp ${50 - k * 10} nodes 1000 nps 100000 time 10 pv e2e4 e7e5`);
		}
	}

	private finish(): void {
		if (!this.searching) return;
		this.searching = false;
		this.infos(2);
		this.emit(`bestmove ${this.bestmove} ponder e7e5`);
	}
}
