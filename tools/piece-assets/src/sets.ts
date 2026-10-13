import type { Anchors, ToneMode } from './normalize.js';

export interface SourceSet {
	id: string;
	name: string;
	author: string;
	authorUrl?: string;
	license: string;
	licenseUrl: string;
	personalUseOnly?: boolean;
	tones: ToneMode;
	/** Source colours that define each side's roles (also the default colours). */
	anchors: { white: Anchors; black: Anchors };
	/** Exported default accent when the side has none (defaults to line). */
}

const LILA = 'https://github.com/lichess-org/lila/tree/master/public/piece';
const GPL2 = 'https://www.gnu.org/licenses/gpl-2.0.txt';
const MIT_MONGE = 'https://github.com/maurimo/chess-art/blob/main/LICENSE';
const NC = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';

export const SOURCE_BASE = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece';
export const sourceUrl = (id: string) => `${LILA}/${id}`;

export const SOURCE_SETS: SourceSet[] = [
	{
		id: 'cburnett',
		name: 'Cburnett',
		author: 'Colin M.L. Burnett',
		authorUrl: 'https://en.wikipedia.org/wiki/User:Cburnett',
		license: 'GPL-2.0-or-later',
		licenseUrl: GPL2,
		tones: 'neutral',
		anchors: {
			white: { body: '#ffffff', line: '#000000' },
			black: { body: '#000000', line: '#000000', accent: '#ececec' },
		},
	},
	{
		id: 'merida',
		name: 'Merida',
		author: 'Armando Hernandez Marroquin',
		license: 'GPL-2.0-or-later',
		licenseUrl: GPL2,
		tones: 'neutral',
		anchors: {
			white: { body: '#ffffff', line: '#1f1a17' },
			black: { body: '#1f1a17', line: '#1f1a17' },
		},
	},
	{
		id: 'rhosgfx',
		name: 'RhosGFX',
		author: 'RhosGFX',
		authorUrl: 'https://rhosgfx.itch.io/',
		license: 'CC0-1.0',
		licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
		tones: 'neutral',
		anchors: {
			white: { body: '#f4c38e', line: '#1a1a1a' },
			black: { body: '#bb5938', line: '#1a1a1a' },
		},
	},
	{
		id: 'fantasy',
		name: 'Fantasy',
		author: 'Maurizio Monge',
		authorUrl: 'https://github.com/maurimo/chess-art',
		license: 'MIT',
		licenseUrl: MIT_MONGE,
		tones: 'neutral',
		anchors: {
			white: { body: '#dfe9eb', line: '#000000' },
			black: { body: '#4e5265', line: '#000000', accent: '#7f899b' },
		},
	},
	{
		id: 'spatial',
		name: 'Spatial',
		author: 'Maurizio Monge',
		authorUrl: 'https://github.com/maurimo/chess-art',
		license: 'MIT',
		licenseUrl: MIT_MONGE,
		tones: 'neutral',
		anchors: {
			white: { body: '#dfe9eb', line: '#000000' },
			black: { body: '#4e5265', line: '#000000' },
		},
	},
	{
		id: 'celtic',
		name: 'Celtic',
		author: 'Maurizio Monge',
		authorUrl: 'https://github.com/maurimo/chess-art',
		license: 'MIT',
		licenseUrl: MIT_MONGE,
		tones: 'neutral',
		anchors: {
			white: { body: '#dfe9eb', line: '#000000' },
			black: { body: '#4e5265', line: '#000000' },
		},
	},
	{
		id: 'chessnut',
		name: 'Chessnut',
		author: 'Alexis Luengas',
		authorUrl: 'https://github.com/LexLuengas/chessnut-pieces',
		license: 'Apache-2.0',
		licenseUrl: 'https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt',
		tones: 'neutral',
		anchors: {
			white: { body: '#ffffff', line: '#000000' },
			black: { body: '#000000', line: '#000000', accent: '#f2f2f2' },
		},
	},
	{
		id: 'kiwen-suwi',
		name: 'Kiwen Suwi',
		author: 'neverRare',
		authorUrl: 'https://github.com/neverRare',
		license: 'CC-BY-4.0',
		licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
		tones: 'neutral',
		anchors: {
			white: { body: '#ffffff', line: '#262626' },
			black: { body: '#262626', line: '#262626' },
		},
	},
	{
		id: 'california',
		name: 'California',
		author: 'Jerry S.',
		authorUrl: 'https://sites.google.com/view/jerrychess/home',
		license: 'CC-BY-NC-SA-4.0',
		licenseUrl: NC,
		personalUseOnly: true,
		tones: 'neutral',
		anchors: {
			white: { body: '#ffffff', line: '#000000' },
			black: { body: '#808080', line: '#000000' },
		},
	},
	{
		id: 'cardinal',
		name: 'Cardinal',
		author: 'sadsnake1',
		license: 'CC-BY-NC-SA-4.0',
		licenseUrl: NC,
		personalUseOnly: true,
		tones: 'neutral',
		anchors: {
			white: { body: '#f3f3f3', line: '#000000' },
			black: { body: '#1e1e1e', line: '#000000', accent: '#e6e6e6' },
		},
	},
	{
		id: 'maestro',
		name: 'Maestro',
		author: 'sadsnake1',
		license: 'CC-BY-NC-SA-4.0',
		licenseUrl: NC,
		personalUseOnly: true,
		tones: 'neutral',
		anchors: {
			white: { body: '#ffffff', line: '#000000' },
			black: { body: '#303030', line: '#000000', accent: '#ffffff' },
		},
	},
	{
		id: 'staunty',
		name: 'Staunty',
		author: 'sadsnake1',
		license: 'CC-BY-NC-SA-4.0',
		licenseUrl: NC,
		personalUseOnly: true,
		tones: 'neutral',
		anchors: {
			white: { body: '#f0f0f0', line: '#3c3c3c' },
			black: { body: '#5f5955', line: '#1e1e1e' },
		},
	},
];
