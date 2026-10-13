import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const ALLOW_GUEST_KEY = 'allowGuest';

/** Route needs no token at all. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Route accepts guest tokens too (default: owner/user tokens only). */
export const AllowGuest = (): MethodDecorator & ClassDecorator => SetMetadata(ALLOW_GUEST_KEY, true);

export const PUBLIC_IF_KEY = 'publicIf';

/** Route is public when the boolean config key (e.g. 'openings.explorerPublic') is true. */
export const PublicIf = (configKey: string): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_IF_KEY, configKey);
