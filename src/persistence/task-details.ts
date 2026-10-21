import { type IDBPDatabase, wrap } from 'idb';
import type { CommentCursor, TaskComment } from '../domain/rich-comment';
import type { ListChoice, ListMetadata, StatusDuration, TaskDetail } from '../domain/task-detail';

export interface CachedTaskDetail {
  detail: TaskDetail;
  fetchedAt: number;
  accessedAt: number;
  comments?: { items: TaskComment[]; nextCursor: CommentCursor | null; fetchedAt: number };
  replies?: Record<string, { items: TaskComment[]; fetchedAt: number }>;
  timeInStatus?: { items: StatusDuration[]; fetchedAt: number };
}
export interface TaskDetailsSnapshot {
  entries: Record<string, CachedTaskDetail>;
  lists: ListChoice[];
  metadata: Record<string, { value: ListMetadata; fetchedAt: number }>;
}
export interface TaskDetailsCache {
  load(workspaceId: string, userId: number): Promise<TaskDetailsSnapshot | null>;
  save(workspaceId: string, userId: number, snapshot: TaskDetailsSnapshot): Promise<void>;
}
export function limitDetails(
  entries: Record<string, CachedTaskDetail>,
): Record<string, CachedTaskDetail> {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([, a], [, b]) => b.accessedAt - a.accessedAt)
      .slice(0, 50),
  );
}
export function createTaskDetailsCache(
  options: { indexedDB?: IDBFactory | null } = {},
): TaskDetailsCache {
  let database: Promise<IDBPDatabase | null> | undefined;
  function db() {
    database ??= (async () => {
      try {
        const factory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
        if (!factory) return null;
        const request = factory.open('tasklight-details', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('partitions');
        return (await wrap(request)) ?? null;
      } catch {
        return null;
      }
    })();
    return database;
  }
  return {
    async load(workspaceId, userId) {
      try {
        const record = await (await db())?.get('partitions', JSON.stringify([workspaceId, userId]));
        if (
          record?.schema !== 1 ||
          !record.snapshot?.entries ||
          !Array.isArray(record.snapshot.lists) ||
          !record.snapshot.metadata
        )
          return null;
        return { ...record.snapshot, entries: limitDetails(record.snapshot.entries) };
      } catch {
        return null;
      }
    },
    async save(workspaceId, userId, snapshot) {
      try {
        await (await db())?.put(
          'partitions',
          { schema: 1, snapshot: { ...snapshot, entries: limitDetails(snapshot.entries) } },
          JSON.stringify([workspaceId, userId]),
        );
      } catch {
        /* Cache indisponível não impede o uso da aplicação. */
      }
    },
  };
}
