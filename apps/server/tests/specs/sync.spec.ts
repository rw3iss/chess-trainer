import request from 'supertest';
import { createTree, type SavedGame, type Session } from '@chess/core';
import { UsersService } from '../../src/modules/users/users.service';
import { incomingWins } from '../../src/modules/games/synced-docs.service';
import { bootApp, ownerToken, TestApp } from '../helpers/app';

function game(id: string, revision: number, updatedAt: number, name = id): SavedGame {
	return {
		id,
		name,
		tags: [],
		favorite: false,
		tree: createTree(),
		finalFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		source: { kind: 'new' },
		mode: 'analysis',
		createdAt: 1,
		updatedAt,
		revision,
	};
}

function session(id: string, revision: number, updatedAt: number): Session {
	return {
		id,
		title: id,
		tree: createTree(),
		cursor: 'root',
		orientation: 'white',
		mode: 'analysis',
		source: { kind: 'new' },
		playback: { speed: 'medium', playing: false },
		dirty: false,
		createdAt: 1,
		updatedAt,
		revision,
	};
}

describe('incomingWins (LWW)', () => {
	it('higher revision wins, then later updatedAt; exact tie keeps server copy', () => {
		expect(incomingWins({ id: 'a', revision: 2, updatedAt: 1 }, { revision: 1, updatedAt: 99 })).toBe(true);
		expect(incomingWins({ id: 'a', revision: 1, updatedAt: 99 }, { revision: 2, updatedAt: 1 })).toBe(false);
		expect(incomingWins({ id: 'a', revision: 2, updatedAt: 5 }, { revision: 2, updatedAt: 4 })).toBe(true);
		expect(incomingWins({ id: 'a', revision: 2, updatedAt: 4 }, { revision: 2, updatedAt: 4 })).toBe(false);
	});
});

describe('games + sync', () => {
	let t: TestApp;
	let auth: string;
	const http = () => request(t.app.getHttpServer());

	beforeAll(async () => {
		t = await bootApp();
		auth = `Bearer ${await ownerToken(t.app)}`;
	});
	afterAll(() => t.close());

	it('PUT/GET/list/DELETE a saved game', async () => {
		const put = await http().put('/games/g1').set('Authorization', auth).send(game('g1', 1, 100));
		expect(put.body.data).toMatchObject({ accepted: true });
		expect((await http().get('/games/g1').set('Authorization', auth)).body.data.name).toBe('g1');
		const list = await http().get('/games?limit=10').set('Authorization', auth);
		expect(list.body.data.items.map((g: SavedGame) => g.id)).toContain('g1');
		expect(list.body.data.nextCursor).toBeNull();
		// Body id must match URL
		expect((await http().put('/games/other').set('Authorization', auth).send(game('g1', 1, 1))).status).toBe(400);
		// Missing fields
		expect((await http().put('/games/bad').set('Authorization', auth).send({ id: 'bad' })).status).toBe(400);
		expect((await http().delete('/games/g1').set('Authorization', auth)).status).toBe(204);
		expect((await http().get('/games/g1').set('Authorization', auth)).status).toBe(404);
	});

	it('paginates with a cursor', async () => {
		for (let i = 0; i < 5; i++) await http().put(`/games/p${i}`).set('Authorization', auth).send(game(`p${i}`, 1, i));
		const seen: string[] = [];
		let cursor: string | null = null;
		do {
			const res: request.Response = await http()
				.get(`/games?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
				.set('Authorization', auth);
			seen.push(...res.body.data.items.map((g: SavedGame) => g.id));
			cursor = res.body.data.nextCursor;
		} while (cursor);
		expect(seen.filter((id) => id.startsWith('p')).sort()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
	});

	it('sync applies LWW by revision then updatedAt and returns server winners', async () => {
		await http().put('/games/s1').set('Authorization', auth).send(game('s1', 3, 300, 'server'));
		const res = await http()
			.post('/sync')
			.set('Authorization', auth)
			.send({
				savedGames: [game('s1', 2, 999, 'stale-client'), game('s2', 1, 10, 'new-client')],
				sessions: [session('sess1', 1, 10)],
				deletedSavedGameIds: [],
				deletedSessionIds: [],
			});
		expect(res.body.error).toBeUndefined();
		const body = res.body.data;
		// s1: server revision 3 beats client revision 2 → server copy returned
		expect(body.savedGames.find((g: SavedGame) => g.id === 's1').name).toBe('server');
		// s2 / sess1 accepted → not echoed back
		expect(body.savedGames.find((g: SavedGame) => g.id === 's2')).toBeUndefined();
		expect(body.sessions).toEqual([]);
		expect(typeof body.serverTime).toBe('string');

		// Same revision, later updatedAt → client wins
		const res2 = await http()
			.post('/sync')
			.set('Authorization', auth)
			.send({ savedGames: [game('s1', 3, 301, 'client-newer')], sessions: [], deletedSavedGameIds: [], deletedSessionIds: [], since: body.serverTime });
		expect(res2.body.data.savedGames.find((g: SavedGame) => g.id === 's1')).toBeUndefined();
		const got = await http().get('/games/s1').set('Authorization', auth);
		expect(got.body.data.name).toBe('client-newer');
		expect(got.body.data.tree.nodes.root).toMatchObject({ id: 'root', ply: 0 });
	});

	it('sync propagates deletes as tombstones to other devices', async () => {
		const first = await http()
			.post('/sync')
			.set('Authorization', auth)
			.send({ savedGames: [], sessions: [], deletedSavedGameIds: [], deletedSessionIds: [] });
		const since = first.body.data.serverTime;
		await http().delete('/sessions/sess1').set('Authorization', auth);
		const res = await http()
			.post('/sync')
			.set('Authorization', auth)
			.send({ savedGames: [], sessions: [], deletedSavedGameIds: [], deletedSessionIds: [], since });
		expect(res.body.data.deletedSessionIds).toContain('sess1');
		// Late upload of a deleted doc at the same revision stays deleted
		const late = await http()
			.post('/sync')
			.set('Authorization', auth)
			.send({ savedGames: [], sessions: [session('sess1', 1, 99)], deletedSavedGameIds: [], deletedSessionIds: [] });
		expect(late.status).toBe(200);
		expect((await http().get('/sessions/sess1').set('Authorization', auth)).status).toBe(404);
	});

	it('scopes documents per user', async () => {
		await t.app.get(UsersService).upsertOwner('second', 'second-pass');
		const login = await http().post('/auth/login').send({ username: 'second', password: 'second-pass' });
		const other = `Bearer ${login.body.data.accessToken}`;
		expect((await http().get('/games/s1').set('Authorization', other)).status).toBe(404);
		const list = await http().get('/games').set('Authorization', other);
		expect(list.body.data.items).toEqual([]);
		// Same id under another user is a separate document
		await http().put('/games/s1').set('Authorization', other).send(game('s1', 1, 1, 'mine'));
		expect((await http().get('/games/s1').set('Authorization', auth)).body.data.name).toBe('client-newer');
	});
});
