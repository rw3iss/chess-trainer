import { Module } from '@nestjs/common';
import { EnginesModule } from '../modules/engines/engines.module';
import { OpeningsModule } from '../modules/openings/openings.module';
import { UsersModule } from '../modules/users/users.module';
import { AuthModule } from '../modules/auth/auth.module';
import { HealthController } from './health.controller';

@Module({
	imports: [EnginesModule, OpeningsModule, UsersModule, AuthModule],
	controllers: [HealthController],
})
export class HealthModule {}
