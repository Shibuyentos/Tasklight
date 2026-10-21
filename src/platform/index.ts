import devToken from 'virtual:tasklight/dev-token';
import { createWebPlatform } from './web';

export type { Platform, SecretStore } from './types';

export const platform = createWebPlatform({ devToken });
