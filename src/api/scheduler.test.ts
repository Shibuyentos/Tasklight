import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { createHttpClient, type HttpClient } from './http';
import { createScheduler, type SchedulerOptions } from './scheduler';

type Responder = (path: string) => Promise<unknown>;

function fakeHttp(responder: Responder = async (path) => ({ path })) {
  const calls: string[] = [];
  const http: HttpClient = {
    get: async <T>(path: string) => {
      calls.push(path);
      return (await responder(path)) as T;
    },
  };
  return { http, calls };
}

// Limites pequenos deixam os cenários legíveis: 10/min, 2 reservadas, 3 de fundo.
function scheduler(http: HttpClient, extra: Partial<SchedulerOptions> = {}) {
  return createScheduler({
    http,
    limitPerMinute: 10,
    reservedForInteractive: 2,
    backgroundPerMinute: 3,
    maxConcurrent: 10,
    ...extra,
  });
}

async function fill(target: ReturnType<typeof scheduler>, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, i) => target.get(`/fill/${i}`, { priority: 'visible' })),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createScheduler', () => {
  it('com a janela cheia para as demais, a interativa ainda passa', async () => {
    const { http, calls } = fakeHttp();
    const target = scheduler(http);
    await fill(target, 8);

    const background = target.get('/fundo', { priority: 'background' });
    await expect(target.get('/clique', { priority: 'interactive' })).resolves.toEqual({
      path: '/clique',
    });
    expect(calls).not.toContain('/fundo');

    await vi.advanceTimersByTimeAsync(60_001);
    await expect(background).resolves.toEqual({ path: '/fundo' });
  });

  it('o segundo plano tem um teto próprio por minuto', async () => {
    const { http, calls } = fakeHttp();
    const target = scheduler(http);
    await Promise.all([0, 1, 2].map((i) => target.get(`/fundo/${i}`, { priority: 'background' })));

    const fourth = target.get('/fundo/3', { priority: 'background' });
    await expect(target.get('/visivel', { priority: 'visible' })).resolves.toBeDefined();
    expect(calls).not.toContain('/fundo/3');

    await vi.advanceTimersByTimeAsync(60_001);
    await expect(fourth).resolves.toBeDefined();
  });

  it('na fila, a prioridade mais alta passa à frente', async () => {
    const { http, calls } = fakeHttp();
    const target = scheduler(http);
    await fill(target, 8);
    await Promise.all([0, 1].map((i) => target.get(`/clique/${i}`, { priority: 'interactive' })));

    const background = target.get('/a-fundo', { priority: 'background' });
    const interactive = target.get('/b-clique', { priority: 'interactive' });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).not.toContain('/b-clique');

    await vi.advanceTimersByTimeAsync(60_001);
    await Promise.all([background, interactive]);
    expect(calls.indexOf('/b-clique')).toBeLessThan(calls.indexOf('/a-fundo'));
  });

  it('por padrão, 90 por minuto para as visíveis, 60 para as de fundo e 100 no total', async () => {
    const { http, calls } = fakeHttp();
    const target = createScheduler({ http });
    await Promise.all(
      Array.from({ length: 60 }, (_, i) => target.get(`/fundo/${i}`, { priority: 'background' })),
    );
    const extraBackground = target.get('/fundo/extra', { priority: 'background' });
    await Promise.all(Array.from({ length: 30 }, (_, i) => target.get(`/visivel/${i}`)));
    const extraVisible = target.get('/visivel/extra');

    await expect(target.get('/clique', { priority: 'interactive' })).resolves.toBeDefined();
    expect(calls).not.toContain('/fundo/extra');
    expect(calls).not.toContain('/visivel/extra');

    await vi.advanceTimersByTimeAsync(60_001);
    await Promise.all([extraBackground, extraVisible]);
  });

  it('limita as requisições simultâneas', async () => {
    const release: Array<() => void> = [];
    const { http, calls } = fakeHttp(
      (path) => new Promise((resolve) => release.push(() => resolve({ path }))),
    );
    const target = scheduler(http, { maxConcurrent: 2 });

    const results = ['/1', '/2', '/3'].map((path) => target.get(path));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['/1', '/2']);

    release[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['/1', '/2', '/3']);

    release[1]?.();
    release[2]?.();
    await Promise.all(results);
  });

  it('429 pausa tudo pelo tempo pedido e depois tenta de novo', async () => {
    let first = true;
    const { http, calls } = fakeHttp(async (path) => {
      if (path === '/limitada' && first) {
        first = false;
        throw new ApiError('rate_limited', 'limite', { status: 429, retryAfterMs: 5000 });
      }
      return { path };
    });
    const target = scheduler(http);

    const limited = target.get('/limitada');
    await vi.advanceTimersByTimeAsync(0);
    expect(target.pausedUntil()).toBe(1_005_000);
    const other = target.get('/outra');
    await vi.advanceTimersByTimeAsync(4999);
    expect(calls).toEqual(['/limitada']);

    await vi.advanceTimersByTimeAsync(1);
    await expect(limited).resolves.toEqual({ path: '/limitada' });
    await expect(other).resolves.toEqual({ path: '/outra' });
    expect(target.pausedUntil()).toBeNull();
  });

  it('429 sem espera conhecida pausa um minuto', async () => {
    const { http } = fakeHttp(async () => {
      throw new ApiError('rate_limited', 'limite', { status: 429 });
    });
    const target = scheduler(http);

    const result = target.get('/limitada');
    result.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(target.pausedUntil()).toBe(1_060_000);
  });

  it('429 com espera zero ainda pausa 1 s', async () => {
    const { http } = fakeHttp(async () => {
      throw new ApiError('rate_limited', 'limite', { status: 429, retryAfterMs: 0 });
    });
    const target = scheduler(http);

    const result = target.get('/limitada');
    result.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(target.pausedUntil()).toBe(1_001_000);
  });

  it('429 com espera maior que a janela do ClickUp pausa no máximo um minuto', async () => {
    const { http } = fakeHttp(async () => {
      throw new ApiError('rate_limited', 'limite', { status: 429, retryAfterMs: 300_000 });
    });
    const target = scheduler(http);

    const result = target.get('/limitada');
    result.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(target.pausedUntil()).toBe(1_060_000);
  });

  it('429 repetido desiste depois de 5 novas tentativas', async () => {
    const { http, calls } = fakeHttp(async () => {
      throw new ApiError('rate_limited', 'limite', { status: 429, retryAfterMs: 1000 });
    });
    const target = scheduler(http);

    const result = target.get('/limitada');
    const assertion = expect(result).rejects.toMatchObject({ kind: 'rate_limited' });
    await vi.advanceTimersByTimeAsync(5000);

    await assertion;
    expect(calls).toHaveLength(6);
  });

  it('erro de servidor tenta de novo após 1 s e 2 s', async () => {
    let attempts = 0;
    const { http } = fakeHttp(async (path) => {
      attempts += 1;
      if (attempts < 3) throw new ApiError('server', 'indisponível', { status: 503 });
      return { path };
    });
    const target = scheduler(http);

    const result = target.get('/instavel');
    await vi.advanceTimersByTimeAsync(999);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ path: '/instavel' });
    expect(attempts).toBe(3);
  });

  it('desiste depois de três falhas de rede', async () => {
    const { http, calls } = fakeHttp(async () => {
      throw new ApiError('network', 'sem rede');
    });
    const target = scheduler(http);

    const result = target.get('/offline');
    const assertion = expect(result).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(3000);

    await assertion;
    expect(calls).toHaveLength(3);
  });

  it('token recusado avisa a sessão e não tenta de novo', async () => {
    const onUnauthorized = vi.fn();
    const { http, calls } = fakeHttp(async () => {
      throw new ApiError('unauthorized', 'recusado', { status: 401 });
    });
    const target = scheduler(http, { onUnauthorized });

    await expect(target.get('/user')).rejects.toMatchObject({ kind: 'unauthorized' });

    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(calls).toHaveLength(1);
  });

  it('pedido cancelado enquanto espera na fila nunca chega à API', async () => {
    const { http, calls } = fakeHttp();
    const target = scheduler(http);
    await fill(target, 8);
    const controller = new AbortController();

    const pending = target.get('/cancelada', { priority: 'background', signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(60_001);
    expect(calls).not.toContain('/cancelada');
  });

  it('a dica dos headers segura as não interativas até o reset', async () => {
    const { http, calls } = fakeHttp();
    const target = scheduler(http);
    target.noteRateLimit({ remaining: 2, resetAt: Date.now() + 10_000 });

    const visible = target.get('/visivel');
    await expect(target.get('/clique', { priority: 'interactive' })).resolves.toBeDefined();
    expect(calls).not.toContain('/visivel');

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(visible).resolves.toBeDefined();
  });

  it('uma dica com reset distante segura no máximo um minuto', async () => {
    const { http } = fakeHttp();
    const target = scheduler(http);
    target.noteRateLimit({ remaining: 0, resetAt: Date.now() + 600_000 });

    const visible = target.get('/visivel');
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(visible).resolves.toBeDefined();
  });

  it('uma dica nova com folga libera a fila na hora', async () => {
    const { http } = fakeHttp();
    const target = scheduler(http);
    target.noteRateLimit({ remaining: 0, resetAt: Date.now() + 30_000 });
    const visible = target.get('/visivel');

    target.noteRateLimit({ remaining: 95, resetAt: Date.now() + 60_000 });

    await expect(visible).resolves.toBeDefined();
  });
});

