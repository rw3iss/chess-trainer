import { Logger } from '@nestjs/common';
import { Mailer, type MailMessage, type MailResult } from '../mailer';

/** Dev/test mailer: keeps every message in `outbox` and logs it (debug level). Sends nothing. */
export class MemoryMailer extends Mailer {
	readonly provider = 'memory';
	readonly enabled = true;
	readonly outbox: MailMessage[] = [];
	private readonly logger = new Logger('Mail');

	async send(m: MailMessage): Promise<MailResult> {
		this.outbox.push(m);
		this.logger.debug(`[memory mail] to=${m.to} subject="${m.subject}"\n${m.text}`);
		return { id: `memory-${this.outbox.length}` };
	}
}

/** Email off. `send` rejects; check `enabled` first. */
export class DisabledMailer extends Mailer {
	readonly provider = 'none';
	readonly enabled = false;

	send(): Promise<MailResult> {
		return Promise.reject(new Error('email is not configured'));
	}
}
