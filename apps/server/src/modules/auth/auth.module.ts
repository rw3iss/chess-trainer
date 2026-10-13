import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
	imports: [
		UsersModule,
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({ secret: config.get<string>('auth.jwtSecret') }),
		}),
	],
	controllers: [AuthController],
	providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
	exports: [AuthService],
})
export class AuthModule {}
