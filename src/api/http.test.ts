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

describe('createHttpClient().request', () => {
  it('descarta sucesso tardio de POST quando o transporte ignora cancelamento', async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const result = clientWith(fetchMock).request('POST', '/task/1/comment', {
      body: { text: 'Comentário' },
      signal: controller.signal,
    });
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    finish(jsonResponse(200, { id: 'late' }));
    await assertion;
  });

  it('timeout durante leitura do corpo continua sendo timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const response = jsonResponse(200, {});
      response.text = () =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
        });
      return response;
    });
    const assertion = expect(
      clientWith(fetchMock).request('POST', '/task/1/comment'),
    ).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('envia POST JSON e token somente no header', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, { id: 'task-1' }));
    const client = clientWith(fetchMock);

    await expect(
      client.request('POST', '/list/1/task', { body: { name: 'Nova tarefa' } }),
    ).resolves.toEqual({ id: 'task-1' });

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('O POST não chegou ao transporte');
    const [url, init] = call;
    expect(String(url)).toBe('https://api.clickup.com/api/v2/list/1/task');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe(TOKEN);
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe('{"name":"Nova tarefa"}');
    expect(String(url)).not.toContain(TOKEN);
    expect(init?.body).not.toContain(TOKEN);
  });

  it.each([204, 200])('aceita HTTP %i com retorno vazio', async (status) => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status }));
    await expect(clientWith(fetchMock).request('DELETE', '/task/1')).resolves.toBeUndefined();
  });

  it('erro POST não ecoa token nem corpo recebido', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(500, { token: TOKEN }));
    const error = await clientWith(fetchMock)
      .request('POST', '/task/1/comment', {
        body: { comment_text: 'Texto privado' },
      })
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ kind: 'server', status: 500 });
    expect(String(error)).not.toContain(TOKEN);
    expect(String(error)).not.toContain('Texto privado');
  });

  it('JSON não vazio e inválido continua sendo erro', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('invalid', { status: 200 }));
    await expect(
      clientWith(fetchMock).request('PUT', '/task/1', { body: { name: 'Outra' } }),
    ).rejects.toMatchObject({ kind: 'http', status: 200 });
  });
});
