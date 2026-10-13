import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EngineSessionsService } from './engine-sessions.service';
import { EnginesController } from './engines.controller';
import { EnginesGateway } from './engines.gateway';
import { EnginesService } from './engines.service';

@Module({
	imports: [AuthModule],
	controllers: [EnginesController],
	providers: [EnginesService, EngineSessionsService, EnginesGateway],
	exports: [EnginesService],
})
export class EnginesModule {}
