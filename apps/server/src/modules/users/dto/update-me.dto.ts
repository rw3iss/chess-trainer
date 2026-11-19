import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class UpdateMeDto {
	@ApiPropertyOptional({ example: 'Ryan' })
	@IsOptional()
	@IsString()
	@Length(1, 64)
	displayName?: string;

	@ApiPropertyOptional({ example: 'me@example.com', description: "Account email for password reset links; '' clears it." })
	@IsOptional()
	@ValidateIf((o: UpdateMeDto) => o.email !== '' && o.email !== null)
	@IsEmail()
	@Length(3, 254)
	email?: string | null;

	@ApiPropertyOptional({ description: 'Client preferences blob (replaces the stored one).', type: Object })
	@IsOptional()
	@IsObject()
	preferences?: Record<string, unknown>;
}
