import { createEffect, createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { ApiError } from '../api/errors';
import type { Task, TaskStatus } from '../domain/task';
import {
  assignedRoots,
  createTasksStore,
  openSubtaskCount,
  type TasksStore,
  type TaskType,
} from '../store/tasks';
import { task } from '../test/fixtures';
import {
  BACKLOG_LIMIT_MS,
  createTaskSync,
  FULL_SYNC_INTERVAL_MS,
  POLL_INTERVAL_MS,
  ROW_DETAIL_TTL_MS,
  type TaskSync,
} from './tasks';
import type { TasksApi } from './tasks-api';

const ME = 111;
const OTHER = 222;
const NOW = 1_792_600_000_000;
const HOUR = 3_600_000;
const REVIEW: TaskStatus = { name: 'em revisão', color: '#0c9395', type: 'custom', orderindex: 8 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type ApiMocks = { [K in keyof TasksApi]: Mock<TasksApi[K]> };

function fakeApi(overrides: Partial<ApiMocks> = {}): ApiMocks {
  return {
    fetchAssignedRoots: vi.fn<TasksApi['fetchAssignedRoots']>(async () => []),
    fetchUpdatedSince: vi.fn<TasksApi['fetchUpdatedSince']>(async () => []),
    fetchOpenSubtasks: vi.fn<TasksApi['fetchOpenSubtasks']>(async () => []),
    fetchAttachmentsCount: vi.fn<TasksApi['fetchAttachmentsCount']>(async () => 0),
    fetchTaskTypes: vi.fn<TasksApi['fetchTaskTypes']>(
      async (): Promise<TaskType[]> => [{ id: 1, name: 'Defeito', icon: 'bug' }],
    ),
    ...overrides,
  };
}

/** Store como o de quem já usou o app: tarefas, tipos e uma sincronização recente. */
function usedStore(tasks: Task[], meta = { cursor: NOW - 60_000, lastFullSync: NOW - 60_000 }) {
  const store = createTasksStore();
  store.upsertTasks(tasks);
  store.setTaskTypes([{ id: 1, name: 'Defeito', icon: 'bug' }]);
  store.setMeta(meta);
  return store;
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id).sort();

let running: TaskSync[] = [];

function syncFor(store: TasksStore, api: TasksApi, extra: { isOnline?: () => boolean } = {}) {
  const sync = createTaskSync({ store, api, userId: ME, ...extra });
  running.push(sync);
  return sync;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  for (const sync of running) sync.stop();
  running = [];
  vi.useRealTimers();
});

describe('carga inicial', () => {
  it('mostra a primeira página antes da segunda chegar e grava cursor e reconciliação', async () => {
    const first = [task({ assigneeIds: [ME], dateUpdated: NOW - 5000 })];
    const second = [task({ assigneeIds: [ME], dateUpdated: NOW - 9000 })];
    const gate = deferred<void>();
    const onChange = vi.fn();
    const api = fakeApi({
      fetchAssignedRoots: vi.fn(async (onPage) => {
        onPage?.(first);
        await gate.promise;
        onPage?.(second);
        return [...first, ...second];
      }),
    });
    const store = createTasksStore();
    const sync = createTaskSync({ store, api, userId: ME, onChange });
    running.push(sync);

    const started = sync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.status()).toBe('loading');
    expect(ids(assignedRoots(store.state, ME))).toEqual(ids(first));
    expect(onChange).toHaveBeenCalled();

    gate.resolve();
    await started;

    expect(ids(assignedRoots(store.state, ME))).toEqual(ids([...first, ...second]));
    expect(store.state.meta).toEqual({ cursor: NOW - 5000, lastFullSync: NOW });
    expect(sync.status()).toBe('idle');
    expect(api.fetchUpdatedSince).not.toHaveBeenCalled();
  });

  it('se a segunda página falha, mantém a primeira e não marca a reconciliação', async () => {
    const first = [task({ assigneeIds: [ME] })];
    const api = fakeApi({
      fetchAssignedRoots: vi.fn(async (onPage) => {
        onPage?.(first);
        throw new ApiError('network', 'sem rede');
      }),
    });
    const store = createTasksStore();

    await syncFor(store, api).start();

    expect(ids(assignedRoots(store.state, ME))).toEqual(ids(first));
    expect(store.state.meta.lastFullSync).toBeNull();
    expect(running[0]?.status()).toBe('offline');
  });

  it('carrega os tipos de tarefa quando ainda não há nenhum', async () => {
    const api = fakeApi();
    const store = createTasksStore();

    await syncFor(store, api).start();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.state.taskTypes[1]).toEqual({ id: 1, name: 'Defeito', icon: 'bug' });
  });

  it('não recarrega os tipos de tarefa que já tem', async () => {
    const api = fakeApi();

    await syncFor(usedStore([task()]), api).start();

    expect(api.fetchTaskTypes).not.toHaveBeenCalled();
  });
});

