import { Module } from '@nestjs/common';
import { EnginesModule } from '../modules/engines/engines.module';
import { OpeningsModule } from '../modules/openings/openings.module';
import { UsersModule } from '../modules/users/users.module';
import { HealthController } from './health.controller';

@Module({
	imports: [EnginesModule, OpeningsModule, UsersModule],
	controllers: [HealthController],
})
export class HealthModule {}
