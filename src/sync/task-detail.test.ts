import { describe, expect, it, vi } from 'vitest';
import { normalizeComment } from '../domain/rich-comment';
import type { TaskDetail } from '../domain/task-detail';
import { createTasksStore } from '../store/tasks';
import { deferred, detail, detailApi } from '../test/task-detail-fixtures';
import { createTaskDetailsService } from './task-detail';

const setup = (extra = {}) => {
  const api = detailApi();
  const store = createTasksStore();
  const service = createTaskDetailsService({ api, store, workspaceId: 'w', userId: 1, ...extra });
  return { api, store, service };
};

describe('task detail service', () => {
  it('shows persisted detail offline, retains summary, and tolerates independent resource errors', async () => {
    const cached = detail('a');
    const { api, store, service } = setup({
      cache: {
        load: async () => ({
          entries: { a: { detail: cached, fetchedAt: 1, accessedAt: 1 } },
          lists: [],
          metadata: {},
        }),
        save: async () => {},
      },
      isOnline: () => false,
    });
    await service.open('a');
    expect(service.state.detail?.markdownDescription).toBe('original markdown');
    expect(store.state.tasks.a?.name).toBe('a');
    expect(store.state.retainedUntil?.a).toBeGreaterThan(Date.now());
    expect(api.getTask).not.toHaveBeenCalled();
    service.dispose();
  });
  it('partial denial never hides the loaded task', async () => {
    const { api, service } = setup();
    api.getComments.mockRejectedValue(new Error('denied'));
    api.getTimeInStatus.mockRejectedValue(new Error('denied'));
    await service.open('a');
    expect(service.state.detail?.task.id).toBe('a');
    expect(service.state.errors.comments).toBeDefined();
    expect(service.state.errors.timeInStatus).toBeDefined();
    service.dispose();
  });
  it('late responses cannot replace a newly opened task or write after disposal', async () => {
    const old = deferred<TaskDetail>();
    const { api, service, store } = setup();
    api.getTask.mockImplementation((id) =>
      id === 'a' ? old.promise : Promise.resolve(detail(id)),
    );
    const first = service.open('a');
    await service.open('b');
    old.resolve(detail('a'));
    await first;
    expect(service.state.taskId).toBe('b');
    expect(service.state.detail?.task.id).toBe('b');
    const late = deferred<TaskDetail>();
    api.getTask.mockReturnValue(late.promise);
    const request = service.open('c');
    await Promise.resolve();
    service.dispose();
    late.resolve(detail('c'));
    await request;
    expect(store.state.tasks.c).toBeUndefined();
  });
  it('dedupes in-flight and fresh requests; paginated comments overlap without duplication', async () => {
    const { api, service } = setup();
    const a = normalizeComment({ id: '1', comment_text: 'one' });
    const b = normalizeComment({ id: '2', comment_text: 'two' });
    api.getComments
      .mockResolvedValueOnce({ comments: [a], nextCursor: { start: '1', start_id: '1' } })
      .mockResolvedValueOnce({ comments: [a, b], nextCursor: null });
    await Promise.all([service.open('a'), service.open('a')]);
    await service.open('a');
    expect(api.getTask).toHaveBeenCalledTimes(1);
    expect(api.getComments).toHaveBeenCalledTimes(1);
    await Promise.all([service.loadMoreComments(), service.loadMoreComments()]);
    expect(service.state.comments.map((c) => c.id)).toEqual(['1', '2']);
    expect(api.getComments).toHaveBeenCalledTimes(2);
    expect(service.state.nextCursor).toBeNull();
    service.dispose();
  });
  it('publishes list pages before discovery completes and dedupes list metadata', async () => {
    const { api, service } = setup();
    const finished = deferred<[]>();
    api.getLists.mockImplementation(async (page) => {
      page?.([
        { id: 'l', name: 'first', spaceId: 's', spaceName: '', folderId: null, folderName: null },
      ]);
      return finished.promise;
    });
    const request = service.loadLists();
    await vi.waitFor(() => expect(service.lists().map((l) => l.id)).toEqual(['l']));
    await Promise.all([service.listMetadata('l'), service.listMetadata('l')]);
    expect(api.getList).toHaveBeenCalledTimes(1);
    finished.resolve([]);
    await request;
    service.dispose();
  });
});

