import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { SavedGame, Session, SyncResponse } from '@chess/core';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListQueryDto, Page, SyncRequestDto } from './dto/games.dto';
import { GamesService } from './games.service';
import { assertSyncedDoc, SyncedDocStore } from './synced-docs.service';

// Request bodies for PUT are typed as plain objects so the global
// ValidationPipe (whitelist + forbidNonWhitelisted) leaves the client
// document intact; `assertSyncedDoc` checks the fields the server needs.
const docBody = { schema: { type: 'object', description: 'Full client document (SavedGame / Session from @chess/core).' } };

async function putDoc<T extends { id: string }>(
	store: SyncedDocStore<T & { revision: number; updatedAt: number }>,
	user: AuthUser,
	id: string,
	body: Record<string, unknown>,
): Promise<{ accepted: boolean; current: T | null }> {
	assertSyncedDoc(body, 'body');
	if (body.id !== id) throw new BadRequestException('body.id must match the URL id');
	return store.put(user.id, body as unknown as T & { revision: number; updatedAt: number });
}

@ApiTags('games')
@ApiBearerAuth()
@Controller('games')
export class GamesController {
	constructor(private readonly svc: GamesService) {}

	/** Saved games, most recently changed first (cursor pagination). */
	@Get()
	list(@CurrentUser() user: AuthUser, @Query() q: ListQueryDto): Promise<Page<SavedGame>> {
		return this.svc.games.list(user.id, q.limit, q.cursor);
	}

	/** One saved game. */
	@Get(':id')
	get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<SavedGame> {
		return this.svc.games.get(user.id, id);
	}

	/** Create or replace (LWW: stored only if it beats the server copy). Returns what the server holds. */
	@Put(':id')
	@ApiBody(docBody)
	put(
		@CurrentUser() user: AuthUser,
		@Param('id') id: string,
		@Body() body: Record<string, unknown>,
	): Promise<{ accepted: boolean; current: SavedGame | null }> {
		return putDoc<SavedGame>(this.svc.games, user, id, body);
	}

	/** Delete (tombstoned so other devices learn about it on sync). */
	@Delete(':id')
	@HttpCode(204)
	async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
		await this.svc.games.remove(user.id, id);
	}
}

@ApiTags('games')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
	constructor(private readonly svc: GamesService) {}

	/** Open sessions (game tabs), most recently changed first. */
	@Get()
	list(@CurrentUser() user: AuthUser, @Query() q: ListQueryDto): Promise<Page<Session>> {
		return this.svc.sessions.list(user.id, q.limit, q.cursor);
	}

	/** One session. */
	@Get(':id')
	get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Session> {
		return this.svc.sessions.get(user.id, id);
	}

	/** Create or replace a session (LWW). */
	@Put(':id')
	@ApiBody(docBody)
	put(
		@CurrentUser() user: AuthUser,
		@Param('id') id: string,
		@Body() body: Record<string, unknown>,
	): Promise<{ accepted: boolean; current: Session | null }> {
		return putDoc<Session>(this.svc.sessions, user, id, body);
	}

	/** Close/delete a session. */
	@Delete(':id')
	@HttpCode(204)
	async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
		await this.svc.sessions.remove(user.id, id);
	}
}

@ApiTags('games')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
	constructor(private readonly svc: GamesService) {}

	/** Batch two-way sync of saved games + sessions (see GamesService.sync). */
	@Post()
	@HttpCode(200)
	sync(@CurrentUser() user: AuthUser, @Body() body: SyncRequestDto): Promise<SyncResponse> {
		return this.svc.sync(user.id, body);
	}
}
