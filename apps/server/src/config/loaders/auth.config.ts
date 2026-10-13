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
}));