it('refresh after a confirmed comment ignores the older in-flight thread', async () => {
  const { api, service } = setup();
  const old = deferred<{ comments: ReturnType<typeof normalizeComment>[]; nextCursor: null }>();
  api.getComments
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ comments: [normalizeComment({ id: 'new' })], nextCursor: null });
  const opening = service.open('a');
  await vi.waitFor(() => expect(api.getComments).toHaveBeenCalledTimes(1));
  const refreshing = service.refreshComments('a');
  await Promise.resolve();
  old.resolve({ comments: [normalizeComment({ id: 'old' })], nextCursor: null });
  await Promise.all([opening, refreshing]);
  expect(service.state.comments.map((comment) => comment.id)).toEqual(['new']);
  service.dispose();
});
it('TTL expiry refetches while fresh cache is immediate; partial metadata can retry', async () => {
  let time = 1000;
  const { api, service } = setup({ now: () => time });
  await service.open('a');
  time += 300_001;
  await service.open('a');
  expect(api.getTask).toHaveBeenCalledTimes(2);
  api.getList.mockResolvedValueOnce({
    id: 'list',
    name: 'List',
    statuses: [],
    customFields: [],
    members: [],
    breadcrumb: { space: null, folder: null, list: null },
    permissionLevel: null,
    unavailable: ['members'],
  });
  expect((await service.listMetadata('list'))?.unavailable).toEqual(['members']);
  expect((await service.listMetadata('list'))?.unavailable).toBeUndefined();
  expect(api.getList).toHaveBeenCalledTimes(2);
  service.dispose();
});
it('detail disposal flushes already confirmed cache but blocks late fetched state', async () => {
  const saved: string[] = [];
  const { service } = setup({
    cache: {
      load: async () => null,
      save: async (_w: string, _u: number, data: { entries: Record<string, unknown> }) => {
        saved.push(...Object.keys(data.entries));
      },
    },
  });
  await service.open('a');
  service.dispose();
  await service.flush();
  expect(saved).toContain('a');
});

it('writes the cache partition once per opening instead of once per resource', async () => {
  const saves: number[] = [];
  const { service } = setup({
    cache: {
      load: async () => null,
      save: async (_w: string, _u: number, data: { entries: Record<string, unknown> }) => {
        saves.push(Object.keys(data.entries).length);
      },
    },
  });
  await service.open('a');
  await service.flush();
  expect(saves).toEqual([1]);
  service.dispose();
});

it('bounds the in-memory detail LRU even without IndexedDB while keeping retained summaries', async () => {
  const { service, store } = setup();
  for (let index = 0; index < 51; index += 1) await service.open(`task-${index}`);
  expect(service.peek('task-0')).toBeNull();
  expect(service.peek('task-50')?.task.id).toBe('task-50');
  expect(store.state.tasks['task-0']).toBeDefined();
  expect(service.cachedTasks()).toHaveLength(51);
  service.dispose();
});

it('late metadata cannot be delivered from a disposed account service', async () => {
  const { api, service } = setup();
  const metadata = deferred<Awaited<ReturnType<typeof api.getList>>>();
  api.getList.mockReturnValue(metadata.promise);
  const loading = service.listMetadata('list');
  await Promise.resolve();
  await Promise.resolve();
  service.dispose();
  metadata.resolve({
    id: 'list',
    name: 'Private',
    statuses: [],
    members: [],
    customFields: [],
    breadcrumb: { list: null, folder: null, space: null },
    permissionLevel: null,
  });
  expect(await loading).toBeNull();
});

it('an active task delta refreshes detail and comments once; other tasks and disposal do not', async () => {
  const { api, service, store } = setup();
  await service.open('a');
  store.upsertTasks([detail('b', 'other', 20).task]);
  service.notifySummaryChanges();
  await Promise.resolve();
  expect(api.getTask).toHaveBeenCalledTimes(1);
  api.getTask.mockResolvedValue({
    ...detail('a', 'updated', 20),
    markdownDescription: 'from another device',
  });
  store.upsertTasks([detail('a', 'updated', 20).task]);
  service.notifySummaryChanges();
  service.notifySummaryChanges();
  await vi.waitFor(() =>
    expect(service.state.detail?.markdownDescription).toBe('from another device'),
  );
  expect(api.getTask).toHaveBeenCalledTimes(2);
  expect(api.getComments).toHaveBeenCalledTimes(2);
  service.dispose();
  store.upsertTasks([detail('a', 'late', 30).task]);
  service.notifySummaryChanges();
  expect(api.getTask).toHaveBeenCalledTimes(2);
});

it('continues when persistence throws on load or save', async () => {
  const { service } = setup({
    cache: {
      load: async () => {
        throw new Error('blocked');
      },
      save: async () => {
        throw new Error('quota');
      },
    },
  });
  await service.open('a');
  await expect(service.flush()).resolves.toBeUndefined();
  expect(service.state.detail?.task.id).toBe('a');
  service.dispose();
});

it('opening detail from a reactive effect does not subscribe the effect to internal cache writes', async () => {
  const { createEffect, createRoot, createSignal } = await import('solid-js');
  const { api, service } = setup();
  let runs = 0;
  let stop = () => {};
  const jobs: Promise<void>[] = [];
  const change = createRoot((dispose) => {
    stop = dispose;
    const [id, setId] = createSignal('a');
    createEffect(() => {
      runs += 1;
      if (runs > 4) return;
      jobs.push(service.open(id()));
    });
    return setId;
  });
  await Promise.all(jobs);
  await Promise.resolve();
  expect(runs).toBe(1);
  change('b');
  await Promise.all(jobs);
  expect(runs).toBe(2);
  expect(api.getTask).toHaveBeenCalledTimes(2);
  stop();
  service.dispose();
});
