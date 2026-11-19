import type { MailMessage } from '../mailer';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "Confirm your email" (pure). */
export function verifyEmailMail(i: { to: string; appName: string; displayName: string; link: string; ttlHours: number }): MailMessage {
	const subject = `Confirm your email for ${i.appName}`;
	const text = [
		`Hi ${i.displayName},`,
		'',
		`Confirm that this is your email address for ${i.appName}. You need a confirmed email to reset a forgotten password.`,
		'',
		i.link,
		'',
		`The link works for ${i.ttlHours} hours. If you did not add this address, ignore this email.`,
	].join('\n');
	const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#222;line-height:1.5;max-width:520px;margin:0 auto;padding:24px">
<p>Hi ${esc(i.displayName)},</p>
<p>Confirm that this is your email address for ${esc(i.appName)}. You need a confirmed email to reset a forgotten password.</p>
<p><a href="${esc(i.link)}" style="display:inline-block;background:#b8863b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Confirm email</a></p>
<p style="font-size:13px;color:#666">The link works for ${i.ttlHours} hours. Or copy this address into your browser:<br><span style="word-break:break-all">${esc(i.link)}</span></p>
<p style="font-size:13px;color:#666">If you did not add this address, ignore this email.</p>
</body></html>`;
	return { to: i.to, subject, text, html, tag: 'verify-email' };
}
