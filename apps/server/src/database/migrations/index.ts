import { InitialSchema1760300000000 } from './1760300000000-InitialSchema';

/**
 * Every migration, in order. Listed explicitly (not globbed) so the same list
 * works under SWC (dist/*.js), ts-jest and the TypeORM CLI.
 * Add new migrations here after `pnpm migration:generate`.
 */
export const MIGRATIONS = [InitialSchema1760300000000];
