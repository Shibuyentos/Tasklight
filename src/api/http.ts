import { ApiError } from './errors';

export type QueryValue = string | number | boolean | Array<string | number>;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

export interface HttpClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface RateLimitInfo {
  remaining: number;
  /** Instante (ms) em que a janela de limite do ClickUp reinicia. */
  resetAt: number;
}

export interface HttpClientOptions {
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  now?: () => number;
  onRateLimitInfo?: (info: RateLimitInfo) => void;
}

const DEFAULT_BASE_URL = 'https://api.clickup.com/api/v2';
const DEFAULT_TIMEOUT_MS = 30_000;

function buildUrl(baseUrl: string, path: string, query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  const search = params.toString();
  return search ? `${baseUrl}${path}?${search}` : `${baseUrl}${path}`;
}

/** Espera sugerida pelo ClickUp: `X-RateLimit-Reset` (epoch em segundos) ou `Retry-After` (segundos). */
function retryAfterMs(headers: Headers, now: () => number): number | undefined {
  const reset = Number(headers.get('X-RateLimit-Reset'));
  if (headers.has('X-RateLimit-Reset') && Number.isFinite(reset)) {
    return Math.max(reset * 1000 - now(), 0);
  }
  const retryAfter = Number(headers.get('Retry-After'));
  if (headers.has('Retry-After') && Number.isFinite(retryAfter)) return retryAfter * 1000;
  return undefined;
}

function rateLimitInfo(headers: Headers): RateLimitInfo | null {
  if (!headers.has('X-RateLimit-Remaining') || !headers.has('X-RateLimit-Reset')) return null;
  const remaining = Number(headers.get('X-RateLimit-Remaining'));
  const reset = Number(headers.get('X-RateLimit-Reset'));
  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) return null;
  return { remaining, resetAt: reset * 1000 };
}

function errorFromResponse(response: Response, now: () => number): ApiError {
  const { status } = response;
  if (status === 401) return new ApiError('unauthorized', 'O ClickUp recusou o token', { status });
  if (status === 429) {
    return new ApiError('rate_limited', 'Limite de requisições do ClickUp atingido', {
      status,
      retryAfterMs: retryAfterMs(response.headers, now),
    });
  }
  if (status >= 500)
    return new ApiError('server', `Erro no servidor do ClickUp (HTTP ${status})`, { status });
  return new ApiError('http', `O ClickUp recusou a requisição (HTTP ${status})`, { status });
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const fetchImpl =
    options.fetch ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;

  return {
    async get<T>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
      const callerSignal = requestOptions.signal;
      const token = await options.getToken();
      if (callerSignal?.aborted) throw callerSignal.reason;
      if (!token) throw new ApiError('unauthorized', 'Nenhum token do ClickUp configurado');

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const forwardAbort = () => controller.abort(callerSignal?.reason);
      callerSignal?.addEventListener('abort', forwardAbort, { once: true });

      try {
        const response = await fetchImpl(buildUrl(baseUrl, path, requestOptions.query), {
          headers: { Authorization: token },
          signal: controller.signal,
        });
        const info = rateLimitInfo(response.headers);
        if (info) options.onRateLimitInfo?.(info);
        if (!response.ok) throw errorFromResponse(response, now);
        try {
          return (await response.json()) as T;
        } catch {
          throw new ApiError('http', 'Resposta inválida do ClickUp', { status: response.status });
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (timedOut) throw new ApiError('timeout', 'O ClickUp demorou demais para responder');
        // Cancelamento pedido por quem chamou: devolve o erro original para ser ignorado lá.
        if (callerSignal?.aborted) throw error;
        throw new ApiError('network', 'Sem conexão com o ClickUp');
      } finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', forwardAbort);
      }
    },
  };
}