describe('delta', () => {
  it('aplica só o que interessa e avança o cursor', async () => {
    const changed = task({ assigneeIds: [ME], dateUpdated: NOW - HOUR });
    const lost = task({ assigneeIds: [ME], dateUpdated: NOW - HOUR });
    const store = usedStore([changed, lost]);
    const arrived = task({ assigneeIds: [ME], dateUpdated: NOW - 4000 });
    const subtask = task({ parentId: changed.id, assigneeIds: [OTHER], dateUpdated: NOW - 3000 });
    const unrelated = task({ assigneeIds: [OTHER], dateUpdated: NOW - 1000 });
    const api = fakeApi({
      fetchUpdatedSince: vi.fn(async () => [
        { ...changed, status: REVIEW, dateUpdated: NOW - 5000 },
        { ...lost, assigneeIds: [OTHER], dateUpdated: NOW - 2000 },
        arrived,
        subtask,
        unrelated,
      ]),
    });

    await syncFor(store, api).pollOnce();

    expect(api.fetchUpdatedSince).toHaveBeenCalledWith(NOW - 60_000 - 1000);
    expect(ids(assignedRoots(store.state, ME))).toEqual(ids([changed, arrived]));
    expect(store.state.tasks[changed.id]?.status).toEqual(REVIEW);
    expect(store.state.tasks[lost.id]?.assigneeIds).toEqual([OTHER]);
    expect(store.state.tasks[subtask.id]).toBeDefined();
    expect(store.state.tasks[unrelated.id]).toBeUndefined();
    expect(store.state.meta.cursor).toBe(NOW - 1000);
    expect(api.fetchAssignedRoots).not.toHaveBeenCalled();
  });

  it('guarda a subtarefa de uma raiz nova que chegou no mesmo delta', async () => {
    const store = usedStore([task()]);
    const root = task({ assigneeIds: [ME], dateUpdated: NOW - 2000 });
    const subtask = task({ parentId: root.id, assigneeIds: [OTHER], dateUpdated: NOW - 1000 });
    const api = fakeApi({ fetchUpdatedSince: vi.fn(async () => [subtask, root]) });

    await syncFor(store, api).pollOnce();

    expect(store.state.tasks[subtask.id]).toBeDefined();
  });

  it('repete a sobreposição de 1 s só na consulta seguinte a um avanço do cursor', async () => {
    const store = usedStore([task()], { cursor: NOW - 60_000, lastFullSync: NOW });
    const update = task({ assigneeIds: [ME], dateUpdated: NOW - 30_000 });
    const api = fakeApi({ fetchUpdatedSince: vi.fn(async () => [update]) });
    const sync = syncFor(store, api);

    await sync.pollOnce();
    await sync.pollOnce();
    await sync.pollOnce();

    expect(api.fetchUpdatedSince.mock.calls.map(([since]) => since)).toEqual([
      NOW - 60_000 - 1000,
      NOW - 30_000 - 1000,
      NOW - 30_000,
    ]);
  });

  it('erro de servidor deixa o status em erro e mantém os dados', async () => {
    const kept = task({ assigneeIds: [ME] });
    const api = fakeApi({
      fetchUpdatedSince: vi.fn(async () => {
        throw new ApiError('server', 'indisponível', { status: 503 });
      }),
    });
    const store = usedStore([kept]);
    const sync = syncFor(store, api);

    await sync.pollOnce();

    expect(sync.status()).toBe('error');
    expect(ids(assignedRoots(store.state, ME))).toEqual([kept.id]);
  });
});

