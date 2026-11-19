import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MIN_LENGTH } from '@chess/core';
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

export class ForgotPasswordDto {
	@ApiProperty({ example: 'owner', description: 'Username or email.' })
	@IsString()
	@Length(1, 254)
	identifier!: string;
}

export class ResetPasswordDto {
	@ApiProperty({ description: 'Token from the reset email link.' })
	@IsString()
	@Length(16, 256)
	token!: string;

	@ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
	@IsString()
	@Length(PASSWORD_MIN_LENGTH, 256)
	password!: string;
}

export class ChangePasswordDto {
	@ApiProperty()
	@IsString()
	@Length(1, 256)
	currentPassword!: string;

	@ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
	@IsString()
	@Length(PASSWORD_MIN_LENGTH, 256)
	newPassword!: string;
}
