import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerificationEntity } from './entities/email-verification.entity';
import { UserEntity } from './entities/user.entity';
import { EmailController } from './email.controller';
import { EmailVerificationService } from './email-verification.service';
import { AvatarStore } from './avatar/avatar-store';
import { DiskAvatarStore } from './avatar/disk-avatar.store';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
	imports: [TypeOrmModule.forFeature([UserEntity, EmailVerificationEntity])],
	controllers: [UsersController, EmailController],
	providers: [
		UsersService,
		EmailVerificationService,
		// Avatar storage port: disk today (AVATAR_DIR).
		{ provide: AvatarStore, inject: [ConfigService], useFactory: (config: ConfigService) => new DiskAvatarStore(config.get<string>('app.avatarDir')!) },
	],
	exports: [UsersService, EmailVerificationService, AvatarStore],
})
export class UsersModule {}
