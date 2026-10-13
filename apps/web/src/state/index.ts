// State barrel. Importing this registers every store (order = init order).
// New stores: create src/state/<name>.ts following registry.ts, then add it here.
export * from './registry';
export * from './settings';
export * from './sessions';
export * from './favorites';
export * from './savedGames';
export * from './notes';
export * from './themes';
export * from './playback';
export * from './openingIdentity';
export * from './auth';
export * from './engines';
export * from './openings';
export * from './rooms';
