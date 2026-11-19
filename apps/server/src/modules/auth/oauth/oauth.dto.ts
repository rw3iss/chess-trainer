import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class OAuthStartDto {
	@ApiProperty({ enum: ['signin', 'link'] })
	@IsIn(['signin', 'link'])
	mode!: 'signin' | 'link';

	@ApiProperty({ example: 'https://chess.ryanweiss.net' })
	@IsUrl({ require_tld: false, require_protocol: true })
	appOrigin!: string;

	@ApiProperty({ example: 'https://chess.ryanweiss.net/api' })
	@IsUrl({ require_tld: false, require_protocol: true })
	apiBase!: string;

	@ApiPropertyOptional({ example: '/games' })
	@IsOptional()
	@IsString()
	@Length(1, 512)
	returnTo?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@Length(8, 64)
	invite?: string;
}

export class OAuthExchangeDto {
	@ApiProperty()
	@IsString()
	@Length(16, 128)
	code!: string;
}