describe('reconciliação', () => {
  it('na abertura recupera uma raiz antiga ausente do snapshot recente mesmo com delta vazio', async () => {
    const cached = task({ id: 'no-snapshot', assigneeIds: [ME], dateUpdated: NOW - HOUR });
    const shared = task({
      id: 'compartilhada-antiga',
      assigneeIds: [ME],
      spaceId: 'compartilhado',
      dateUpdated: NOW - 2 * HOUR,
    });
    const store = usedStore([cached]);
    const gate = deferred<void>();
    const order: string[] = [];
    const api = fakeApi({
      fetchUpdatedSince: vi.fn(async () => {
        order.push('delta');
        await gate.promise;
        return [];
      }),
      fetchAssignedRoots: vi.fn(async () => {
        order.push('reconciliação');
        return [cached, shared];
      }),
    });

    const started = syncFor(store, api).start();

    // O snapshot continua disponível enquanto a rede responde.
    expect(ids(assignedRoots(store.state, ME))).toEqual(['no-snapshot']);
    gate.resolve();
    await started;

    expect(ids(assignedRoots(store.state, ME))).toEqual(['compartilhada-antiga', 'no-snapshot']);
    expect(store.state.meta).toEqual({ cursor: NOW - 60_000, lastFullSync: NOW });
    expect(order).toEqual(['delta', 'reconciliação']);
  });

  it('na abertura stop durante o delta impede a reconciliação seguinte', async () => {
    const cached = task({ id: 'no-snapshot', assigneeIds: [ME], dateUpdated: NOW - HOUR });
    const store = usedStore([cached]);
    const gate = deferred<void>();
    const api = fakeApi({
      fetchUpdatedSince: vi.fn(async () => {
        await gate.promise;
        return [];
      }),
    });
    const sync = syncFor(store, api);

    const started = sync.start();
    sync.stop();
    gate.resolve();
    await started;

    expect(api.fetchAssignedRoots).not.toHaveBeenCalled();
    expect(ids(assignedRoots(store.state, ME))).toEqual(['no-snapshot']);
    expect(store.state.meta.lastFullSync).toBe(NOW - 60_000);
  });

  it('com o app fechado por mais de 6 h, reconcilia em vez de percorrer o backlog', async () => {
    const mine = task({ assigneeIds: [ME], dateUpdated: NOW - 8 * HOUR });
    const store = usedStore([mine], { cursor: NOW - 7 * HOUR, lastFullSync: NOW - 7 * HOUR });
    const api = fakeApi({ fetchAssignedRoots: vi.fn(async () => [mine]) });
    const sync = syncFor(store, api);

    await sync.start();

    expect(api.fetchUpdatedSince).not.toHaveBeenCalled();
    expect(sync.status()).toBe('idle');
    // O cursor recomeça perto de agora, com margem para o relógio local fora de hora.
    expect(store.state.meta.cursor).toBe(NOW - 10 * 60_000);
  });

  it('remove as raízes que não vieram mais, com as subtarefas e os detalhes delas', async () => {
    const kept = task({ assigneeIds: [ME] });
    const deleted = task({ assigneeIds: [ME] });
    const deletedChild = task({ parentId: deleted.id });
    const deletedGrandchild = task({ parentId: deletedChild.id });
    const formerlyMine = task({ assigneeIds: [OTHER] });
    const keptChild = task({ parentId: kept.id });
    const store = usedStore([
      kept,
      deleted,
      deletedChild,
      deletedGrandchild,
      formerlyMine,
      keptChild,
    ]);
    store.setRowDetail(deleted.id, { attachments: 1 });
    const api = fakeApi({ fetchAssignedRoots: vi.fn(async () => [kept]) });

    await syncFor(store, api).refresh();

    expect(Object.keys(store.state.tasks).sort()).toEqual(ids([kept, keptChild]));
    expect(store.state.rowDetails[deleted.id]).toBeUndefined();
  });

  it('faz o delta e depois reconcilia quando a última reconciliação tem mais de 2 h', async () => {
    const store = usedStore([task({ assigneeIds: [ME] })], {
      cursor: NOW - 60_000,
      lastFullSync: NOW - 3 * HOUR,
    });
    const order: string[] = [];
    const api = fakeApi({
      fetchUpdatedSince: vi.fn(async () => {
        order.push('delta');
        return [];
      }),
      fetchAssignedRoots: vi.fn(async () => {
        order.push('reconciliação');
        return [];
      }),
    });

    await syncFor(store, api).start();

    expect(order).toEqual(['delta', 'reconciliação']);
  });
});

