import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionCache, SnapshotStore } from '../persistence/snapshot';
import { createSnapshotStore } from '../persistence/snapshot';
import { platform } from '../platform';
import { createTasksStore } from '../store/tasks';
import type { TaskSync } from '../sync/tasks';
import { createServices } from './services';
import { createWorkspaceServices, type OpenWorkspace } from './workspace';

vi.mock('../persistence/snapshot', () => ({ createSnapshotStore: vi.fn() }));
vi.mock('../platform', () => ({
  platform: {
    secrets: { getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn() },
  },
}));
vi.mock('./workspace', () => ({ createWorkspaceServices: vi.fn() }));

const disposers: Array<() => void> = [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeSnapshots() {
  return {
    loadWorkspace: vi.fn<SnapshotStore['loadWorkspace']>(async () => null),
    saveWorkspace: vi.fn<SnapshotStore['saveWorkspace']>(async () => {}),
    loadSession: vi.fn<SnapshotStore['loadSession']>(async () => null),
    saveSession: vi.fn<SnapshotStore['saveSession']>(async () => {}),
    clearSession: vi.fn<SnapshotStore['clearSession']>(async () => {}),
    clearAll: vi.fn<SnapshotStore['clearAll']>(async () => {}),
  } satisfies SnapshotStore;
}

function fakeWorkspace(): OpenWorkspace {
  const sync: TaskSync = {
    status: () => 'idle',
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    refresh: vi.fn(async () => {}),
    pollOnce: vi.fn(async () => {}),
    requestRowDetails: vi.fn(),
  };
  return {
    workspaceId: '42',
    userId: 1,
    store: createTasksStore(),
    sync,
    dateContext: () => ({ now: 0, timeZone: 'America/Sao_Paulo', weekStartDay: 0 }),
    flush: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
}

function mountServices() {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return { services: createServices(), dispose };
  });
}

function workspaceRequester(index = 0) {
  const requester = vi.mocked(createWorkspaceServices).mock.calls[index]?.[0].requester;
  if (!requester?.request) throw new Error('O workspace não recebeu suporte a escritas');
  return { ...requester, request: requester.request };
}

function user(id: number) {
  return { id, username: `Pessoa ${id}`, initials: `P${id}`, weekStartDay: 0 };
}

