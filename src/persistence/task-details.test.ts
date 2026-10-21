import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { normalizeDetail } from '../domain/task-detail';
import { createTaskDetailsCache, type TaskDetailsSnapshot } from './task-details';

const entry = (id: string, accessedAt = 1) => ({
  detail: normalizeDetail({ id, name: id }),
  fetchedAt: 1,
  accessedAt,
});
const data = (): TaskDetailsSnapshot => ({ entries: { a: entry('a') }, lists: [], metadata: {} });

describe('detail persistence', () => {
  it('partitions the same workspace by account and keeps separate workspaces', async () => {
    const cache = createTaskDetailsCache({ indexedDB: new IDBFactory() });
    await cache.save('w', 1, data());
    expect((await cache.load('w', 1))?.entries.a?.detail.task.id).toBe('a');
    expect(await cache.load('w', 2)).toBeNull();
    expect(await cache.load('x', 1)).toBeNull();
  });
  it('evicts least recently accessed details above fifty, not the recently opened one', async () => {
    const cache = createTaskDetailsCache({ indexedDB: new IDBFactory() });
    const snapshot = data();
    snapshot.entries = Object.fromEntries(
      Array.from({ length: 51 }, (_, i) => [String(i), entry(String(i), i)]),
    );
    snapshot.entries['0'] = entry('0', 100);
    await cache.save('w', 1, snapshot);
    const result = await cache.load('w', 1);
    expect(Object.keys(result?.entries ?? {})).toHaveLength(50);
    expect(result?.entries['1']).toBeUndefined();
    expect(result?.entries['0']).toBeDefined();
  });
  it('storage failure is optional and never breaks reads/writes', async () => {
    const cache = createTaskDetailsCache({ indexedDB: null });
    await expect(cache.save('w', 1, data())).resolves.toBeUndefined();
    await expect(cache.load('w', 1)).resolves.toBeNull();
  });
});
