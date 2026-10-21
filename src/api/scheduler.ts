import { ApiError } from './errors';
import type { HttpClient, HttpMethod, QueryValue, RateLimitInfo } from './http';

export type RequestPriority = 'interactive' | 'visible' | 'background';

export interface ScheduledRequestOptions {
  query?: Record<string, QueryValue>;
  priority?: RequestPriority;
  signal?: AbortSignal;
  body?: unknown;
  /** Recursos privados podem responder 401 mesmo com uma sessão válida. */
  invalidateSessionOnUnauthorized?: boolean;
}

export interface Requester {
  get<T>(path: string, options?: ScheduledRequestOptions): Promise<T>;
  request?<T>(method: HttpMethod, path: string, options?: ScheduledRequestOptions): Promise<T>;
}

export interface Scheduler extends Requester {
  request<T>(method: HttpMethod, path: string, options?: ScheduledRequestOptions): Promise<T>;
  /** Dica dos headers `X-RateLimit-*` da resposta mais recente. */
  noteRateLimit(info: RateLimitInfo): void;
  /** Fim da pausa causada por um 429, ou `null` quando não há pausa. */
  pausedUntil(): number | null;
}

export interface SchedulerOptions {
  http: HttpClient;
  limitPerMinute?: number;
  reservedForInteractive?: number;
  backgroundPerMinute?: number;
  maxConcurrent?: number;
  maxAttempts?: number;
  now?: () => number;
  onUnauthorized?: () => void;
}

/** O ClickUp conta o limite por minuto: nenhuma espera legítima passa disso. */
const WINDOW_MS = 60_000;
const MIN_RATE_LIMIT_PAUSE_MS = 1000;
const MAX_RATE_LIMIT_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

const PRIORITY_RANK: Readonly<Record<RequestPriority, number>> = {
  interactive: 0,
  visible: 1,
  background: 2,
};

type JobState = 'queued' | 'running' | 'waiting' | 'settled';

interface Job {
  method: HttpMethod;
  body: unknown;
  invalidateSessionOnUnauthorized: boolean;
  path: string;
  query: Record<string, QueryValue> | undefined;
  priority: RequestPriority;
  signal: AbortSignal | undefined;
  seq: number;
  state: JobState;
  failures: number;
  rateLimitRetries: number;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onAbort: () => void;
}

interface Start {
  at: number;
  background: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Fila única de acesso à API: janela deslizante de 60 s, reserva para ações do usuário,
 * teto para o segundo plano e novas tentativas para falhas passageiras.
 */
export function createScheduler(options: SchedulerOptions): Scheduler {
  const { http, onUnauthorized } = options;
  const limit = options.limitPerMinute ?? 100;
  const reserved = options.reservedForInteractive ?? 10;
  const backgroundLimit = options.backgroundPerMinute ?? 60;
  const maxConcurrent = options.maxConcurrent ?? 4;
  const maxAttempts = options.maxAttempts ?? 3;
  const now = options.now ?? (() => Date.now());

  const queue: Job[] = [];
  let starts: Start[] = [];
  let active = 0;
  let pauseEnd = 0;
  let hint: RateLimitInfo | null = null;
  let sequence = 0;
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;

  function canStart(job: Job, at: number): boolean {
    if (at < pauseEnd) return false;
    if (job.priority === 'interactive') return starts.length < limit;
    if (hint && hint.remaining <= reserved && at < hint.resetAt) return false;
    if (starts.length >= limit - reserved) return false;
    if (job.priority !== 'background') return true;
    return starts.filter((start) => start.background).length < backgroundLimit;
  }

  function scheduleWake(at: number) {
    clearTimeout(wakeTimer);
    wakeTimer = undefined;
    if (queue.length === 0) return;
    const moments: number[] = [];
    if (at < pauseEnd) moments.push(pauseEnd);
    if (hint && at < hint.resetAt) moments.push(hint.resetAt);
    const oldest = starts[0];
    if (oldest) moments.push(oldest.at + WINDOW_MS);
    if (moments.length === 0) return;
    wakeTimer = setTimeout(drain, Math.max(Math.min(...moments) - at, 0));
  }

  function drain() {
    const at = now();
    starts = starts.filter((start) => start.at > at - WINDOW_MS);
    queue.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.seq - b.seq);
    for (const job of [...queue]) {
      if (active >= maxConcurrent) break;
      if (!canStart(job, at)) continue;
      queue.splice(queue.indexOf(job), 1);
      start(job, at);
    }
    scheduleWake(at);
  }

