import { registerAs } from '@nestjs/config';

/**
 * Outgoing email. MAIL_PROVIDER picks the Mailer implementation (src/modules/mail):
 * - 'resend' — Resend HTTP API (needs RESEND_API_KEY; MAIL_FROM must be on a verified domain)
 * - 'memory' — keeps messages in memory and logs them (dev/tests; nothing is sent)
 * - 'none'   — email off (password reset by email answers 503)
 * Default: 'resend' when RESEND_API_KEY is set, else 'memory' outside production, 'none' in production.
 */
export default registerAs('mail', () => {
	const key = process.env.RESEND_API_KEY || undefined;
	const prod = process.env.NODE_ENV === 'production';
	return {
		provider: (process.env.MAIL_PROVIDER || (key ? 'resend' : prod ? 'none' : 'memory')) as 'resend' | 'memory' | 'none',
		from: process.env.MAIL_FROM || 'Chess Trainer <noreply@ryanweiss.net>',
		replyTo: process.env.MAIL_REPLY_TO || undefined,
		resendApiKey: key,
		resendBaseUrl: process.env.RESEND_BASE_URL || 'https://api.resend.com',
		/** Public web app URL for links in emails (reset-password page). */
		appUrl: (process.env.APP_PUBLIC_URL || 'http://localhost:5173').replace(/\/+$/, ''),
		appName: process.env.APP_NAME || 'Chess Trainer',
	};
});
