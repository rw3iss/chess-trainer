import type { MailMessage } from '../mailer';

export interface InviteMailInput {
	to: string;
	appName: string;
	inviterName: string;
	inviterUsername: string;
	link: string;
	message?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "<friend> invites you" email (pure). The personal message is plain text, escaped in HTML. */
export function inviteMail(i: InviteMailInput): MailMessage {
	const subject = `${i.inviterName} invites you to ${i.appName}`;
	const note = i.message?.trim();
	const text = [
		`${i.inviterName} (@${i.inviterUsername}) invites you to ${i.appName}: learn openings, analyze games and play.`,
		...(note ? ['', `"${note}"`] : []),
		'',
		'Create your account here:',
		i.link,
		'',
		`If you do not know ${i.inviterName}, ignore this email.`,
	].join('\n');
	const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#222;line-height:1.5;max-width:520px;margin:0 auto;padding:24px">
<p><strong>${esc(i.inviterName)}</strong> (@${esc(i.inviterUsername)}) invites you to ${esc(i.appName)}: learn openings, analyze games and play.</p>
${note ? `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #b8863b;color:#444">${esc(note).replace(/\n/g, '<br>')}</blockquote>` : ''}
<p><a href="${esc(i.link)}" style="display:inline-block;background:#b8863b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">Create your account</a></p>
<p style="font-size:13px;color:#666">Or copy this address into your browser:<br><span style="word-break:break-all">${esc(i.link)}</span></p>
<p style="font-size:13px;color:#666">If you do not know ${esc(i.inviterName)}, ignore this email.</p>
</body></html>`;
	return { to: i.to, subject, text, html, tag: 'invite' };
}
