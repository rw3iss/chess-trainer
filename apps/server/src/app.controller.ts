import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
	constructor(private readonly appService: AppService) {}

	/** Root ping. Returns the app name + version from package.json. */
	@Public()
	@Get()
	info(): { name: string; version: string } {
		return this.appService.info();
	}
}
