import { array, type ListChoice, object, text } from '../domain/task-detail';
import type { Requester, ScheduledRequestOptions } from './scheduler';

export interface ListCatalog {
  getLists(onPage?: (lists: ListChoice[]) => void): Promise<ListChoice[]>;
  seed(lists: ListChoice[]): void;
}
/** Cache pertence à instância do workspace. Cada callback recebe somente o lote recém-chegado. */
export function createListCatalog(requester: Requester, workspaceId: string): ListCatalog {
  const cached = new Map<string, ListChoice>();
  const listeners = new Set<(lists: ListChoice[]) => void>();
  let pending: Promise<void> | null = null;
  let complete = false;
  const options: ScheduledRequestOptions = {
    priority: 'interactive',
    invalidateSessionOnUnauthorized: false,
  };
  const read = (path: string, archived = true) =>
    requester.get<unknown>(path, archived ? { ...options, query: { archived: false } } : options);
  const publish = (lists: ListChoice[]) => {
    const fresh: ListChoice[] = [];
    for (const list of lists) {
      if (!list.id) continue;
      const previous = cached.get(list.id);
      const merged = previous
        ? {
            ...list,
            name: list.name || previous.name,
            spaceId: list.spaceId || previous.spaceId,
            spaceName: list.spaceName || previous.spaceName,
            folderId: list.folderId ?? previous.folderId,
            folderName: list.folderName ?? previous.folderName,
          }
        : list;
      if (
        !previous ||
        Object.keys(merged).some(
          (key) => merged[key as keyof ListChoice] !== previous[key as keyof ListChoice],
        )
      ) {
        cached.set(list.id, merged);
        fresh.push(merged);
      }
    }
    if (fresh.length) for (const listener of listeners) listener(fresh);
  };
  const choices = (
    items: unknown,
    space: Record<string, unknown> = {},
    folder: Record<string, unknown> = {},
  ): ListChoice[] =>
    array(items)
      .map(object)
      .filter((item) => item.archived !== true)
      .map((item) => {
        const itemSpace = Object.keys(object(item.space)).length ? object(item.space) : space;
        const itemFolder = Object.keys(object(item.folder)).length ? object(item.folder) : folder;
        return {
          id: text(item.id),
          name: text(item.name),
          spaceId: text(itemSpace.id),
          spaceName: text(itemSpace.name),
          folderId: text(itemFolder.id) || null,
          folderName: text(itemFolder.name) || null,
        };
      });
  async function load(): Promise<void> {
    let failed = false;
    const seenFolders = new Set<string>();
    async function guarded(work: () => Promise<void>) {
      try {
        await work();
      } catch {
        failed = true;
      }
    }
    async function folderLists(folder: Record<string, unknown>, space: Record<string, unknown>) {
      const id = text(folder.id);
      if (!id || folder.archived === true || seenFolders.has(id)) return;
      seenFolders.add(id);
      publish(choices(folder.lists, space, folder));
      await guarded(async () =>
        publish(
          choices(
            object(await read(`/folder/${encodeURIComponent(id)}/list`)).lists,
            space,
            folder,
          ),
        ),
      );
    }
    await Promise.all([
      guarded(async () => {
        const spaces = array(
          object(await read(`/team/${encodeURIComponent(workspaceId)}/space`)).spaces,
        )
          .map(object)
          .filter((space) => space.archived !== true);
        await Promise.all(
          spaces.map(async (space) => {
            const id = text(space.id);
            if (!id) return;
            await Promise.all([
              guarded(async () =>
                publish(
                  choices(object(await read(`/space/${encodeURIComponent(id)}/list`)).lists, space),
                ),
              ),
              guarded(async () => {
                const folders = array(
                  object(await read(`/space/${encodeURIComponent(id)}/folder`)).folders,
                ).map(object);
                await Promise.all(folders.map((folder) => folderLists(folder, space)));
              }),
            ]);
          }),
        );
      }),
      guarded(async () => {
        const shared = object(
          object(await read(`/team/${encodeURIComponent(workspaceId)}/shared`, false)).shared,
        );
        publish(choices(shared.lists));
        await Promise.all(
          array(shared.folders).map((folder) =>
            folderLists(object(folder), object(object(folder).space)),
          ),
        );
      }),
    ]);
    complete = !failed;
  }
  return {
    seed: publish,
    async getLists(onPage) {
      if (onPage) {
        if (cached.size) onPage([...cached.values()]);
        listeners.add(onPage);
      }
      try {
        if (!complete && !pending)
          pending = load().finally(() => {
            pending = null;
          });
        await pending;
        return [...cached.values()];
      } finally {
        if (onPage) listeners.delete(onPage);
      }
    },
  };
}