describe('ciclo', () => {
  it('consulta o delta a cada 30 s e reconcilia a cada 2 h', async () => {
    const mine = task({ assigneeIds: [ME] });
    const store = usedStore([mine], {
      cursor: NOW - 1000,
      lastFullSync: NOW,
    });
    const api = fakeApi({ fetchAssignedRoots: vi.fn(async () => [mine]) });
    await syncFor(store, api).start();
    expect(api.fetchUpdatedSince).toHaveBeenCalledTimes(1);
    expect(api.fetchAssignedRoots).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(api.fetchUpdatedSince).toHaveBeenCalledTimes(2);
    expect(api.fetchAssignedRoots).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FULL_SYNC_INTERVAL_MS);
    expect(api.fetchAssignedRoots).toHaveBeenCalledTimes(2);
  });

  it('sem conexão, o ciclo não chama a API e o status fica offline', async () => {
    let online = false;
    const store = usedStore([task({ assigneeIds: [ME] })]);
    const api = fakeApi();
    const sync = syncFor(store, api, { isOnline: () => online });

    await sync.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(sync.status()).toBe('offline');
    expect(api.fetchUpdatedSince).not.toHaveBeenCalled();

    online = true;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(api.fetchUpdatedSince).toHaveBeenCalledOnce();
    expect(sync.status()).toBe('idle');
  });

  it('depois de stop(), uma resposta atrasada não escreve no store', async () => {
    const gate = deferred<void>();
    const late = [task({ assigneeIds: [ME] })];
    const api = fakeApi({
      fetchAssignedRoots: vi.fn(async (onPage) => {
        await gate.promise;
        onPage?.(late);
        return late;
      }),
    });
    const store = createTasksStore();
    const sync = syncFor(store, api);

    const started = sync.start();
    sync.stop();
    gate.resolve();
    await started;

    expect(store.state.tasks).toEqual({});
    expect(store.state.meta.lastFullSync).toBeNull();
  });

  it('depois de stop(), o ciclo para', async () => {
    const api = fakeApi();
    const sync = syncFor(usedStore([task()]), api);
    await sync.start();

    sync.stop();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(api.fetchUpdatedSince).toHaveBeenCalledOnce();
  });

  it('constantes do ciclo', () => {
    expect([POLL_INTERVAL_MS, FULL_SYNC_INTERVAL_MS, BACKLOG_LIMIT_MS, ROW_DETAIL_TTL_MS]).toEqual([
      30_000, 7_200_000, 21_600_000, 21_600_000,
    ]);
  });
});

