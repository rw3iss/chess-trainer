import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { ExplorerResult } from '@chess/core';
import { Public, PublicIf } from '../../common/decorators/public.decorator';
import { ExplorerQueryDto } from './dto/explorer.dto';
import { ExplorerService } from './explorer.service';
import { OpeningsService } from './openings.service';

// Dataset file names produced by tools/openings-data (no paths, no traversal).
const DATA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(json|md)$/;

@ApiTags('openings')
@Controller()
export class OpeningsController {
	constructor(
		private readonly openings: OpeningsService,
		private readonly explorer: ExplorerService,
	) {}

	/** The openings dataset manifest (`DATA_DIR/manifest.json`). 404 when no dataset is present. */
	@Public()
	@Get('openings/manifest')
	manifest(): Promise<unknown> {
		return this.openings.manifest();
	}

	/**
	 * Raw dataset file passthrough (`DATA_DIR/<file>`), with ETag / 304.
	 * Content-hashed files are cached as immutable; others revalidate.
	 */
	@Public()
	@Get('openings/data/:file')
	file(@Param('file') file: string, @Res() res: Response): void {
		if (!DATA_FILE.test(file)) throw new BadRequestException('invalid file name');
		if (!this.openings.has(file)) throw new NotFoundException('dataset file not found');
		const immutable = /\.[0-9a-f]{8}\.json$/.test(file);
		res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
		res.sendFile(file, { root: this.openings.dataDir, etag: true, lastModified: true, dotfiles: 'deny' });
	}

	/** Lichess opening-explorer stats for a FEN (proxied, rate-limited, cached 7 days). */
	@PublicIf('openings.explorerPublic')
	@ApiBearerAuth()
	@Get('explorer')
	lookup(@Query() q: ExplorerQueryDto): Promise<ExplorerResult> {
		return this.explorer.lookup(q.fen, q.source ?? 'lichess');
	}
}
