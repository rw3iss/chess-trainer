import Joi from 'joi';

/**
 * Joi schema for every env var the app reads. Boot fails with a clear error
 * message if anything required is missing or malformed — better than a
 * silent `undefined` at request time.
 *
 * Everything optional has a working default: with an empty env the server
 * boots on SQLite + in-memory cache, no Lichess token, no remote engines.
 */
export const envValidationSchema = Joi.object({
	// App
	NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),
	PORT: Joi.number().port().default(3000),
	HOST: Joi.string().allow('').default('0.0.0.0'),
	AVATAR_DIR: Joi.string().allow('').optional(),
	API_PREFIX: Joi.string().allow('').default(''),
	CORS_ORIGINS: Joi.string().allow('').default('*'),
	LOG_LEVEL: Joi.string().valid('error', 'warn', 'log', 'debug', 'verbose').default('log'),
	SWAGGER_ENABLED: Joi.boolean().default(false),

	// Database — sqlite (default) or postgres
	DB_TYPE: Joi.string().valid('sqlite', 'postgres').default('sqlite'),
	DB_PATH: Joi.string().default('data/chess.sqlite'),
	DB_HOST: Joi.when('DB_TYPE', { is: 'postgres', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
	DB_PORT: Joi.number().port().default(5432),
	DB_USER: Joi.when('DB_TYPE', { is: 'postgres', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
	DB_PASSWORD: Joi.when('DB_TYPE', { is: 'postgres', then: Joi.string().allow('').required(), otherwise: Joi.string().allow('').optional() }),
	DB_NAME: Joi.when('DB_TYPE', { is: 'postgres', then: Joi.string().required(), otherwise: Joi.string().allow('').optional() }),
	DB_SYNCHRONIZE: Joi.boolean().default(false),

	// Redis — optional. Empty REDIS_HOST → in-memory cache.
	REDIS_HOST: Joi.string().allow('').optional(),
	REDIS_PORT: Joi.number().port().default(6379),
	REDIS_PASSWORD: Joi.string().allow('').optional(),
	REDIS_DB: Joi.number().min(0).default(0),

	// Auth
	JWT_SECRET: Joi.when('NODE_ENV', {
		is: 'production',
		then: Joi.string().min(16).required(),
		otherwise: Joi.string().allow('').optional(),
	}),
	JWT_ACCESS_TTL: Joi.number().integer().min(60).default(900),
	JWT_REFRESH_TTL: Joi.number().integer().min(60).default(30 * 24 * 3600),
	GUEST_TTL: Joi.number().integer().min(60).default(24 * 3600),
	OWNER_USERNAME: Joi.string().allow('').optional(),
	OWNER_PASSWORD: Joi.string().allow('').optional(),
	/** Owner's email for password reset links (set at boot when given; editable in the app). */
	OWNER_EMAIL: Joi.string().email().allow('').optional(),
	/** Password reset link lifetime (seconds). */
	PASSWORD_RESET_TTL: Joi.number().integer().min(300).max(24 * 3600).default(3600),
	SIGNUP_MODE: Joi.string().valid('open', 'invite', 'off').default('open'),
	LOGIN_MAX_PER_USER: Joi.number().integer().min(1).default(10),
	LOGIN_MAX_PER_IP: Joi.number().integer().min(1).default(30),
	LOGIN_WINDOW: Joi.number().integer().min(60).default(900),
	REGISTER_MAX_PER_IP: Joi.number().integer().min(1).default(5),
	INVITES_PER_DAY: Joi.number().integer().min(0).default(10),
	// Sign in with Google (OAuth client "Web application"; redirect URI = <api base>/auth/google/callback)
	LICHESS_OAUTH: Joi.boolean().default(true),
	LICHESS_CLIENT_ID: Joi.string().allow('').optional(),
	GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
	GOOGLE_CLIENT_SECRET: Joi.string().allow('').optional(),

	// Mail (src/modules/mail) — provider is swappable; see config/loaders/mail.config.ts
	MAIL_PROVIDER: Joi.string().valid('resend', 'memory', 'none').allow('').optional(),
	MAIL_FROM: Joi.string().allow('').optional(),
	MAIL_REPLY_TO: Joi.string().email().allow('').optional(),
	RESEND_API_KEY: Joi.string().allow('').optional(),
	RESEND_BASE_URL: Joi.string().uri().allow('').optional(),
	APP_PUBLIC_URL: Joi.string().uri().allow('').optional(),
	APP_NAME: Joi.string().allow('').optional(),

	// Openings / explorer
	DATA_DIR: Joi.string().allow('').optional(),
	LICHESS_TOKEN: Joi.string().allow('').optional(),
	EXPLORER_BASE_URL: Joi.string().uri().default('https://explorer.lichess.org'),
	EXPLORER_MIN_INTERVAL_MS: Joi.number().integer().min(0).default(1000),
	EXPLORER_CACHE_TTL: Joi.number().integer().min(0).default(7 * 24 * 3600),
	EXPLORER_PUBLIC: Joi.boolean().default(false),

	// Engines
	ENGINE_STOCKFISH_PATH: Joi.string().allow('').optional(),
	ENGINE_LC0_PATH: Joi.string().allow('').optional(),
	LC0_WEIGHTS: Joi.string().allow('').optional(),
	MAIA_WEIGHTS_DIR: Joi.string().allow('').optional(),
	ENGINE_KOMODO_PATH: Joi.string().allow('').optional(),
	ENGINE_FAIRY_PATH: Joi.string().allow('').optional(),
	ENGINE_MAX_PROCESSES: Joi.number().integer().min(1).default(4),
	ENGINE_MAX_PER_SOCKET: Joi.number().integer().min(1).default(2),
	ENGINE_IDLE_TIMEOUT_MS: Joi.number().integer().min(1000).default(5 * 60 * 1000),
	ENGINE_THREADS: Joi.number().integer().min(1).default(1),
	ENGINE_HASH_MB: Joi.number().integer().min(1).default(64),
	ENGINE_ALLOW_GUESTS: Joi.boolean().default(false),

	// Rooms
	ROOM_TTL: Joi.number().integer().min(60).default(24 * 3600),
});
