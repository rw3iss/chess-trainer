/** One outgoing email. `text` is required (plain-text part); `html` is optional. */
export interface MailMessage {
	to: string;
	subject: string;
	text: string;
	html?: string;
	/** Free-form tags for the provider (e.g. 'password-reset'); providers may ignore them. */
	tag?: string;
}

export interface MailResult {
	/** Provider message id, when the provider returns one. */
	id?: string;
}

/** Thrown when sending fails (provider error, network). The message is safe to log, never shown to users. */
export class MailError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = 'MailError';
	}
}

/**
 * Outgoing email port. Inject `Mailer` anywhere; the MailModule binds one implementation from
 * config (MAIL_PROVIDER). Add a provider by implementing this class and registering it in
 * `createMailer` (mail.module.ts) — callers never change.
 */
export abstract class Mailer {
	/** Provider id, e.g. 'resend', 'memory', 'none'. */
	abstract readonly provider: string;
	/** False when email is off ('none'): callers should report that the feature is unavailable. */
	abstract readonly enabled: boolean;
	abstract send(message: MailMessage): Promise<MailResult>;
}