describe('requestRowDetails', () => {
  it('pede subtarefas e anexos uma vez, mesmo com pedidos repetidos', async () => {
    const root = task({ assigneeIds: [ME], dateUpdated: 50 });
    const store = usedStore([root]);
    const api = fakeApi({
      fetchOpenSubtasks: vi.fn(async () => [
        task({ parentId: root.id }),
        task({ parentId: root.id }),
      ]),
      fetchAttachmentsCount: vi.fn(async () => 2),
    });
    const sync = syncFor(store, api);

    sync.requestRowDetails([root.id]);
    sync.requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);

    expect(api.fetchOpenSubtasks).toHaveBeenCalledOnce();
    expect(api.fetchAttachmentsCount).toHaveBeenCalledOnce();
    expect(store.state.rowDetails[root.id]).toEqual({
      subtasksCheckedAt: NOW,
      attachments: 2,
      attachmentsCheckedAt: NOW,
      forUpdated: 50,
    });
    expect(openSubtaskCount(store.state, root.id)).toBe(2);

    sync.requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.fetchOpenSubtasks).toHaveBeenCalledOnce();
  });

  it('pede de novo depois de 6 h', async () => {
    const root = task({ assigneeIds: [ME] });
    const api = fakeApi();
    const sync = syncFor(usedStore([root]), api);
    sync.requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);

    vi.setSystemTime(NOW + ROW_DETAIL_TTL_MS + 1);
    sync.requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);

    expect(api.fetchOpenSubtasks).toHaveBeenCalledTimes(2);
    expect(api.fetchAttachmentsCount).toHaveBeenCalledTimes(2);
  });

  it('pede de novo quando a tarefa muda', async () => {
    const root = task({ assigneeIds: [ME], dateUpdated: 50 });
    const store = usedStore([root]);
    const api = fakeApi();
    const sync = syncFor(store, api);
    sync.requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);

    store.upsertTasks([{ ...root, dateUpdated: 60 }]);
    sync.requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);

    expect(api.fetchOpenSubtasks).toHaveBeenCalledTimes(2);
  });

  it('tira do store as subtarefas que deixaram de estar abertas', async () => {
    const root = task({ assigneeIds: [ME] });
    const closedSince = task({ parentId: root.id });
    const store = usedStore([root, closedSince]);
    const api = fakeApi({ fetchOpenSubtasks: vi.fn(async () => []) });

    syncFor(store, api).requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.state.tasks[closedSince.id]).toBeUndefined();
    expect(openSubtaskCount(store.state, root.id)).toBe(0);
  });

  it('uma falha não marca o detalhe e o próximo pedido tenta de novo', async () => {
    const root = task({ assigneeIds: [ME] });
    const store = usedStore([root]);
    const api = fakeApi({
      fetchOpenSubtasks: vi.fn(async () => {
        throw new ApiError('network', 'sem rede');
      }),
    });
    const sync = syncFor(store, api);

    sync.requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);
    expect(openSubtaskCount(store.state, root.id)).toBeNull();

    sync.requestRowDetails([root.id]);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.fetchOpenSubtasks).toHaveBeenCalledTimes(2);
  });

  it('ignora ids desconhecidos e subtarefas', async () => {
    const root = task({ assigneeIds: [ME] });
    const child = task({ parentId: root.id });
    const api = fakeApi();

    syncFor(usedStore([root, child]), api).requestRowDetails(['nao-existe', child.id]);
    await vi.advanceTimersByTimeAsync(0);

    expect(api.fetchOpenSubtasks).not.toHaveBeenCalled();
  });
});

