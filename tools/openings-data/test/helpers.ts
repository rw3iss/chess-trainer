import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeOpenings } from '../src/merge.js';
import { parseEcoJson, parseLichessTsv } from '../src/sources.js';

export const fixture = (f: string) => readFileSync(resolve(import.meta.dirname, 'fixtures', f), 'utf8');

export function miniMerge() {
	return mergeOpenings(parseLichessTsv(fixture('mini.tsv')), parseEcoJson(fixture('mini-eco.json')));
}
