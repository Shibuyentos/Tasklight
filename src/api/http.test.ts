import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, type HttpClientOptions } from './http';

const TOKEN = 'pk_1_ABC';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function clientWith(fetchImpl: typeof fetch, extra: Partial<HttpClientOptions> = {}) {
  return createHttpClient({ getToken: async () => TOKEN, fetch: fetchImpl, ...extra });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createHttpClient().get', () => {
  it('envia o token puro no header Authorization, sem "Bearer"', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, {}));

    await clientWith(fetchMock).get('/user');

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Authorization')).toBe('pk_1_ABC');
  });

  it('monta a URL com query string e repete a chave dos arrays', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, {}));

    await clientWith(fetchMock).get('/team/1/task', {
      query: { page: 0, 'assignees[]': [1, 2] },
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.clickup.com/api/v2/team/1/task?page=0&assignees%5B%5D=1&assignees%5B%5D=2',
    );
  });

  it('devolve o corpo JSON da resposta', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, { user: { id: 1 } }));

    await expect(clientWith(fetchMock).get('/user')).resolves.toEqual({ user: { id: 1 } });
  });

  it('sem token, falha como unauthorized sem chamar a API', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, {}));
    const client = clientWith(fetchMock, { getToken: async () => null });

    await expect(client.get('/user')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'unauthorized'],
    [404, 'http'],
    [500, 'server'],
    [503, 'server'],
  ])('HTTP %i vira %s', async (status, kind) => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(status, { err: 'x' }));

    await expect(clientWith(fetchMock).get('/user')).rejects.toMatchObject({ kind, status });
  });

  it('429 calcula a espera a partir de X-RateLimit-Reset', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(429, {}, { 'X-RateLimit-Reset': '105' }),
    );
    const client = clientWith(fetchMock, { now: () => 100_000 });

    await expect(client.get('/user')).rejects.toMatchObject({
      kind: 'rate_limited',
      status: 429,
      retryAfterMs: 5000,
    });
  });

  it('429 sem X-RateLimit-Reset usa Retry-After', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(429, {}, { 'Retry-After': '3' }),
    );

    await expect(clientWith(fetchMock).get('/user')).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterMs: 3000,
    });
  });

  it('falha de rede vira network', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(clientWith(fetchMock).get('/user')).rejects.toMatchObject({ kind: 'network' });
  });

  it('informa o limite restante a cada resposta', async () => {
    const onRateLimitInfo = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, {}, { 'X-RateLimit-Remaining': '42', 'X-RateLimit-Reset': '105' }),
    );

    await clientWith(fetchMock, { onRateLimitInfo }).get('/user');

    expect(onRateLimitInfo).toHaveBeenCalledWith({ remaining: 42, resetAt: 105_000 });
  });

  it('um sinal já cancelado não chega a chamar a API', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, {}));
    const controller = new AbortController();
    controller.abort();

    await expect(
      clientWith(fetchMock).get('/user', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancela a requisição após 30 s e falha como timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    const pending = clientWith(fetchMock).get('/user');
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(30_000);

    await assertion;
  });
});