describe('tarefas de espaços compartilhados ou não classificados', () => {
  it('mantém na primeira página as raízes compartilhadas de outros espaços', async () => {
    const visible = task({ assigneeIds: [ME] });
    const sharedList = task({ assigneeIds: [ME], spaceId: 'compartilhado' });
    const sharedTask = task({ assigneeIds: [ME], spaceId: 'outro-compartilhado' });
    const unclassified = task({ assigneeIds: [ME], spaceId: 'sem-classificacao' });
    const roots = [visible, sharedList, sharedTask, unclassified];
    const gate = deferred<void>();
    const api = fakeApi({
      fetchAssignedRoots: vi.fn(async (onPage) => {
        onPage?.(roots);
        await gate.promise;
        return roots;
      }),
    });
    const store = createTasksStore();

    const started = syncFor(store, api).start();
    await vi.advanceTimersByTimeAsync(0);

    expect(ids(assignedRoots(store.state, ME))).toEqual(ids(roots));

    gate.resolve();
    await started;
    expect(ids(assignedRoots(store.state, ME))).toEqual(ids(roots));
  });

  it('aceita uma raiz compartilhada e suas filhas no delta e avança o cursor', async () => {
    const store = usedStore([task({ assigneeIds: [ME] })]);
    const shared = task({
      assigneeIds: [ME],
      spaceId: 'compartilhado',
      dateUpdated: NOW - 2000,
    });
    const child = task({
      parentId: shared.id,
      assigneeIds: [OTHER],
      spaceId: shared.spaceId,
      dateUpdated: NOW - 1000,
    });
    const api = fakeApi({ fetchUpdatedSince: vi.fn(async () => [child, shared]) });

    await syncFor(store, api).pollOnce();

    expect(store.state.tasks[shared.id]).toBeDefined();
    expect(store.state.tasks[child.id]).toBeDefined();
    expect(store.state.meta.cursor).toBe(NOW - 1000);
  });

  it('a reconciliação preserva raízes sem classificação e seus descendentes', async () => {
    const kept = task({ assigneeIds: [ME] });
    const shared = task({ assigneeIds: [ME], spaceId: 'compartilhado' });
    const unclassified = task({ assigneeIds: [ME], spaceId: 'sem-classificacao' });
    const child = task({ parentId: unclassified.id, spaceId: unclassified.spaceId });
    const gone = task({ assigneeIds: [ME], spaceId: 'sem-classificacao' });
    const store = usedStore([kept, shared, unclassified, child, gone]);
    const api = fakeApi({
      fetchAssignedRoots: vi.fn(async () => [kept, shared, unclassified]),
    });

    await syncFor(store, api).refresh();

    expect(Object.keys(store.state.tasks).sort()).toEqual(ids([kept, shared, unclassified, child]));
  });
});

describe('dentro de um efeito', () => {
  it('chamar o sync não faz o efeito depender do store', async () => {
    const root = task({ assigneeIds: [ME] });
    const store = usedStore([root]);
    const sync = syncFor(store, fakeApi({ fetchAttachmentsCount: vi.fn(async () => 3) }));
    let runs = 0;

    const dispose = createRoot((disposeRoot) => {
      createEffect(() => {
        runs += 1;
        void sync.start();
        void sync.pollOnce();
        sync.requestRowDetails([root.id]);
      });
      return disposeRoot;
    });
    await vi.advanceTimersByTimeAsync(0);
    store.upsertTasks([task({ assigneeIds: [ME], dateUpdated: NOW })]);
    store.setMeta({ cursor: NOW });
    await vi.advanceTimersByTimeAsync(0);

    expect(runs).toBe(1);
    dispose();
  });
});

it('reconciliation retains recent unassigned roots and independently opened descendants until expiry', async () => {
  const root = task({ id: 'retained-root', assigneeIds: [OTHER] });
  const child = task({ id: 'retained-child', parentId: 'removed', assigneeIds: [OTHER] });
  const store = usedStore([root, child, task({ id: 'removed', assigneeIds: [OTHER] })]);
  store.retainTask(root.id, NOW + 1000);
  store.retainTask(child.id, NOW + 1000);
  const sync = syncFor(store, fakeApi());
  await sync.refresh();
  expect(Object.keys(store.state.tasks).sort()).toEqual(['retained-child', 'retained-root']);
  expect(assignedRoots(store.state, ME)).toEqual([]);
  vi.setSystemTime(NOW + 2000);
  await sync.refresh();
  expect(Object.keys(store.state.tasks)).toEqual([]);
  expect(store.state.retainedUntil).toEqual({});
});

it('an omitted retained assigned task leaves the assigned view without inventing assignee changes', async () => {
  const root = task({ id: 'recent-assigned', assigneeIds: [ME], dateUpdated: NOW - 100 });
  const store = usedStore([root]);
  store.retainTask(root.id, NOW + 10000);
  const api = fakeApi();
  const sync = syncFor(store, api);
  await sync.refresh();
  expect(store.state.tasks[root.id]?.assigneeIds).toEqual([ME]);
  expect(assignedRoots(store.state, ME)).toEqual([]);
  store.upsertTasks([root]);
  expect(assignedRoots(store.state, ME)).toEqual([]);
  api.fetchUpdatedSince.mockResolvedValue([{ ...root, dateUpdated: NOW + 1 }]);
  await sync.pollOnce();
  expect(assignedRoots(store.state, ME).map((task) => task.id)).toEqual([root.id]);
});
