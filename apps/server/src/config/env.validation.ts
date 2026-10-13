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
