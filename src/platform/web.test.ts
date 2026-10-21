// Registra as classes globais do IndexedDB (IDBRequest, IDBTransaction...) que o jsdom não tem.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createWebPlatform } from './web';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('createWebPlatform().secrets', () => {
  it('normaliza o token e o persiste no IndexedDB', async () => {
    const { secrets } = createWebPlatform({ sessionStorage: memoryStorage() });

    await expect(secrets.setToken(' pk_1_ABC \n')).resolves.toEqual({ persisted: true });

    const reopened = createWebPlatform({ sessionStorage: memoryStorage() });
    await expect(reopened.secrets.getToken()).resolves.toBe('pk_1_ABC');
  });

  it('clearToken apaga o token salvo', async () => {
    const { secrets } = createWebPlatform({ sessionStorage: memoryStorage() });
    await secrets.setToken('pk_1_ABC');

    await secrets.clearToken();

    await expect(secrets.getToken()).resolves.toBeNull();
  });

  it('sem token salvo, devolve o token de desenvolvimento', async () => {
    const { secrets } = createWebPlatform({
      devToken: 'pk_9_DEV',
      sessionStorage: memoryStorage(),
    });

    await expect(secrets.getToken()).resolves.toBe('pk_9_DEV');
  });

  it('depois de clearToken, ignora o token de desenvolvimento', async () => {
    const { secrets } = createWebPlatform({
      devToken: 'pk_9_DEV',
      sessionStorage: memoryStorage(),
    });

    await secrets.clearToken();

    await expect(secrets.getToken()).resolves.toBeNull();
  });

  it('sem IndexedDB, guarda o token só em memória', async () => {
    const { secrets } = createWebPlatform({ indexedDB: null, sessionStorage: memoryStorage() });

    await expect(secrets.setToken('pk_1_ABC')).resolves.toEqual({ persisted: false });
    await expect(secrets.getToken()).resolves.toBe('pk_1_ABC');
  });

  it('se abrir o IndexedDB falhar, guarda o token só em memória', async () => {
    const blocked = {
      open() {
        throw new Error('armazenamento bloqueado');
      },
    } as unknown as IDBFactory;
    const { secrets } = createWebPlatform({ indexedDB: blocked, sessionStorage: memoryStorage() });

    await expect(secrets.setToken('pk_1_ABC')).resolves.toEqual({ persisted: false });
    await expect(secrets.getToken()).resolves.toBe('pk_1_ABC');
  });
});
