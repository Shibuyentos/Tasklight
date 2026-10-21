import { type IDBPDatabase, wrap } from 'idb';
import type { Platform, SecretStore } from './types';

const DB_NAME = 'tasklight';
const DB_VERSION = 1;
const STORE = 'secrets';
const TOKEN_KEY = 'clickup-token';
const SKIP_DEV_TOKEN_KEY = 'tasklight.skipDevToken';

type SessionStore = Pick<Storage, 'getItem' | 'setItem'>;

export interface WebPlatformOptions {
  devToken?: string | null;
  /** `null` simula um navegador sem IndexedDB: o token fica só em memória. */
  indexedDB?: IDBFactory | null;
  sessionStorage?: SessionStore | null;
}

function browserIndexedDB(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function browserSessionStorage(): SessionStore | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

async function openDatabase(factory: IDBFactory): Promise<IDBPDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE);
  };
  const db = await wrap(request);
  if (!db) throw new Error('Não foi possível abrir o IndexedDB');
  return db;
}

async function readStoredToken(db: IDBPDatabase): Promise<string | null> {
  try {
    const value: unknown = await db.get(STORE, TOKEN_KEY);
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

function createSecretStore(options: WebPlatformOptions): SecretStore {
  const factory = options.indexedDB === undefined ? browserIndexedDB() : options.indexedDB;
  const session =
    options.sessionStorage === undefined ? browserSessionStorage() : options.sessionStorage;
  const devToken = options.devToken ?? null;
  // O valor mais recente desta sessão; também é o fallback quando o IndexedDB falha.
  let memoryToken: string | null = null;
  let database: Promise<IDBPDatabase | null> | null = null;

  function getDatabase(): Promise<IDBPDatabase | null> {
    database ??= factory ? openDatabase(factory).catch(() => null) : Promise.resolve(null);
    return database;
  }

  function devTokenSkipped(): boolean {
    try {
      return session?.getItem(SKIP_DEV_TOKEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  return {
    async getToken() {
      if (memoryToken) return memoryToken;
      const db = await getDatabase();
      const stored = db ? await readStoredToken(db) : null;
      if (stored) return stored;
      return devToken && !devTokenSkipped() ? devToken : null;
    },

    async setToken(token) {
      const value = token.trim();
      memoryToken = value;
      const db = await getDatabase();
      if (!db) return { persisted: false };
      try {
        await db.put(STORE, value, TOKEN_KEY);
        return { persisted: true };
      } catch {
        return { persisted: false };
      }
    },

    async clearToken() {
      memoryToken = null;
      try {
        session?.setItem(SKIP_DEV_TOKEN_KEY, '1');
      } catch {
        // Sem sessionStorage, o token de desenvolvimento volta a valer; não há o que fazer.
      }
      const db = await getDatabase();
      if (!db) return;
      try {
        await db.delete(STORE, TOKEN_KEY);
      } catch {
        // Nada salvo para apagar.
      }
    },
  };
}

export function createWebPlatform(options: WebPlatformOptions = {}): Platform {
  return { secrets: createSecretStore(options) };
}