function accountResponse(input: RequestInfo | URL, init?: RequestInit): Response {
  const path = new URL(String(input)).pathname;
  const token = new Headers(init?.headers).get('Authorization');
  if (path.endsWith('/user')) {
    return Response.json({ user: user(token === 'pk_2_DEF456' ? 2 : 1) });
  }
  if (path.endsWith('/team')) {
    return Response.json({
      teams: [
        { id: '42', name: 'Equipe Teste' },
        { id: '43', name: 'Outra Equipe Teste' },
      ],
    });
  }
  throw new Error(`Requisição inesperada no teste: ${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(platform.secrets.getToken).mockResolvedValue('pk_1_ABC123');
  vi.mocked(platform.secrets.setToken).mockResolvedValue({ persisted: true });
  vi.mocked(platform.secrets.clearToken).mockResolvedValue();
  vi.mocked(createSnapshotStore).mockReturnValue(fakeSnapshots());
  vi.mocked(createWorkspaceServices).mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => accountResponse(input, init)),
  );
  localStorage.clear();
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.unstubAllGlobals();
});

describe('createServices', () => {
  it('descarta um workspace que termina de abrir depois da desmontagem', async () => {
    const pending = deferred<OpenWorkspace>();
    const opened = fakeWorkspace();
    vi.mocked(createWorkspaceServices).mockReturnValueOnce(pending.promise);
    const { services, dispose } = mountServices();
    await services.session.boot();
    expect(createWorkspaceServices).toHaveBeenCalledOnce();

    dispose();
    pending.resolve(opened);
    await flush();

    expect(opened.dispose).toHaveBeenCalledOnce();
    expect(services.workspace?.()).toBeNull();
  });

  it('um 401 da conta anterior não desconecta a nova conta pelo agendador', async () => {
    const oldReply = deferred<Response>();
    const snapshots = fakeSnapshots();
    const cache: SessionCache = {
      userId: 1,
      user: {
        id: 1,
        username: 'Pessoa 1 salva',
        initials: 'P1',
        color: 'rgb(0, 145, 255)',
        profilePicture: null,
        timezone: 'America/Sao_Paulo',
        weekStartDay: 0,
      },
      workspaces: [{ id: '42', name: 'Equipe Teste', color: 'rgb(0, 145, 255)', avatar: null }],
      savedAt: 1,
    };
    snapshots.loadSession.mockResolvedValue(cache);
    vi.mocked(createSnapshotStore).mockReturnValue(snapshots);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const token = new Headers(init?.headers).get('Authorization');
        if (String(input).endsWith('/user') && token === 'pk_1_ABC123') return oldReply.promise;
        return accountResponse(input, init);
      }),
    );
    const { services } = mountServices();
    await services.session.boot();
    await flush();
    expect(services.session.state.user?.id).toBe(1);

    await services.session.signOut();
    await expect(services.session.submitToken('pk_2_DEF456')).resolves.toBe('ok');
    oldReply.resolve(new Response('{}', { status: 401 }));
    await flush();

    expect(services.session.state.status).toBe('ready');
    expect(services.session.state.user?.id).toBe(2);
    expect(platform.secrets.clearToken).toHaveBeenCalledTimes(1);
    expect(snapshots.clearSession).toHaveBeenCalledTimes(1);
  });

  it.each(['GET', 'POST'] as const)(
    'cancela %s antigo na fila antes de usar o token novo',
    async (method) => {
      const oldBatch = deferred<void>();
      const lateUnauthorized = deferred<void>();
      const tokensSentToOldWorkspace: Array<string | null> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (!String(input).endsWith('/old-workspace/task')) return accountResponse(input, init);
          const token = new Headers(init?.headers).get('Authorization');
          tokensSentToOldWorkspace.push(token);
          if (token === 'pk_1_ABC123') {
            await oldBatch.promise;
            return Response.json({});
          }
          await lateUnauthorized.promise;
          return new Response('{}', { status: 401 });
        }),
      );
      const { services } = mountServices();
      await services.session.boot();
      const requester = workspaceRequester();
      const reads = Array.from({ length: 5 }, () =>
        (method === 'GET'
          ? requester.get('/old-workspace/task')
          : requester.request(method, '/old-workspace/task', { body: { name: 'Teste' } })
        ).catch((error: unknown) => error),
      );
      await flush();
      expect(tokensSentToOldWorkspace).toHaveLength(4);

      await services.session.signOut();
      const signingIn = services.session.submitToken('pk_2_DEF456');
      oldBatch.resolve();
      await expect(signingIn).resolves.toBe('ok');
      lateUnauthorized.resolve();
      await Promise.all(reads);
      await flush();

      expect(tokensSentToOldWorkspace).not.toContain('pk_2_DEF456');
      expect(services.session.state.status).toBe('ready');
      expect(services.session.state.user?.id).toBe(2);
      expect(platform.secrets.clearToken).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['GET', 'POST'] as const)(
    'trocar workspace remove %s anterior da fila',
    async (method) => {
      const oldBatch = deferred<void>();
      let oldCalls = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input).endsWith('/old-workspace/task')) {
            oldCalls += 1;
            await oldBatch.promise;
            return Response.json({});
          }
          if (String(input).endsWith('/new-workspace/task'))
            return Response.json({ current: true });
          return accountResponse(input, init);
        }),
      );
      const { services } = mountServices();
      await services.session.boot();
      const previous = workspaceRequester();
      const reads = Array.from({ length: 5 }, () =>
        (method === 'GET'
          ? previous.get('/old-workspace/task')
          : previous.request(method, '/old-workspace/task', { body: { name: 'Teste' } })
        ).catch((error: unknown) => error),
      );
      await flush();
      expect(oldCalls).toBe(4);

      services.session.selectWorkspace('43');
      const current = vi.mocked(createWorkspaceServices).mock.calls[1]?.[0].requester;
      if (!current) throw new Error('O segundo workspace não recebeu o agendador');
      const next = current.get('/new-workspace/task');
      oldBatch.resolve();
      await Promise.all(reads);
      await expect(next).resolves.toEqual({ current: true });

      expect(oldCalls).toBe(4);
      expect(services.session.state.status).toBe('ready');
      expect(services.session.state.workspaceId).toBe('43');
      expect(platform.secrets.clearToken).not.toHaveBeenCalled();
    },
  );

  it('POST encaminha corpo e sinal do chamador até o fetch', async () => {
    let sent: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith('/task/1/comment')) return accountResponse(input, init);
        sent = init;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
        });
      }),
    );
    const { services } = mountServices();
    await services.session.boot();
    const requester = workspaceRequester();
    const controller = new AbortController();
    const result = requester.request('POST', '/task/1/comment', {
      body: { comment_text: 'Olá' },
      signal: controller.signal,
      priority: 'interactive',
    });
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(sent?.method).toBe('POST');
    expect(sent?.body).toBe('{"comment_text":"Olá"}');
    controller.abort();
    await assertion;
    expect(sent?.signal?.aborted).toBe(true);
  });

  it('401 de recurso privado em POST preserva a sessão quando solicitado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith('/task/1/comment')) return accountResponse(input, init);
        return new Response('{}', { status: 401 });
      }),
    );
    const { services } = mountServices();
    await services.session.boot();
    await expect(
      workspaceRequester().request('POST', '/task/1/comment', {
        invalidateSessionOnUnauthorized: false,
      }),
    ).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    await flush();
    expect(services.session.state.status).toBe('ready');
    expect(services.session.state.user?.id).toBe(1);
    expect(platform.secrets.clearToken).not.toHaveBeenCalled();
  });

  it('401 tardio de POST antigo não desconecta a conta nova', async () => {
    const oldReply = deferred<Response>();
    let sent: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith('/task/1/comment')) return accountResponse(input, init);
        sent = init;
        return oldReply.promise;
      }),
    );
    const { services } = mountServices();
    await services.session.boot();
    const requester = workspaceRequester();
    const result = requester.request('POST', '/task/1/comment', { body: { text: 'Olá' } });
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    await services.session.signOut();
    expect(sent?.signal?.aborted).toBe(true);
    await services.session.submitToken('pk_2_DEF456');
    oldReply.resolve(new Response('{}', { status: 401 }));
    await assertion;
    expect(services.session.state.user?.id).toBe(2);
    expect(services.session.state.status).toBe('ready');
    expect(platform.secrets.clearToken).toHaveBeenCalledTimes(1);
  });

  it('descarta sucesso tardio de POST após trocar workspace', async () => {
    const oldReply = deferred<Response>();
    let sent: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith('/task/1/comment')) return accountResponse(input, init);
        sent = init;
        return oldReply.promise;
      }),
    );
    const { services } = mountServices();
    await services.session.boot();
    const requester = workspaceRequester();
    const assertion = expect(requester.request('POST', '/task/1/comment')).rejects.toMatchObject({
      name: 'AbortError',
    });
    await flush();
    services.session.selectWorkspace('43');
    expect(sent?.signal?.aborted).toBe(true);
    oldReply.resolve(Response.json({ id: 'late' }));
    await assertion;
    expect(services.session.state.workspaceId).toBe('43');
  });
});
