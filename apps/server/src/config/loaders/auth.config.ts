import { registerAs } from '@nestjs/config';
import { randomBytes } from 'crypto';

// Dev convenience: without JWT_SECRET a random per-process secret is used
// (tokens stop working after a restart). Production requires JWT_SECRET (Joi).
const fallbackSecret = randomBytes(32).toString('hex');

export default registerAs('auth', () => ({
	jwtSecret: process.env.JWT_SECRET || fallbackSecret,
	jwtSecretIsEphemeral: !process.env.JWT_SECRET,
	accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
	refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? String(30 * 24 * 3600), 10),
	guestTtl: parseInt(process.env.GUEST_TTL ?? String(24 * 3600), 10),
	// Username defaults to 'owner' when only a password is given (e.g. container env).
	ownerUsername: process.env.OWNER_USERNAME || (process.env.OWNER_PASSWORD ? 'owner' : undefined),
	ownerPassword: process.env.OWNER_PASSWORD || undefined,
	ownerEmail: process.env.OWNER_EMAIL?.trim().toLowerCase() || undefined,
	passwordResetTtl: parseInt(process.env.PASSWORD_RESET_TTL ?? '3600', 10),
	/** 'open' (anyone), 'invite' (invite code needed), 'off'. */
	signupMode: (process.env.SIGNUP_MODE || 'open') as 'open' | 'invite' | 'off',
	/** Failed logins allowed per username / per IP in LOGIN_WINDOW seconds. */
	loginMaxPerUser: parseInt(process.env.LOGIN_MAX_PER_USER ?? '10', 10),
	loginMaxPerIp: parseInt(process.env.LOGIN_MAX_PER_IP ?? '30', 10),
	loginWindow: parseInt(process.env.LOGIN_WINDOW ?? '900', 10),
	/** Accounts created per IP per hour. */
	registerMaxPerIp: parseInt(process.env.REGISTER_MAX_PER_IP ?? '5', 10),
	/** Invites a user may send per day. */
	invitesPerDay: parseInt(process.env.INVITES_PER_DAY ?? '10', 10),
	google: {
		clientId: process.env.GOOGLE_CLIENT_ID || undefined,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
	},
}));
