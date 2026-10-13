import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

/** Items are validated by `assertSyncedDoc` in GamesService (kept as plain objects here so nested trees survive). */
export class SyncRequestDto {
	@ApiProperty({ type: [Object] })
	@IsArray()
	@Type(() => Object) // stops implicit conversion from turning each item into []
	savedGames!: Record<string, unknown>[];

	@ApiProperty({ type: [Object] })
	@IsArray()
	@Type(() => Object)
	sessions!: Record<string, unknown>[];

	@ApiProperty({ type: [String] })
	@IsArray()
	@IsString({ each: true })
	deletedSavedGameIds!: string[];

	@ApiProperty({ type: [String] })
	@IsArray()
	@IsString({ each: true })
	deletedSessionIds!: string[];

	@ApiPropertyOptional({ description: 'ISO time of the last successful sync; omit for a full pull.' })
	@IsOptional()
	@IsISO8601()
	since?: string;
}

export class ListQueryDto {
	@ApiPropertyOptional({ description: 'Opaque cursor from the previous page (`nextCursor`).' })
	@IsOptional()
	@IsString()
	cursor?: string;

	@ApiPropertyOptional({ default: 50, maximum: 200 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(200)
	limit?: number;
}

export interface Page<T> {
	items: T[];
	nextCursor: string | null;
}
