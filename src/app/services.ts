import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';
import {
  createHttpClient,
  type HttpClient,
  type HttpMethod,
  type RequestOptions,
} from '../api/http';
import { createScheduler, type Requester, type ScheduledRequestOptions } from '../api/scheduler';
import { getCurrentUser, getWorkspaces } from '../api/user';
import type { DateContext } from '../domain/dates';
import { createSnapshotStore } from '../persistence/snapshot';
import { platform } from '../platform';
import { createSessionService, createTokenHolder, type TokenHolder } from '../sync/session';
import type { Services } from './ServicesContext';
import { createWorkspaceServices, type OpenWorkspace } from './workspace';

/** "Hoje", "Ontem" e os atrasos são recalculados a cada minuto, sem recarregar. */
const CLOCK_TICK_MS = 60_000;

/** Liga token, agendador, sessão, snapshot e o workspace aberto. Precisa de um dono reativo. */
export function createServices(): Services {
  let disposed = false;
  let sessionRequests = new AbortController();
  const heldToken = createTokenHolder();
  const token: TokenHolder = {
    get: () => heldToken.get(),
    set(value) {
      if (value === heldToken.get()) return;
      heldToken.set(value);
      const previous = sessionRequests;
      if (!disposed) sessionRequests = new AbortController();
      previous.abort();
    },
  };
  const client = createHttpClient({
    getToken: async () => token.get(),
    // O ClickUp não expõe esses headers ao navegador hoje; a dica vale se passar a expor.
    onRateLimitInfo: (info) => scheduler.noteRateLimit(info),
  });
  async function sessionRequest<T>(method: HttpMethod, path: string, options?: RequestOptions) {
    const requestToken = token.get();
    try {
      const result = await client.request<T>(method, path, options);
      if (token.get() !== requestToken) {
        throw new DOMException('A sessão mudou durante a requisição', 'AbortError');
      }
      return result;
    } catch (error) {
      // Um 401 de antes da troca de conta não pode desconectar o token atual.
      if (token.get() !== requestToken) {
        throw new DOMException('A sessão mudou durante a requisição', 'AbortError');
      }
      throw error;
    }
  }
  const http: HttpClient = {
    get: (path, options) => sessionRequest('GET', path, options),
    request: sessionRequest,
  };
  // Todas as chamadas à API passam por um único agendador.
  const scheduler = createScheduler({
    http,
    onUnauthorized: () => void session.handleUnauthorized(),
  });
  const requester = {
    get<T>(path: string, options: ScheduledRequestOptions = {}): Promise<T> {
      return requester.request<T>('GET', path, options);
    },
    request<T>(method: HttpMethod, path: string, options: ScheduledRequestOptions = {}) {
      const signal = options.signal
        ? AbortSignal.any([options.signal, sessionRequests.signal])
        : sessionRequests.signal;
      return scheduler.request<T>(method, path, { ...options, signal });
    },
  } satisfies Requester;
  const snapshots = createSnapshotStore();
  const session = createSessionService({
    secrets: platform.secrets,
    token,
    api: {
      getCurrentUser: () => getCurrentUser(requester),
      getWorkspaces: () => getWorkspaces(requester),
    },
    sessionCache: {
      load: () => snapshots.loadSession(),
      save: (cache) => snapshots.saveSession(cache),
      clear: () => snapshots.clearSession(),
    },
  });

  const [workspace, setWorkspace] = createSignal<OpenWorkspace | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
  const dateContext = (): DateContext => ({
    now: now(),
    timeZone: session.state.user?.timezone ?? 'America/Sao_Paulo',
    weekStartDay: session.state.user?.weekStartDay ?? 0,
  });

  // Abre o workspace quando a sessão fica pronta e o troca junto com o usuário ou o workspace.
  let openKey: string | null = null;
  let ticket = 0;
  let workspaceRequests: AbortController | null = null;
  createEffect(() => {
    const { status, user, workspaceId } = session.state;
    const key = status === 'ready' && user && workspaceId ? `${workspaceId}:${user.id}` : null;
    if (key === openKey) return;
    openKey = key;
    const current = ++ticket;
    untrack(() => {
      workspaceRequests?.abort();
      workspaceRequests = null;
      const previous = workspace();
      setWorkspace(null);
      void previous?.dispose();
      if (!key || !user || !workspaceId) return;
      const requests = new AbortController();
      workspaceRequests = requests;
      const workspaceRequester = {
        get<T>(path: string, options: ScheduledRequestOptions = {}): Promise<T> {
          return workspaceRequester.request<T>('GET', path, options);
        },
        request<T>(method: HttpMethod, path: string, options: ScheduledRequestOptions = {}) {
          const signal = options.signal
            ? AbortSignal.any([options.signal, requests.signal])
            : requests.signal;
          return requester.request<T>(method, path, { ...options, signal });
        },
      } satisfies Requester;
      createWorkspaceServices({
        workspaceId,
        userId: user.id,
        requester: workspaceRequester,
        snapshots,
        dateContext,
      })
        .then((opened) => {
          if (current === ticket) setWorkspace(opened);
          else void opened.dispose();
        })
        .catch((error: unknown) => console.error(error));
    });
  });

  // Antes de a aba sumir, grava o que esperava para ser salvo; ao voltar a rede, sincroniza já.
  const flush = () => void workspace()?.flush();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  const onOnline = () => void workspace()?.sync.pollOnce();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  window.addEventListener('online', onOnline);
  onCleanup(() => {
    disposed = true;
    ticket += 1;
    workspaceRequests?.abort();
    sessionRequests.abort();
    clearInterval(clock);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('online', onOnline);
    void workspace()?.dispose();
  });

  return { session, workspace };
}
