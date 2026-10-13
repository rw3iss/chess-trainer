import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class UpdateMeDto {
	@ApiPropertyOptional({ example: 'Ryan' })
	@IsOptional()
	@IsString()
	@Length(1, 64)
	displayName?: string;

	@ApiPropertyOptional({ description: 'Client preferences blob (replaces the stored one).', type: Object })
	@IsOptional()
	@IsObject()
	preferences?: Record<string, unknown>;
}
