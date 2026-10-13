import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OpeningsModule } from './modules/openings/openings.module';
import { GamesModule } from './modules/games/games.module';
import { EnginesModule } from './modules/engines/engines.module';
import { RoomsModule } from './modules/rooms/rooms.module';

// Root module. Feature modules go under src/modules/ and are imported here
// (keep this import list flat — no transitive module graphs).
@Module({
	imports: [
		ConfigModule,
		DatabaseModule,
		CacheModule,
		HealthModule,
		AuthModule,
		UsersModule,
		OpeningsModule,
		GamesModule,
		EnginesModule,
		RoomsModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
