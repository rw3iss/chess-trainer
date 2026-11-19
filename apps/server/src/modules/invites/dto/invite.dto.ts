import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class CreateInviteDto {
	@ApiProperty({ example: 'friend@example.com' })
	@IsEmail()
	@Length(3, 254)
	email!: string;

	@ApiPropertyOptional({ example: 'Join me for some openings practice!' })
	@IsOptional()
	@IsString()
	@Length(0, 500)
	message?: string;
}
