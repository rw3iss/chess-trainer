import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordResetEntity } from './entities/password-reset.entity';
import { PasswordService } from './password.service';
import { UserIdentityEntity } from './entities/user-identity.entity';
import { RegistrationService } from './registration.service';
import { IDENTITY_PROVIDERS, OAuthService } from './oauth/oauth.service';
import { OAuthController } from './oauth/oauth.controller';
import { GoogleProvider } from './oauth/providers/google.provider';
import { InvitesModule } from '../invites/invites.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
	imports: [
		UsersModule,
		TypeOrmModule.forFeature([PasswordResetEntity, UserIdentityEntity]),
		InvitesModule,
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({ secret: config.get<string>('auth.jwtSecret') }),
		}),
	],
	controllers: [AuthController, OAuthController],
	providers: [
		AuthService,
		PasswordService,
		RegistrationService,
		OAuthService,
		// Sign-in providers (IdentityProvider port). Add Lichess etc. here.
		{
			provide: IDENTITY_PROVIDERS,
			inject: [ConfigService],
			useFactory: (config: ConfigService) => [new GoogleProvider({ clientId: config.get<string>('auth.google.clientId'), clientSecret: config.get<string>('auth.google.clientSecret') })],
		},
		{ provide: APP_GUARD, useClass: JwtAuthGuard },
	],
	exports: [AuthService, OAuthService, RegistrationService],
})
export class AuthModule {}
