import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Requester } from '../api/scheduler';
import type { DateContext } from '../domain/dates';
import type { Task } from '../domain/task';
import type { SnapshotStore } from '../persistence/snapshot';
import { emptyTasksState, type TasksState } from '../store/tasks';
import type { TasksApi } from '../sync/tasks-api';
import { task } from '../test/fixtures';
import { createWorkspaceServices } from './workspace';

const ME = 111;
const NOW = 1_792_600_000_000;

type ApiMocks = { [K in keyof TasksApi]: Mock<TasksApi[K]> };

function fakeApi(overrides: Partial<ApiMocks> = {}): ApiMocks {
  return {
    fetchAssignedRoots: vi.fn<TasksApi['fetchAssignedRoots']>(async () => []),
    fetchUpdatedSince: vi.fn<TasksApi['fetchUpdatedSince']>(async () => []),
    fetchOpenSubtasks: vi.fn<TasksApi['fetchOpenSubtasks']>(async () => []),
    fetchAttachmentsCount: vi.fn<TasksApi['fetchAttachmentsCount']>(async () => 0),
    fetchTaskTypes: vi.fn<TasksApi['fetchTaskTypes']>(async () => []),
    ...overrides,
  };
}

function fakeSnapshots(saved: TasksState | null) {
  return {
    loadWorkspace: vi.fn<SnapshotStore['loadWorkspace']>(async () => saved),
    saveWorkspace: vi.fn<SnapshotStore['saveWorkspace']>(async () => {}),
    loadSession: vi.fn<SnapshotStore['loadSession']>(async () => null),
    saveSession: vi.fn<SnapshotStore['saveSession']>(async () => {}),
    clearSession: vi.fn<SnapshotStore['clearSession']>(async () => {}),
    clearAll: vi.fn<SnapshotStore['clearAll']>(async () => {}),
  } satisfies SnapshotStore;
}

const unusedRequester: Requester = {
  get: async () => {
    throw new Error('A API falsa substitui o agendador nestes testes');
  },
};

const dateContext = (): DateContext => ({
  now: NOW,
  timeZone: 'America/Sao_Paulo',
  weekStartDay: 0,
});

function open(snapshots: SnapshotStore, api: TasksApi) {
  return createWorkspaceServices({
    workspaceId: '42',
    userId: ME,
    requester: unusedRequester,
    snapshots,
    dateContext,
    api,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createWorkspaceServices', () => {
  it('o snapshot salvo já está no store antes da primeira resposta da API', async () => {
    const saved = emptyTasksState();
    const mine = task({ assigneeIds: [ME] });
    saved.tasks[mine.id] = mine;
    saved.taskTypes[1] = { id: 1, name: 'Defeito', icon: 'bug' };
    saved.meta = { cursor: NOW - 60_000, lastFullSync: NOW - 60_000 };
    const snapshots = fakeSnapshots(saved);
    const api = fakeApi({ fetchUpdatedSince: vi.fn(() => new Promise<Task[]>(() => {})) });

    const workspace = await open(snapshots, api);
    await vi.advanceTimersByTimeAsync(0);

    expect(snapshots.loadWorkspace).toHaveBeenCalledWith('42', ME);
    expect(Object.keys(workspace.store.state.tasks)).toEqual([mine.id]);
    expect(api.fetchUpdatedSince).toHaveBeenCalled();
    await workspace.dispose();
  });

  it('sem snapshot, começa vazio e carrega as tarefas', async () => {
    const root = task({ assigneeIds: [ME] });
    const api = fakeApi({ fetchAssignedRoots: vi.fn(async () => [root]) });

    const workspace = await open(fakeSnapshots(null), api);
    await vi.advanceTimersByTimeAsync(0);

    expect(workspace.store.state.tasks[root.id]).toBeDefined();
    await workspace.dispose();
  });

  it('grava as mudanças 1 s depois da última', async () => {
    const snapshots = fakeSnapshots(null);
    const root = task({ assigneeIds: [ME] });
    const workspace = await open(
      snapshots,
      fakeApi({ fetchAssignedRoots: vi.fn(async () => [root]) }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots.saveWorkspace).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(snapshots.saveWorkspace).toHaveBeenCalledTimes(1);
    expect(snapshots.saveWorkspace.mock.calls[0]?.[2].tasks[root.id]).toEqual(root);
    await workspace.dispose();
  });

  it('dispose para a sincronização e grava na hora o que estava pendente', async () => {
    const snapshots = fakeSnapshots(null);
    const root = task({ assigneeIds: [ME] });
    const api = fakeApi({ fetchAssignedRoots: vi.fn(async () => [root]) });
    const workspace = await open(snapshots, api);
    await vi.advanceTimersByTimeAsync(0);

    await workspace.dispose();

    expect(snapshots.saveWorkspace).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.fetchUpdatedSince).not.toHaveBeenCalled();
  });
});
