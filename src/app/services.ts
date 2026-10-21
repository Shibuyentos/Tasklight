import { createHttpClient } from '../api/http';
import { getCurrentUser, getWorkspaces } from '../api/user';
import { platform } from '../platform';
import { createSessionService, createTokenHolder } from '../sync/session';
import type { Services } from './ServicesContext';

export function createServices(): Services {
  const token = createTokenHolder();
  const http = createHttpClient({ getToken: async () => token.get() });
  const session = createSessionService({
    secrets: platform.secrets,
    token,
    api: {
      getCurrentUser: () => getCurrentUser(http),
      getWorkspaces: () => getWorkspaces(http),
    },
  });
  return { session };
}
