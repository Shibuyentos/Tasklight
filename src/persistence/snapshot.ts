import { type IDBPDatabase, wrap } from 'idb';
import type { SessionUser, Workspace } from '../store/session';
import type { TasksState } from '../store/tasks';

/** Sobe quando o formato salvo muda; snapshots de outra versão são descartados. */
export const SNAPSHOT_SCHEMA = 1;

const DB_NAME = 'tasklight-cache';
const DB_VERSION = 1;
const WORKSPACES = 'workspaces';
const SESSION = 'session';
const SESSION_KEY = 'current';
const DEFAULT_SAVE_DELAY_MS = 1000;

export interface SessionCache {
  userId: number;
  user: SessionUser;
  workspaces: Workspace[];
  savedAt: number;
}

export interface SnapshotStore {
  loadWorkspace(workspaceId: string, userId: number): Promise<TasksState | null>;
  saveWorkspace(workspaceId: string, userId: number, state: TasksState): Promise<void>;
  loadSession(): Promise<SessionCache | null>;
  saveSession(cache: SessionCache): Promise<void>;
  /** Esquece a conta salva (ao sair ou com token recusado); as tarefas ficam, presas ao usuário. */
  clearSession(): Promise<void>;
  clearAll(): Promise<void>;
}

export interface SnapshotStoreOptions {
  /** `null` simula um navegador sem IndexedDB: nada é lido nem gravado. */
  indexedDB?: IDBFactory | null;
  now?: () => number;
}

interface WorkspaceRecord {
  schema: number;
  userId: number;
  savedAt: number;
  state: TasksState;
}

type SessionRecord = SessionCache & { schema: number };

function browserIndexedDB(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

async function openDatabase(factory: IDBFactory): Promise<IDBPDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(WORKSPACES);
    request.result.createObjectStore(SESSION);
  };
  const db = await wrap(request);
  if (!db) throw new Error('Não foi possível abrir o IndexedDB');
  return db;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTasksState(value: unknown): value is TasksState {
  return (
    isObject(value) &&
    isObject(value.tasks) &&
    isObject(value.taskTypes) &&
    isObject(value.rowDetails) &&
    isObject(value.meta)
  );
}

export function createSnapshotStore(options: SnapshotStoreOptions = {}): SnapshotStore {
  const factory = options.indexedDB === undefined ? browserIndexedDB() : options.indexedDB;
  const now = options.now ?? (() => Date.now());
  let database: Promise<IDBPDatabase | null> | null = null;

  function getDatabase(): Promise<IDBPDatabase | null> {
    database ??= factory ? openDatabase(factory).catch(() => null) : Promise.resolve(null);
    return database;
  }

  // O cache só acelera a abertura: qualquer falha vira "nada salvo" e o app segue pela API.
  async function read(store: string, key: string): Promise<unknown> {
    try {
      const db = await getDatabase();
      return db ? await db.get(store, key) : undefined;
    } catch {
      return undefined;
    }
  }

  async function write(store: string, key: string, value: unknown): Promise<void> {
    try {
      const db = await getDatabase();
      await db?.put(store, value, key);
    } catch {
      // Sem espaço ou sem permissão: o próximo salvamento tenta de novo.
    }
  }

  return {
    async loadWorkspace(workspaceId, userId) {
      const record = (await read(WORKSPACES, workspaceId)) as Partial<WorkspaceRecord> | undefined;
      if (!isObject(record) || record.schema !== SNAPSHOT_SCHEMA || record.userId !== userId) {
        return null;
      }
      return isTasksState(record.state) ? record.state : null;
    },

    async saveWorkspace(workspaceId, userId, state) {
      const record: WorkspaceRecord = { schema: SNAPSHOT_SCHEMA, userId, savedAt: now(), state };
      await write(WORKSPACES, workspaceId, record);
    },

    async loadSession() {
      const record = (await read(SESSION, SESSION_KEY)) as Partial<SessionRecord> | undefined;
      if (!isObject(record) || record.schema !== SNAPSHOT_SCHEMA) return null;
      const { userId, user, workspaces, savedAt } = record;
      if (typeof userId !== 'number' || !isObject(user) || !Array.isArray(workspaces)) return null;
      return { userId, user, workspaces, savedAt: savedAt ?? 0 };
    },

    async saveSession(cache) {
      const record: SessionRecord = { ...cache, schema: SNAPSHOT_SCHEMA };
      await write(SESSION, SESSION_KEY, record);
    },

    async clearSession() {
      try {
        const db = await getDatabase();
        await db?.delete(SESSION, SESSION_KEY);
      } catch {
        // Nada salvo para apagar.
      }
    },

    async clearAll() {
      try {
        const db = await getDatabase();
        await Promise.all([db?.clear(WORKSPACES), db?.clear(SESSION)]);
      } catch {
        // Nada salvo para apagar.
      }
    },
  };
}

/** Agrupa pedidos de salvamento: grava uma vez quando eles param por `delayMs`. */
export function createSaveScheduler(
  save: () => Promise<void>,
  delayMs = DEFAULT_SAVE_DELAY_MS,
): { schedule(): void; flush(): Promise<void>; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
  }

  return {
    schedule() {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        save().catch(() => {});
      }, delayMs);
    },

    async flush() {
      if (timer === undefined) return;
      cancel();
      await save();
    },

    cancel,
  };
}
