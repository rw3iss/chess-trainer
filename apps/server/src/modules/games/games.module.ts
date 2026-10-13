import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedGameEntity } from './entities/saved-game.entity';
import { SessionEntity } from './entities/session.entity';
import { GamesController, SessionsController, SyncController } from './games.controller';
import { GamesService } from './games.service';

@Module({
	imports: [TypeOrmModule.forFeature([SavedGameEntity, SessionEntity])],
	controllers: [GamesController, SessionsController, SyncController],
	providers: [GamesService],
})
export class GamesModule {}
