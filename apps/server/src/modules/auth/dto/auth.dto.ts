import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
	@ApiProperty({ example: 'owner' })
	@IsString()
	@Length(1, 64)
	username!: string;

	@ApiProperty({ example: 'secret' })
	@IsString()
	@Length(1, 256)
	password!: string;
}

export class RefreshDto {
	@ApiProperty()
	@IsString()
	refreshToken!: string;
}

export class GuestDto {
	@ApiProperty({ example: 'Guest 42' })
	@IsString()
	@Length(1, 32)
	displayName!: string;
}

/** Guest token response (no refresh — request a new guest token when it expires). */
export interface GuestTokenResponse {
	accessToken: string;
	expiresIn: number;
	user: { id: string; username: string; displayName: string; role: 'guest' };
}
