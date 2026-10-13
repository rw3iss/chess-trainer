import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';

@Module({
	imports: [AuthModule],
	providers: [RoomsService, RoomsGateway],
})
export class RoomsModule {}
