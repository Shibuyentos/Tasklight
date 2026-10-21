import { vi } from 'vitest';
import type { TaskDetailApi } from '../api/task-detail';
import { normalizeDetail, type TaskDetail } from '../domain/task-detail';
import { task } from './fixtures';

export function detail(id = 'a', name = id, dateUpdated = 10): TaskDetail {
  return {
    ...normalizeDetail({ id }),
    task: task({ id, name, dateUpdated, listId: 'list', spaceId: 'space' }),
    markdownDescription: 'original markdown',
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function detailApi() {
  return {
    getTask: vi.fn(async (id: string) => detail(id)),
    getList: vi.fn<TaskDetailApi['getList']>(async (id: string) => ({
      id,
      name: id,
      statuses: [],
      customFields: [],
      members: [],
      breadcrumb: { space: null, folder: null, list: null },
      permissionLevel: null,
    })),
    getSpaceTags: vi.fn(async () => []),
    getComments: vi.fn<TaskDetailApi['getComments']>(async () => ({
      comments: [],
      nextCursor: null,
    })),
    getReplies: vi.fn<TaskDetailApi['getReplies']>(async () => []),
    getTimeInStatus: vi.fn(async () => []),
    getLists: vi.fn<TaskDetailApi['getLists']>(async () => []),
    seedLists: vi.fn(),
    updateTask: vi.fn<TaskDetailApi['updateTask']>(async (id) => detail(id)),
    setField: vi.fn(async () => {}),
    removeField: vi.fn(async () => {}),
    addTag: vi.fn(async () => {}),
    removeTag: vi.fn(async () => {}),
    setChecklistItem: vi.fn(async () => {}),
    addComment: vi.fn(async () => ({ id: 'new-comment', histId: null, date: 20 })),
    addReply: vi.fn(async () => {}),
    createTask: vi.fn<TaskDetailApi['createTask']>(async () => detail('created')),
  } satisfies TaskDetailApi;
}
