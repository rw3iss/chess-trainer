import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { InviteDto, InvitePreview } from '@chess/core';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateInviteDto } from './dto/invite.dto';
import { InvitesService } from './invites.service';

@ApiTags('invites')
@Controller('invites')
export class InvitesController {
	constructor(private readonly invites: InvitesService) {}

	/** Email a friend a sign-up link (10 per day). */
	@ApiBearerAuth()
	@Post()
	create(@CurrentUser() user: AuthUser, @Body() body: CreateInviteDto): Promise<InviteDto> {
		return this.invites.create(user.id, body.email, body.message);
	}

	/** Invites I sent. */
	@ApiBearerAuth()
	@Get()
	mine(@CurrentUser() user: AuthUser): Promise<InviteDto[]> {
		return this.invites.listMine(user.id);
	}

	/** Who invited, for the sign-up page. */
	@Public()
	@Get(':code')
	preview(@Param('code') code: string): Promise<InvitePreview> {
		return this.invites.preview(code);
	}
}
