import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mailer } from './mailer';
import { DisabledMailer, MemoryMailer } from './providers/memory.mailer';
import { ResendMailer } from './providers/resend.mailer';

/** Picks the Mailer from config (MAIL_PROVIDER). New providers: implement Mailer, add a case here. */
export function createMailer(config: ConfigService): Mailer {
	const logger = new Logger('Mail');
	const provider = config.get<string>('mail.provider');
	switch (provider) {
		case 'resend': {
			const apiKey = config.get<string>('mail.resendApiKey');
			if (!apiKey) {
				logger.warn('MAIL_PROVIDER=resend without RESEND_API_KEY — email is off');
				return new DisabledMailer();
			}
			logger.log(`email via Resend, from ${config.get<string>('mail.from')}`);
			return new ResendMailer({ apiKey, from: config.get<string>('mail.from')!, replyTo: config.get<string>('mail.replyTo'), baseUrl: config.get<string>('mail.resendBaseUrl') });
		}
		case 'memory':
			logger.log('email: in-memory outbox (nothing is sent)');
			return new MemoryMailer();
		default:
			logger.log('email is off (MAIL_PROVIDER=none)');
			return new DisabledMailer();
	}
}

/** Global mail port. Inject `Mailer`. */
@Global()
@Module({
	providers: [{ provide: Mailer, inject: [ConfigService], useFactory: createMailer }],
	exports: [Mailer],
})
export class MailModule {}