  function enqueue(job: Job) {
    job.state = 'queued';
    queue.push(job);
  }

  function finish(job: Job) {
    job.state = 'settled';
    job.signal?.removeEventListener('abort', job.onAbort);
  }

  function rejectJob(job: Job, reason: unknown) {
    finish(job);
    job.reject(reason);
  }

  function cancel(job: Job) {
    if (job.state === 'queued') {
      queue.splice(queue.indexOf(job), 1);
    } else if (job.state === 'waiting') {
      clearTimeout(job.retryTimer);
    } else {
      // Em andamento, o próprio cliente HTTP repassa o cancelamento ao fetch.
      return;
    }
    rejectJob(job, job.signal?.reason);
    drain();
  }

  function retryLater(job: Job) {
    job.state = 'waiting';
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (job.failures - 1), BACKOFF_MAX_MS);
    job.retryTimer = setTimeout(() => {
      job.retryTimer = undefined;
      enqueue(job);
      drain();
    }, delay);
  }

  function handleFailure(job: Job, error: unknown) {
    if (job.signal?.aborted || !(error instanceof ApiError)) return rejectJob(job, error);
    switch (error.kind) {
      case 'unauthorized':
        if (job.invalidateSessionOnUnauthorized) onUnauthorized?.();
        return rejectJob(job, error);
      case 'rate_limited': {
        const pause = clamp(error.retryAfterMs ?? WINDOW_MS, MIN_RATE_LIMIT_PAUSE_MS, WINDOW_MS);
        pauseEnd = Math.max(pauseEnd, now() + pause);
        if (job.rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) return rejectJob(job, error);
        job.rateLimitRetries += 1;
        return enqueue(job);
      }
      case 'server':
      case 'network':
      case 'timeout':
        if (job.method === 'POST' || job.method === 'DELETE') return rejectJob(job, error);
        job.failures += 1;
        if (job.failures >= maxAttempts) return rejectJob(job, error);
        return retryLater(job);
      default:
        return rejectJob(job, error);
    }
  }

  async function run(job: Job) {
    try {
      const requestOptions = { query: job.query, signal: job.signal, body: job.body };
      let value: unknown;
      if (http.request) value = await http.request(job.method, job.path, requestOptions);
      else if (job.method === 'GET') value = await http.get(job.path, requestOptions);
      else throw new Error('O transporte não oferece suporte a escritas');
      finish(job);
      job.resolve(value);
    } catch (error) {
      handleFailure(job, error);
    } finally {
      active -= 1;
      drain();
    }
  }

  function start(job: Job, at: number) {
    job.state = 'running';
    active += 1;
    starts.push({ at, background: job.priority === 'background' });
    void run(job);
  }

  function request<T>(
    method: HttpMethod,
    path: string,
    requestOptions: ScheduledRequestOptions = {},
  ): Promise<T> {
    const { signal } = requestOptions;
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        method,
        body: requestOptions.body,
        invalidateSessionOnUnauthorized: requestOptions.invalidateSessionOnUnauthorized ?? true,
        path,
        query: requestOptions.query,
        priority: requestOptions.priority ?? 'visible',
        signal,
        seq: sequence++,
        state: 'queued',
        failures: 0,
        rateLimitRetries: 0,
        retryTimer: undefined,
        resolve: resolve as (value: unknown) => void,
        reject,
        onAbort: () => cancel(job),
      };
      signal?.addEventListener('abort', job.onAbort, { once: true });
      enqueue(job);
      drain();
    });
  }

  return {
    get: (path, requestOptions) => request('GET', path, requestOptions),
    request,

    noteRateLimit(info: RateLimitInfo) {
      // Relógio do computador adiantado ou atrasado não pode segurar a fila além da janela.
      hint = { remaining: info.remaining, resetAt: Math.min(info.resetAt, now() + WINDOW_MS) };
      drain();
    },

    pausedUntil() {
      return now() < pauseEnd ? pauseEnd : null;
    },
  };
}
