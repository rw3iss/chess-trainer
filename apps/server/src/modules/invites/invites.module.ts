import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { InviteEntity } from './entities/invite.entity';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
	imports: [UsersModule, TypeOrmModule.forFeature([InviteEntity])],
	controllers: [InvitesController],
	providers: [InvitesService],
	exports: [InvitesService],
})
export class InvitesModule {}
