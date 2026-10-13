import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RemoteEngineDto } from '@chess/core';
import { Public } from '../../common/decorators/public.decorator';
import { EnginesService } from './engines.service';

@ApiTags('engines')
@Controller('engines')
export class EnginesController {
	constructor(private readonly engines: EnginesService) {}

	/** Remote engine catalog with availability (binary found + UCI handshake OK) or the reason it is missing. */
	@Public()
	@Get()
	list(): RemoteEngineDto[] {
		return this.engines.list();
	}
}
