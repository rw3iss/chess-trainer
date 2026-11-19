import type { MailMessage } from '../mailer';

export interface PasswordResetMailInput {
	to: string;
	appName: string;
	displayName: string;
	link: string;
	ttlMinutes: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Password reset email (pure). */
export function passwordResetMail(i: PasswordResetMailInput): MailMessage {
	const subject = `Reset your ${i.appName} password`;
	const text = [
		`Hi ${i.displayName},`,
		'',
		`Someone asked to reset the password for your ${i.appName} account.`,
		`Open this link to choose a new password (it works once, for ${i.ttlMinutes} minutes):`,
		'',
		i.link,
		'',
		'If you did not ask for this, ignore this email. Your password stays the same.',
	].join('\n');
	const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#222;line-height:1.5;max-width:520px;margin:0 auto;padding:24px">
<p>Hi ${esc(i.displayName)},</p>
<p>Someone asked to reset the password for your ${esc(i.appName)} account.</p>
<p><a href="${esc(i.link)}" style="display:inline-block;background:#b8863b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Choose a new password</a></p>
<p style="font-size:13px;color:#666">The link works once, for ${i.ttlMinutes} minutes. If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${esc(i.link)}</span></p>
<p style="font-size:13px;color:#666">If you did not ask for this, ignore this email. Your password stays the same.</p>
</body></html>`;
	return { to: i.to, subject, text, html, tag: 'password-reset' };
}
