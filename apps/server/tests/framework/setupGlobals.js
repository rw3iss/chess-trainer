// Runs before every test file (via jest.config.js setupFiles).
// Baseline env for tests: SQLite in memory, in-memory cache, fixed JWT secret,
// no Lichess token, no engines. Individual specs override before booting the app.

process.env.NODE_ENV = 'test';
Object.assign(process.env, {
	DB_TYPE: 'sqlite',
	DB_PATH: ':memory:',
	REDIS_HOST: '',
	JWT_SECRET: 'test-secret-test-secret-0123456789',
	OWNER_USERNAME: 'owner',
	OWNER_PASSWORD: 'owner-pass',
	LICHESS_TOKEN: '',
	LOG_LEVEL: 'error',
	ENGINE_STOCKFISH_PATH: '',
	ENGINE_LC0_PATH: '',
	ENGINE_KOMODO_PATH: '',
	ENGINE_FAIRY_PATH: '',
	MAIA_WEIGHTS_DIR: '',
});
