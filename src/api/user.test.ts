import { describe, expect, it } from 'vitest';
import type { HttpClient } from './http';
import { getCurrentUser, getWorkspaces } from './user';

function fakeHttp(responses: Record<string, unknown>): HttpClient {
  return {
    get: async <T>(path: string) => responses[path] as T,
  };
}

describe('getCurrentUser', () => {
  it('devolve só os campos usados do body.user', async () => {
    const http = fakeHttp({
      '/user': {
        user: {
          id: 1,
          username: 'Ana Teste',
          email: 'ana@exemplo.com',
          color: '#7b68ee',
          initials: 'AT',
          profilePicture: null,
          timezone: 'America/Sao_Paulo',
          week_start_day: 0,
        },
      },
    });

    await expect(getCurrentUser(http)).resolves.toEqual({
      id: 1,
      username: 'Ana Teste',
      email: 'ana@exemplo.com',
      color: '#7b68ee',
      initials: 'AT',
      profilePicture: null,
      timezone: 'America/Sao_Paulo',
    });
  });
});

describe('getWorkspaces', () => {
  it('devolve body.teams sem a lista de membros', async () => {
    const http = fakeHttp({
      '/team': {
        teams: [
          {
            id: '900',
            name: 'Exemplo',
            color: '#07a092',
            avatar: null,
            members: [{ user: { id: 1 } }, { user: { id: 2 } }],
          },
        ],
      },
    });

    await expect(getWorkspaces(http)).resolves.toEqual([
      { id: '900', name: 'Exemplo', color: '#07a092', avatar: null },
    ]);
  });
});
