import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { EmailVerificationService } from './email-verification.service';

export class VerifyEmailDto {
	@ApiProperty()
	@IsString()
	@Length(16, 256)
	token!: string;
}

@ApiTags('auth')
@Controller('auth/email')
export class EmailController {
	constructor(private readonly verification: EmailVerificationService) {}

	/** Confirm an email from the link (public: the token is the proof). */
	@Public()
	@Post('verify')
	@HttpCode(200)
	verify(@Body() body: VerifyEmailDto): Promise<{ email: string }> {
		return this.verification.verify(body.token);
	}
}
