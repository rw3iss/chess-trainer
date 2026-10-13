#!/usr/bin/env node
/*
 * Minimal fake UCI engine for tests. Speaks enough UCI for UciProcess and the
 * /engine gateway: uci/uciok, isready/readyok, setoption (echoed as
 * `info string set <name>=<value>`), position, go (depth/movetime/nodes →
 * two info lines + bestmove; infinite → info every 20 ms until `stop`), quit.
 * Best move: e2e4 from the start position, otherwise the first entry of a
 * small reply table, otherwise a2a3.
 */
const readline = require('readline');

const out = (s) => process.stdout.write(s + '\n');
let moves = [];
let timer = null;
let depth = 0;
let multiPv = 1;

const REPLIES = { '': 'e2e4', e2e4: 'e7e5', 'e2e4 e7e5': 'g1f3' };
const best = () => REPLIES[moves.join(' ')] ?? 'a2a3';

function info(d) {
	for (let k = 1; k <= multiPv; k++) out(`info depth ${d} seldepth ${d} multipv ${k} score cp ${20 - k} nodes ${d * 1000} nps 100000 time ${d * 10} pv ${best()} e7e5`);
}

function finish() {
	if (timer) clearInterval(timer);
	timer = null;
	out(`bestmove ${best()} ponder e7e5`);
}

readline.createInterface({ input: process.stdin }).on('line', (raw) => {
	const line = raw.trim();
	if (line === 'uci') {
		out('id name FakeEngine 1.0');
		out('id author tests');
		out('option name Hash type spin default 16 min 1 max 1024');
		out('option name Threads type spin default 1 min 1 max 64');
		out('option name MultiPV type spin default 1 min 1 max 10');
		out('option name UCI_LimitStrength type check default false');
		out('option name UCI_Elo type spin default 1320 min 1320 max 3190');
		out('option name Skill Level type spin default 20 min 0 max 20');
		out('uciok');
	} else if (line === 'isready') out('readyok');
	else if (line.startsWith('setoption name ')) {
		const m = /^setoption name (.+?) value (.*)$/.exec(line);
		if (m) {
			if (m[1] === 'MultiPV') multiPv = Number(m[2]);
			out(`info string set ${m[1]}=${m[2]}`);
		}
	} else if (line.startsWith('position')) {
		const i = line.indexOf(' moves ');
		moves = i >= 0 ? line.slice(i + 7).trim().split(/\s+/) : [];
	} else if (line.startsWith('go')) {
		depth = 0;
		if (line.includes('infinite')) {
			timer = setInterval(() => info(++depth), 20);
		} else {
			info(1);
			info(2);
			setTimeout(finish, 10);
		}
	} else if (line === 'stop') {
		if (timer) finish();
	} else if (line === 'quit') process.exit(0);
});
