import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { ExplorerSource } from '@chess/core';

export class ExplorerQueryDto {
	@ApiProperty({ example: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' })
	@IsString()
	@Length(10, 120)
	fen!: string;

	@ApiPropertyOptional({ enum: ['lichess', 'masters'], default: 'lichess' })
	@IsOptional()
	@IsIn(['lichess', 'masters'])
	source?: ExplorerSource;
}
