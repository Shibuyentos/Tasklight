import { describe, expect, it } from 'vitest';
import type { ListChoice } from '../domain/task-detail';
import { createListCatalog } from './lists';
import type { Requester, ScheduledRequestOptions } from './scheduler';

describe('catálogo de listas', () => {
  it('seed enriquece ID existente e publica alteração aos listeners durante a carga', async () => {
    let release: ((value: unknown) => void) | undefined;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const requester: Requester = { get: async <T>() => (await blocked) as T };
    const catalog = createListCatalog(requester, 'w');
    const initial: ListChoice = {
      id: 'l',
      name: '',
      spaceId: '',
      spaceName: '',
      folderId: null,
      folderName: null,
    };
    const enriched: ListChoice = {
      id: 'l',
      name: 'Lista',
      spaceId: 's',
      spaceName: 'Space',
      folderId: 'f',
      folderName: 'Folder',
    };
    catalog.seed([initial]);
    const pages: ListChoice[][] = [];
    const pending = catalog.getLists((page) => pages.push(page));
    catalog.seed([enriched]);
    expect(pages).toEqual([[initial], [enriched]]);
    release?.({});
    expect(await pending).toEqual([enriched]);
    catalog.seed([{ ...enriched, name: 'Renomeada' }]);
    expect(await catalog.getLists()).toEqual([{ ...enriched, name: 'Renomeada' }]);
  });
  it('completa nomes e breadcrumb de listas conhecidas por resumo em cache', async () => {
    const requester: Requester = {
      get: async <T>(path: string) => {
        if (path.endsWith('/space')) return { spaces: [{ id: 's', name: 'Space' }] } as T;
        if (path.endsWith('/list')) return { lists: [{ id: 'l', name: 'Nome completo' }] } as T;
        return {} as T;
      },
    };
    const catalog = createListCatalog(requester, 'w');
    catalog.seed([
      { id: 'l', name: '', spaceId: 's', spaceName: '', folderId: null, folderName: null },
    ]);
    const batches: ListChoice[][] = [];
    const all = await catalog.getLists((page) => batches.push(page));
    expect(all).toEqual([
      {
        id: 'l',
        name: 'Nome completo',
        spaceId: 's',
        spaceName: 'Space',
        folderId: null,
        folderName: null,
      },
    ]);
    expect(batches.at(-1)?.[0]?.name).toBe('Nome completo');
  });
  it('entrega lotes antes do fim, inclui listas compartilhadas/cache e deduplica', async () => {
    let release: ((value: unknown) => void) | undefined;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const requester: Requester = {
      get: async <T>(path: string, options?: ScheduledRequestOptions) => {
        calls.push(path);
        expect(options?.priority).toBe('interactive');
        expect(options?.invalidateSessionOnUnauthorized).toBe(false);
        if (path === '/team/w/space') return { spaces: [{ id: 's', name: 'Space' }] } as T;
        if (path === '/team/w/shared')
          return { shared: { lists: [{ id: 'shared', name: 'Compartilhada' }] } } as T;
        expect(options?.query).toEqual({ archived: false });
        if (path === '/space/s/list') return { lists: [{ id: 'l', name: 'Solta' }] } as T;
        if (path === '/space/s/folder') return { folders: [{ id: 'f', name: 'Folder' }] } as T;
        return (await blocked) as T;
      },
    };
    const catalog = createListCatalog(requester, 'w');
    catalog.seed([
      {
        id: 'cached',
        name: 'Cache',
        spaceId: 's',
        spaceName: 'Space',
        folderId: null,
        folderName: null,
      },
    ]);
    const batches: ListChoice[][] = [];
    const pending = catalog.getLists((batch) => batches.push(batch));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(batches.flat().map((list) => list.id)).toEqual(
      expect.arrayContaining(['cached', 'l', 'shared']),
    );
    release?.({
      lists: [
        { id: 'l', name: 'Duplicada' },
        { id: 'nested', name: 'Dentro' },
      ],
    });
    const all = await pending;
    expect(all.map((list) => list.id)).toEqual(
      expect.arrayContaining(['cached', 'l', 'shared', 'nested']),
    );
    expect(all.filter((list) => list.id === 'l')).toHaveLength(1);
    const count = calls.length;
    expect(await catalog.getLists()).toEqual(all);
    expect(calls).toHaveLength(count);
  });
  it('preserva listas recebidas quando um ramo não é acessível e tenta novamente', async () => {
    let attempts = 0;
    const requester: Requester = {
      get: async <T>(path: string) => {
        if (path.endsWith('/space')) return { spaces: [{ id: 's' }] } as T;
        if (path.endsWith('/shared')) return {} as T;
        if (path.endsWith('/folder')) {
          attempts++;
          if (attempts === 1) throw new Error('Forbidden');
          return { folders: [] } as T;
        }
        return { lists: [{ id: 'l' }] } as T;
      },
    };
    const catalog = createListCatalog(requester, 'w');
    expect((await catalog.getLists()).map((list) => list.id)).toEqual(['l']);
    await catalog.getLists();
    expect(attempts).toBe(2);
  });
});
