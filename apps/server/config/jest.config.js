/**
 * Jest (plain jest + ts-jest + supertest).
 *
 * @chess/core ships ESM only (dist/). Jest runs CommonJS, so tests map the
 * package to its TypeScript sources and ts-jest compiles them; core's
 * `./x.js` relative specifiers are mapped back to extensionless paths.
 * chessops resolves to its CJS build under Jest's `require` condition.
 * The real app (SWC build) loads core's dist via Node 22 `require(esm)`.
 *
 * @type {import('jest').Config}
 */
module.exports = {
	rootDir: '..',
	testEnvironment: 'node',
	testMatch: ['<rootDir>/tests/specs/**/*.spec.ts'],
	setupFiles: ['<rootDir>/tests/framework/setupGlobals.js'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^@chess/core$': '<rootDir>/../../packages/core/src/index.ts',
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/config/tsconfig.jest.json', diagnostics: false }],
	},
	testTimeout: 20000,
	verbose: true,
};
