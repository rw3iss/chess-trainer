import { MailError, Mailer, type MailMessage, type MailResult } from '../mailer';

export interface ResendMailerOptions {
	apiKey: string;
	/** "Name <address@verified-domain>" */
	from: string;
	replyTo?: string;
	baseUrl?: string;
	/** Injected for tests. */
	fetch?: typeof fetch;
}

/** Resend (https://resend.com) over its HTTP API: POST /emails. No SDK dependency. */
export class ResendMailer extends Mailer {
	readonly provider = 'resend';
	readonly enabled = true;
	private readonly fetchFn: typeof fetch;

	constructor(private readonly opts: ResendMailerOptions) {
		super();
		this.fetchFn = opts.fetch ?? fetch;
	}

	async send(m: MailMessage): Promise<MailResult> {
		const body: Record<string, unknown> = { from: this.opts.from, to: [m.to], subject: m.subject, text: m.text };
		if (m.html) body.html = m.html;
		if (this.opts.replyTo) body.reply_to = this.opts.replyTo;
		if (m.tag) body.tags = [{ name: 'category', value: m.tag.replace(/[^\w-]/g, '_') }];
		let res: Response;
		try {
			res = await this.fetchFn(`${this.opts.baseUrl ?? 'https://api.resend.com'}/emails`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'chess-trainer-server' },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(10_000),
			});
		} catch (e) {
			throw new MailError(`resend: ${e instanceof Error ? e.message : String(e)}`);
		}
		const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
		if (!res.ok) throw new MailError(`resend: HTTP ${res.status} ${json.message ?? ''}`.trim(), res.status);
		return { id: json.id };
	}
}