describe('escritas agendadas', () => {
  it('401 por recurso com invalidateSessionOnUnauthorized false não invalida a sessão', async () => {
    const onUnauthorized = vi.fn();
    const request = vi
      .fn()
      .mockRejectedValue(new ApiError('unauthorized', 'recurso privado', { status: 401 }));
    const target = scheduler({ get: vi.fn(), request }, { onUnauthorized });
    await expect(
      target.request('POST', '/task/1/comment', {
        invalidateSessionOnUnauthorized: false,
      }),
    ).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(['POST', 'DELETE'] as const)(
    '%s não repete rede, timeout ou 5xx ambíguos',
    async (method) => {
      for (const kind of ['network', 'timeout', 'server'] as const) {
        const request = vi.fn(async () => {
          throw new ApiError(kind, 'falha');
        });
        const target = scheduler({ get: vi.fn(), request });
        const assertion = expect(
          target.request(method, '/task/1', { body: { name: 'Tarefa' } }),
        ).rejects.toMatchObject({ kind });
        await vi.advanceTimersByTimeAsync(60_000);
        await assertion;
        expect(request).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each(['GET', 'PUT'] as const)('%s mantém retry e preserva método/corpo', async (method) => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('server', 'falha'))
      .mockResolvedValue({ ok: true });
    const target = scheduler({ get: vi.fn(), request });
    const result = target.request(method, '/task/1', { body: { name: 'Tarefa' } });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(method, '/task/1', {
      body: { name: 'Tarefa' },
      query: undefined,
      signal: undefined,
    });
  });

  it('429 de POST pausa leituras e permite repetir somente após recusa explícita', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError('rate_limited', 'limite', {
          status: 429,
          retryAfterMs: 5000,
        }),
      )
      .mockResolvedValue({ ok: true });
    const target = scheduler({ get: vi.fn(), request });
    const write = target.request('POST', '/task/1/comment', { body: { text: 'Mensagem' } });
    await vi.advanceTimersByTimeAsync(0);
    const read = target.get('/task/1');
    await vi.advanceTimersByTimeAsync(4999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([write, read]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('POST cancelado na fila nunca chega ao transporte', async () => {
    const request = vi.fn().mockResolvedValue({});
    const target = scheduler({ get: vi.fn(), request });
    await fill(target, 8);
    const controller = new AbortController();
    const result = target.request('POST', '/task/1/comment', { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(60_001);
    expect(request.mock.calls.some((call) => call[1] === '/task/1/comment')).toBe(false);
  });

  it('POST com timeout real do HTTP envia uma única vez', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    const target = scheduler(
      createHttpClient({ getToken: async () => 'synthetic', fetch: fetchMock }),
    );
    const assertion = expect(
      target.request('POST', '/task/1/comment', { body: { text: 'Teste' } }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
