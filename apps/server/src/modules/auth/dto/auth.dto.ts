import { PASSWORD_MIN_LENGTH } from '@chess/core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
	@ApiProperty({ example: 'owner', description: 'Username or email.' })
	@IsString()
	@Length(1, 254)
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
	@ApiProperty({ description: "'' when the account has no password yet (hasPassword false)." })
	@IsString()
	@Length(0, 256)
	currentPassword!: string;

	@ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
	@IsString()
	@Length(PASSWORD_MIN_LENGTH, 256)
	newPassword!: string;
}

export class RegisterDto {
	@ApiProperty({ example: 'magnus', description: '3–24 chars: a–z, 0–9, _ or -' })
	@IsString()
	@Matches(/^[A-Za-z0-9_-]{3,24}$/, { message: 'username: 3–24 characters, a–z, 0–9, _ or -' })
	username!: string;

	@ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
	@IsString()
	@Length(PASSWORD_MIN_LENGTH, 256)
	password!: string;

	@ApiPropertyOptional({ example: 'Magnus' })
	@IsOptional()
	@IsString()
	@Length(1, 64)
	displayName?: string;

	@ApiPropertyOptional({ example: 'me@example.com' })
	@IsOptional()
	@IsEmail()
	@Length(3, 254)
	email?: string;

	@ApiPropertyOptional({ description: 'Invite code from a /signup?invite=… link.' })
	@IsOptional()
	@IsString()
	@Length(8, 64)
	invite?: string;
}
