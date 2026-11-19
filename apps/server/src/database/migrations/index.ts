import { InitialSchema1760300000000 } from './1760300000000-InitialSchema';
import { AccountEmailPasswordResets1763500000000 } from './1763500000000-AccountEmailPasswordResets';
import { IdentitiesInvites1763600000000 } from './1763600000000-IdentitiesInvites';

/**
 * Every migration, in order. Listed explicitly (not globbed) so the same list
 * works under SWC (dist/*.js), ts-jest and the TypeORM CLI.
 * Add new migrations here after `pnpm migration:generate`.
 */
export const MIGRATIONS = [InitialSchema1760300000000, AccountEmailPasswordResets1763500000000, IdentitiesInvites1763600000000];
