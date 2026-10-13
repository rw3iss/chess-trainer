import { Module } from '@nestjs/common';
import { ExplorerService } from './explorer.service';
import { OpeningsController } from './openings.controller';
import { OpeningsService } from './openings.service';

@Module({
	controllers: [OpeningsController],
	providers: [OpeningsService, ExplorerService],
	exports: [ExplorerService],
})
export class OpeningsModule {}
