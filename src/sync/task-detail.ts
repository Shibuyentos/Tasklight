import { createSignal, untrack } from 'solid-js';
import type { TaskDetailApi } from '../api/task-detail';
import { type CommentCursor, mergeComments, type TaskComment } from '../domain/rich-comment';
import type { Task } from '../domain/task';
import type {
  ListChoice,
  ListMetadata,
  StatusDuration,
  TaskDetail,
  TaskTag,
} from '../domain/task-detail';
import { createSaveScheduler } from '../persistence/snapshot';
import {
  type CachedTaskDetail,
  limitDetails,
  type TaskDetailsCache,
  type TaskDetailsSnapshot,
} from '../persistence/task-details';
import type { TasksStore } from '../store/tasks';
export const DETAIL_TTL_MS = 5 * 60_000;
export const COMMENTS_TTL_MS = 60_000;
export const METADATA_TTL_MS = 15 * 60_000;
export const RETENTION_MS = 30 * 24 * 60 * 60_000;
export interface TaskDetailsState {
  readonly taskId: string | null;
  readonly detail: TaskDetail | null;
  readonly comments: TaskComment[];
  readonly nextCursor: CommentCursor | null;
  readonly replies: Record<string, TaskComment[]>;
  readonly timeInStatus: StatusDuration[];
  readonly loading: Record<string, boolean>;
  readonly errors: Record<string, unknown>;
}
export interface TaskDetailsService {
  readonly state: TaskDetailsState;
  open(taskId: string): Promise<void>;
  close(): void;
  refresh(): Promise<void>;
  loadMoreComments(): Promise<void>;
  loadReplies(commentId: string): Promise<TaskComment[]>;
  listMetadata(listId: string): Promise<ListMetadata | null>;
  getSpaceTags(spaceId: string): Promise<TaskTag[]>;
  loadLists(): Promise<void>;
  lists(): ListChoice[];
  cachedTasks(): Task[];
  peek(taskId: string): TaskDetail | null;
  refreshTask(taskId: string): Promise<void>;
  refreshComments(taskId: string, parentId?: string): Promise<void>;
  invalidate(taskId: string): void;
  notifySummaryChanges(): void;
  beginOptimistic(
    operation: string,
    taskId: string,
    patch: (detail: TaskDetail) => TaskDetail,
  ): void;
  endOptimistic(operation: string): void;
  flush(): Promise<void>;
  dispose(): void;
}
export interface TaskDetailsDeps {
  api: TaskDetailApi;
  store: TasksStore;
  workspaceId: string;
  userId: number;
  cache?: TaskDetailsCache;
  now?: () => number;
  isOnline?: () => boolean;
  onChange?: () => void;
}
export function createTaskDetailsService(deps: TaskDetailsDeps): TaskDetailsService {
  const { api, store } = deps;
  const now = deps.now ?? Date.now;
  const online = deps.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
  let disposed = false;
  let accessClock = 0;
  const accessedAt = () => {
    accessClock = Math.max(now(), accessClock + 1);
    return accessClock;
  };
  let snapshot: TaskDetailsSnapshot = { entries: {}, lists: [], metadata: {} };
  const [revision, bump] = createSignal(0);
  const [taskId, setTaskId] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal<Record<string, boolean>>({});
  const [errors, setErrors] = createSignal<Record<string, unknown>>({});
  const flights = new Map<string, Promise<unknown>>();
  const versions = new Map<string, number>();
  const threadVersions = new Map<string, number>();
  const observedVersions = new Map<string, number>();
  const overlays = new Map<string, { taskId: string; patch: (detail: TaskDetail) => TaskDetail }>();
  const tags = new Map<string, { items: TaskTag[]; fetchedAt: number }>();
  // Recursos podem chegar antes do detalhe principal, inclusive quando ele falha.
  const resources = new Map<string, Partial<CachedTaskDetail>>();
  let saves = Promise.resolve();
  // Abrir uma tarefa altera o cache várias vezes seguidas; a partição é gravada uma vez depois.
  const saver = createSaveScheduler(async () => {
    const copy = structuredClone(snapshot);
    saves = saves
      .then(async () => {
        await deps.cache?.save(deps.workspaceId, deps.userId, copy);
      })
      .catch(() => {});
    await saves;
  });
  const ready = (async () => {
    try {
      const saved = await deps.cache?.load(deps.workspaceId, deps.userId);
      if (saved && !disposed) {
        snapshot = saved;
        api.seedLists(saved.lists);
        bump((n) => n + 1);
      }
    } catch {
      /* O snapshot é opcional. */
    }
  })();
  function changed() {
    if (!disposed) bump((n) => n + 1);
  }
  function save() {
    if (disposed) return;
    snapshot.entries = limitDetails(snapshot.entries);
    for (const id of resources.keys())
      if (!snapshot.entries[id] && id !== taskId()) resources.delete(id);
    if (deps.cache) saver.schedule();
  }
  function entry(id: string) {
    revision();
    return snapshot.entries[id];
  }
  function resource(id: string) {
    revision();
    return { ...entry(id), ...resources.get(id) };
  }
  function publishResource(id: string, patch: Partial<CachedTaskDetail>) {
    resources.set(id, { ...resources.get(id), ...patch });
    const cached = snapshot.entries[id];
    if (cached) Object.assign(cached, patch);
    changed();
    save();
  }
  function currentResource() {
    const id = taskId();
    return id ? resource(id) : undefined;
  }
  function retain(id: string) {
    store.retainTask(id, now() + RETENTION_MS);
    const cached = snapshot.entries[id];
    if (cached) {
      cached.accessedAt = accessedAt();
      store.upsertTasks([cached.detail.task]);
    }
    deps.onChange?.();
    save();
  }
  function run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = flights.get(key);
    if (existing) return existing as Promise<T>;
    const result = work().finally(() => {
      if (flights.get(key) === result) flights.delete(key);
    });
    flights.set(key, result);
    return result;
  }
  async function guarded(id: string, name: string, work: () => Promise<unknown>) {
    if (disposed || !online()) return;
    if (taskId() === id) {
      setLoading((previous) => ({ ...previous, [name]: true }));
      setErrors((previous) => ({ ...previous, [name]: undefined }));
    }
    try {
      await work();
    } catch (error) {
      if (!disposed && taskId() === id) setErrors((previous) => ({ ...previous, [name]: error }));
    } finally {
      if (!disposed && taskId() === id) setLoading((previous) => ({ ...previous, [name]: false }));
    }
  }
  async function fetchTask(id: string, force = false) {
    await ready;
    if (disposed || !online()) return;
    const cached = entry(id);
    if (
      !force &&
      cached &&
      now() - cached.fetchedAt < DETAIL_TTL_MS &&
      cached.detail.task.dateUpdated >= (store.confirmedTask(id)?.dateUpdated ?? 0)
    )
      return;
    const version = versions.get(id) ?? 0;
    await run(`task:${id}:${version}`, async () => {
      const detail = await api.getTask(id);
      if (disposed || (versions.get(id) ?? 0) !== version) return;
      const latest = store.confirmedTask(id);
      if (latest && detail.task.dateUpdated < latest.dateUpdated) return;
      snapshot.entries[id] = {
        ...snapshot.entries[id],
        ...resources.get(id),
        detail,
        fetchedAt: now(),
        accessedAt: accessedAt(),
      };
      store.upsertTasks([detail.task]);
      // Filhas do detalhe ficam no detalhe; só a tarefa aberta entra nas raízes/recents.
      if (taskId() === id) retain(id);
      changed();
      save();
      deps.onChange?.();
    });
  }
  async function comments(id: string, force = false, more = false) {
    await ready;
    if (disposed || !online()) return;
    const existing = resource(id).comments;
    if (more && !existing?.nextCursor) return;
    if (!force && !more && existing && now() - existing.fetchedAt < COMMENTS_TTL_MS) return;
    const cursor = more ? (existing?.nextCursor ?? undefined) : undefined;
    const version = threadVersions.get(id) ?? 0;
    await run(`comments:${id}:${version}:${cursor?.start_id ?? ''}`, async () => {
      const page = await api.getComments(id, cursor);
      if (disposed || (threadVersions.get(id) ?? 0) !== version) return;
      const current = resource(id).comments;
      publishResource(id, {
        comments: {
          items: more ? mergeComments(current?.items ?? [], page.comments) : page.comments,
          nextCursor:
            cursor &&
            page.nextCursor?.start_id === cursor.start_id &&
            page.nextCursor.start === cursor.start
              ? null
              : page.nextCursor,
          fetchedAt: now(),
        },
      });
    });
  }
  async function timeInStatus(id: string, force = false) {
    await ready;
    if (disposed || !online()) return;
    const current = resource(id).timeInStatus;
    if (!force && current && now() - current.fetchedAt < DETAIL_TTL_MS) return;
    await run(`time:${id}`, async () => {
      const items = await api.getTimeInStatus(id);
      if (!disposed) publishResource(id, { timeInStatus: { items, fetchedAt: now() } });
    });
  }
  async function replies(id: string, commentId: string, force = false): Promise<TaskComment[]> {
    await ready;
    const cached = resource(id).replies?.[commentId];
    if (disposed || !online() || (!force && cached && now() - cached.fetchedAt < COMMENTS_TTL_MS))
      return cached?.items ?? [];
    const version = threadVersions.get(id) ?? 0;
    return run(`replies:${id}:${version}:${commentId}`, async () => {
      const items = await api.getReplies(commentId);
      if (!disposed && (threadVersions.get(id) ?? 0) === version)
        publishResource(id, {
          replies: { ...resource(id).replies, [commentId]: { items, fetchedAt: now() } },
        });
      return disposed ? [] : items;
    });
  }
  async function load(id: string, force = false) {
    await Promise.all([
      guarded(id, 'task', () => fetchTask(id, force)),
      guarded(id, 'comments', () => comments(id, force)),
      guarded(id, 'timeInStatus', () => timeInStatus(id, force)),
    ]);
  }
  function peek(id: string): TaskDetail | null {
    return entry(id)?.detail ?? null;
  }
  const service: TaskDetailsService = {
    state: {
      get taskId() {
        return taskId();
      },
      get detail() {
        const id = taskId();
        let detail = id ? peek(id) : null;
        if (!detail || !id) return null;
        for (const overlay of overlays.values())
          if (overlay.taskId === id) detail = overlay.patch(detail);
        return { ...detail, task: store.state.tasks[id] ?? detail.task };
      },
      get comments() {
        return currentResource()?.comments?.items ?? [];
      },
      get nextCursor() {
        return currentResource()?.comments?.nextCursor ?? null;
      },
      get replies() {
        return Object.fromEntries(
          Object.entries(currentResource()?.replies ?? {}).map(([id, value]) => [id, value.items]),
        );
      },
      get timeInStatus() {
        return currentResource()?.timeInStatus?.items ?? [];
      },
      get loading() {
        return loading();
      },
      get errors() {
        return errors();
      },
    },
    open(id) {
      return untrack(async () => {
        if (disposed) return;
        if (taskId() !== id) {
          setTaskId(id);
          setErrors({});
          setLoading({});
        }
        if (entry(id)) retain(id);
        await ready;
        if (disposed || taskId() !== id) return;
        retain(id);
        changed();
        await load(id);
      });
    },
    close() {
      setTaskId(null);
      setErrors({});
      setLoading({});
    },
    async refresh() {
      const id = taskId();
      if (id) await load(id, true);
    },
    async loadMoreComments() {
      const id = taskId();
      if (id) await guarded(id, 'comments', () => comments(id, false, true));
    },
    async loadReplies(commentId) {
      const id = taskId();
      if (!id) return [];
      let items: TaskComment[] = [];
      await guarded(id, `replies:${commentId}`, async () => {
        items = await replies(id, commentId);
      });
      return items;
    },
    async listMetadata(id) {
      await ready;
      const cached = snapshot.metadata[id];
      if (
        disposed ||
        !online() ||
        (cached && !cached.value.unavailable?.length && now() - cached.fetchedAt < METADATA_TTL_MS)
      )
        return cached?.value ?? null;
      return run(`list:${id}`, async () => {
        const value = await api.getList(id);
        if (!disposed) {
          snapshot.metadata[id] = { value, fetchedAt: now() };
          changed();
          save();
        }
        return disposed ? null : value;
      });
    },
    async getSpaceTags(id) {
      await ready;
      const cached = tags.get(id);
      if (disposed || !online() || (cached && now() - cached.fetchedAt < METADATA_TTL_MS))
        return cached?.items ?? [];
      return run(`tags:${id}`, async () => {
        const items = await api.getSpaceTags(id);
        if (!disposed) tags.set(id, { items, fetchedAt: now() });
        return disposed ? [] : items;
      });
    },
    async loadLists() {
      await ready;
      if (disposed || !online()) return;
      await run('lists', async () => {
        const publish = (lists: ListChoice[]) => {
          if (disposed) return;
          snapshot.lists = [
            ...new Map([...snapshot.lists, ...lists].map((list) => [list.id, list])).values(),
          ];
          changed();
          save();
        };
        publish(await api.getLists(publish));
      });
    },
    lists() {
      revision();
      return snapshot.lists;
    },
    cachedTasks() {
      revision();
      return [
        ...new Map(
          [
            ...Object.values(snapshot.entries).map((value) => value.detail.task),
            ...Object.values(store.state.tasks),
          ].map((task) => [task.id, task]),
        ).values(),
      ];
    },
    peek,
    async refreshTask(id) {
      await guarded(id, 'task', () => fetchTask(id, true));
    },
    async refreshComments(id, parentId) {
      threadVersions.set(id, (threadVersions.get(id) ?? 0) + 1);
      await guarded(id, 'comments', () => comments(id, true));
      if (parentId) await guarded(id, `replies:${parentId}`, () => replies(id, parentId, true));
    },
    invalidate(id) {
      versions.set(id, (versions.get(id) ?? 0) + 1);
      const cached = entry(id);
      if (cached) cached.fetchedAt = 0;
    },
    notifySummaryChanges() {
      const id = taskId();
      if (disposed || !online() || !id) return;
      const current = store.confirmedTask(id);
      if (
        !current ||
        current.dateUpdated <= (entry(id)?.detail.task.dateUpdated ?? 0) ||
        current.dateUpdated <= (observedVersions.get(id) ?? 0)
      )
        return;
      observedVersions.set(id, current.dateUpdated);
      service.invalidate(id);
      threadVersions.set(id, (threadVersions.get(id) ?? 0) + 1);
      void load(id, true);
    },
    beginOptimistic(operation, id, patch) {
      overlays.set(operation, { taskId: id, patch });
      changed();
    },
    endOptimistic(operation) {
      overlays.delete(operation);
      changed();
    },
    async flush() {
      await saver.flush();
      await saves;
    },
    dispose() {
      // O que já foi confirmado ainda vai para a partição desta conta; nada depois disso.
      void saver.flush();
      disposed = true;
      overlays.clear();
      flights.clear();
      setTaskId(null);
    },
  };
  return service;
}
