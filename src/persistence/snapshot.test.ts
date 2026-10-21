// Registra as classes globais do IndexedDB (IDBRequest, IDBTransaction...) que o jsdom não tem.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { wrap } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyTasksState, type TasksState } from '../store/tasks';
import { task } from '../test/fixtures';
import {
  createSaveScheduler,
  createSnapshotStore,
  type SessionCache,
  SNAPSHOT_SCHEMA,
} from './snapshot';

const USER_ID = 111;

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

/** Abre o banco direto, como outra versão do app faria, para gravar registros à mão. */
async function rawDatabase(upgrade?: (db: IDBDatabase) => void) {
  const request = factory.open('tasklight-cache', 1);
  if (upgrade) request.onupgradeneeded = () => upgrade(request.result);
  const db = await wrap(request);
  if (!db) throw new Error('O banco de teste não abriu');
  return db;
}

function stateWith(...names: string[]): TasksState {
  const state = emptyTasksState();
  for (const name of names) {
    const item = task({ name });
    state.tasks[item.id] = item;
  }
  state.meta.cursor = 1234;
  return state;
}

function session(): SessionCache {
  return {
    userId: USER_ID,
    user: {
      id: USER_ID,
      username: 'Ana Teste',
      initials: 'AT',
      color: '#7b68ee',
      profilePicture: null,
      timezone: 'America/Sao_Paulo',
      weekStartDay: 0,
    },
    workspaces: [{ id: 'w1', name: 'Exemplo', color: '#07a092', avatar: null }],
    savedAt: 500,
  };
}

describe('createSnapshotStore', () => {
  it('guarda e lê o estado de um workspace', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });
    const state = stateWith('Primeira', 'Segunda');

    await snapshots.saveWorkspace('w1', USER_ID, state);

    const reopened = createSnapshotStore({ indexedDB: factory });
    await expect(reopened.loadWorkspace('w1', USER_ID)).resolves.toEqual(state);
  });

  it('ignora o snapshot de outro usuário', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });
    await snapshots.saveWorkspace('w1', USER_ID, stateWith('Minha'));

    await expect(snapshots.loadWorkspace('w1', 222)).resolves.toBeNull();
  });

  it('ignora um snapshot de outra versão do esquema', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });
    await snapshots.saveWorkspace('w1', USER_ID, stateWith('Atual'));
    const db = await rawDatabase();
    await db.put(
      'workspaces',
      { schema: SNAPSHOT_SCHEMA + 1, userId: USER_ID, savedAt: 0, state: stateWith('Futura') },
      'w1',
    );
    db.close();

    await expect(snapshots.loadWorkspace('w1', USER_ID)).resolves.toBeNull();
  });

  it('ignora um registro corrompido', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });
    await snapshots.saveWorkspace('w1', USER_ID, stateWith('Atual'));
    const db = await rawDatabase();
    await db.put('workspaces', { schema: SNAPSHOT_SCHEMA, userId: USER_ID, state: 'x' }, 'w1');
    db.close();

    await expect(snapshots.loadWorkspace('w1', USER_ID)).resolves.toBeNull();
  });

  it('mantém cada workspace separado', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });
    const first = stateWith('Do primeiro');
    const second = stateWith('Do segundo');

    await snapshots.saveWorkspace('w1', USER_ID, first);
    await snapshots.saveWorkspace('w2', USER_ID, second);

    await expect(snapshots.loadWorkspace('w1', USER_ID)).resolves.toEqual(first);
    await expect(snapshots.loadWorkspace('w2', USER_ID)).resolves.toEqual(second);
    await expect(snapshots.loadWorkspace('w3', USER_ID)).resolves.toBeNull();
  });

  it('guarda e lê a sessão', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });

    await snapshots.saveSession(session());

    await expect(snapshots.loadSession()).resolves.toEqual(session());
  });

  it('ignora uma sessão de outra versão do esquema', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });
    await snapshots.saveSession(session());
    const db = await rawDatabase();
    await db.put('session', { ...session(), schema: SNAPSHOT_SCHEMA + 1 }, 'current');
    db.close();

    await expect(snapshots.loadSession()).resolves.toBeNull();
  });

  it('um banco sem as tabelas esperadas não quebra leitura nem gravação', async () => {
    const db = await rawDatabase((raw) => raw.createObjectStore('workspaces'));
    db.close();
    const snapshots = createSnapshotStore({ indexedDB: factory });

    await expect(snapshots.saveSession(session())).resolves.toBeUndefined();
    await expect(snapshots.loadSession()).resolves.toBeNull();
  });

  it('clearSession apaga só a sessão e mantém as tarefas', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });
    const state = stateWith('Fica');
    await snapshots.saveWorkspace('w1', USER_ID, state);
    await snapshots.saveSession(session());

    await snapshots.clearSession();

    await expect(snapshots.loadSession()).resolves.toBeNull();
    await expect(snapshots.loadWorkspace('w1', USER_ID)).resolves.toEqual(state);
  });

  it('clearAll apaga workspaces e sessão', async () => {
    const snapshots = createSnapshotStore({ indexedDB: factory });
    await snapshots.saveWorkspace('w1', USER_ID, stateWith('Qualquer'));
    await snapshots.saveSession(session());

    await snapshots.clearAll();

    await expect(snapshots.loadWorkspace('w1', USER_ID)).resolves.toBeNull();
    await expect(snapshots.loadSession()).resolves.toBeNull();
  });

  it('sem IndexedDB, lê nada e grava sem erro', async () => {
    const snapshots = createSnapshotStore({ indexedDB: null });

    await expect(snapshots.saveWorkspace('w1', USER_ID, stateWith('x'))).resolves.toBeUndefined();
    await expect(snapshots.saveSession(session())).resolves.toBeUndefined();
    await expect(snapshots.loadWorkspace('w1', USER_ID)).resolves.toBeNull();
    await expect(snapshots.loadSession()).resolves.toBeNull();
    await expect(snapshots.clearAll()).resolves.toBeUndefined();
  });

  it('com o IndexedDB quebrado, lê nada e grava sem erro', async () => {
    const broken = {
      open: () => {
        throw new Error('bloqueado');
      },
    } as unknown as IDBFactory;
    const snapshots = createSnapshotStore({ indexedDB: broken });

    await expect(snapshots.saveWorkspace('w1', USER_ID, stateWith('x'))).resolves.toBeUndefined();
    await expect(snapshots.loadWorkspace('w1', USER_ID)).resolves.toBeNull();
  });
});

describe('createSaveScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('agrupa pedidos próximos e salva uma vez depois da pausa', async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler(save);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(250);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(250);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
  });

  it('flush salva na hora o que estava pendente', async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler(save);
    scheduler.schedule();

    await scheduler.flush();
    expect(save).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledOnce();
  });

  it('flush sem nada pendente não salva', async () => {
    const save = vi.fn(async () => {});

    await createSaveScheduler(save).flush();

    expect(save).not.toHaveBeenCalled();
  });

  it('cancel descarta o salvamento pendente', async () => {
    const save = vi.fn(async () => {});
    const scheduler = createSaveScheduler(save);
    scheduler.schedule();

    scheduler.cancel();
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).not.toHaveBeenCalled();
  });
});
