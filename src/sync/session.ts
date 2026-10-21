import { ApiError } from '../api/errors';
import type { ApiTeam, ApiUser } from '../api/types';
import type { SessionCache } from '../persistence/snapshot';
import type { SecretStore } from '../platform/types';
import {
  createSessionStore,
  type SessionState,
  type SessionUser,
  type Workspace,
} from '../store/session';

export const DEFAULT_WORKSPACE_ID = '3143793';
export const WORKSPACE_PREF_KEY = 'tasklight.workspaceId';
export const TOKEN_PATTERN = /^pk_\d+_[A-Z0-9]+$/;

/** Cor usada quando o ClickUp não informa uma (mesmo valor de `--accent`). */
const FALLBACK_COLOR = 'rgb(99, 71, 234)';

export interface TokenHolder {
  get(): string | null;
  set(token: string | null): void;
}

export function createTokenHolder(): TokenHolder {
  let current: string | null = null;
  return {
    get: () => current,
    set: (token) => {
      current = token;
    },
  };
}

export type SubmitResult = 'ok' | 'invalid-format' | 'invalid-token' | 'network';

export interface SessionService {
  readonly state: SessionState;
  boot(): Promise<void>;
  submitToken(raw: string): Promise<SubmitResult>;
  signOut(): Promise<void>;
  selectWorkspace(id: string): void;
  handleUnauthorized(): Promise<void>;
}

type Prefs = Pick<Storage, 'getItem' | 'setItem'>;

/** Conta e workspaces da última sessão, para abrir o app sem esperar a API. */
export interface SessionCacheStore {
  load(): Promise<SessionCache | null>;
  save(cache: SessionCache): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionDeps {
  secrets: SecretStore;
  token: TokenHolder;
  api: { getCurrentUser(): Promise<ApiUser>; getWorkspaces(): Promise<ApiTeam[]> };
  prefs?: Prefs | null;
  sessionCache?: SessionCacheStore | null;
}

/** O token pessoal do ClickUp carrega o id do usuário: `pk_<id>_<código>`. */
export function tokenUserId(token: string): number | null {
  const match = /^pk_(\d+)_/.exec(token);
  return match ? Number(match[1]) : null;
}

function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Remove espaços e um par de aspas que costumam vir junto ao copiar o token. */
export function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  const quoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")));
  return (quoted ? trimmed.slice(1, -1) : trimmed).trim();
}

function browserLocalStorage(): Prefs | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function toSessionUser(user: ApiUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    initials: user.initials,
    color: user.color ?? FALLBACK_COLOR,
    profilePicture: user.profilePicture,
    timezone: user.timezone || systemTimeZone(),
    weekStartDay: user.weekStartDay,
  };
}

function toWorkspace(team: ApiTeam): Workspace {
  return { id: team.id, name: team.name, color: team.color ?? FALLBACK_COLOR, avatar: team.avatar };
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'unauthorized';
}

export function createSessionService(deps: SessionDeps): SessionService {
  const [state, setState] = createSessionStore();
  const prefs = deps.prefs === undefined ? browserLocalStorage() : deps.prefs;
  // Respostas de uma conta anterior não podem alterar a sessão que a substituiu.
  let generation = 0;
  const isCurrent = (current: number) => current === generation;

  function readPref(): string | null {
    try {
      return prefs?.getItem(WORKSPACE_PREF_KEY) ?? null;
    } catch {
      return null;
    }
  }

  function writePref(id: string) {
    try {
      prefs?.setItem(WORKSPACE_PREF_KEY, id);
    } catch {
      // Sem armazenamento local, a escolha vale só nesta sessão.
    }
  }

  function chooseWorkspace(workspaces: Workspace[]): string | null {
    const saved = readPref();
    if (saved && workspaces.some((workspace) => workspace.id === saved)) return saved;
    if (workspaces.some((workspace) => workspace.id === DEFAULT_WORKSPACE_ID)) {
      return DEFAULT_WORKSPACE_ID;
    }
    return workspaces[0]?.id ?? null;
  }

  async function loadAccount(): Promise<{ user: SessionUser; workspaces: Workspace[] }> {
    const [user, teams] = await Promise.all([deps.api.getCurrentUser(), deps.api.getWorkspaces()]);
    return { user: toSessionUser(user), workspaces: teams.map(toWorkspace) };
  }

  function enterReady(
    account: { user: SessionUser; workspaces: Workspace[] },
    notice: SessionState['notice'],
  ) {
    setState({
      status: 'ready',
      notice,
      user: account.user,
      workspaces: account.workspaces,
      workspaceId: chooseWorkspace(account.workspaces),
    });
  }

  async function dropToken(notice: SessionState['notice'], current: number) {
    if (!isCurrent(current)) return;
    deps.token.set(null);
    await deps.secrets.clearToken();
    if (!isCurrent(current)) return;
    setState({ status: 'needs-token', notice, user: null, workspaces: [], workspaceId: null });
    try {
      await deps.sessionCache?.clear();
    } catch {
      // Sem a sessão salva para apagar, a próxima abertura valida pela API.
    }
  }

  /** A conta salva só vale para o mesmo usuário do token. */
  async function readSavedAccount(token: string): Promise<SessionCache | null> {
    try {
      const saved = (await deps.sessionCache?.load()) ?? null;
      return saved && saved.userId === tokenUserId(token) ? saved : null;
    } catch {
      return null;
    }
  }

  function rememberAccount(account: { user: SessionUser; workspaces: Workspace[] }) {
    const cache: SessionCache = {
      userId: account.user.id,
      user: account.user,
      workspaces: account.workspaces,
      savedAt: Date.now(),
    };
    deps.sessionCache?.save(cache).catch(() => {});
  }

  /** Confere a conta salva com a API depois que a tela já abriu. */
  async function revalidate(current: number) {
    try {
      const account = await loadAccount();
      if (!isCurrent(current) || state.status !== 'ready') return;
      setState({
        user: account.user,
        workspaces: account.workspaces,
        workspaceId: chooseWorkspace(account.workspaces),
      });
      rememberAccount(account);
    } catch (error) {
      // Sem rede, segue com a conta salva; a sincronização mostra o aviso de conexão.
      if (isCurrent(current) && isUnauthorized(error) && state.status === 'ready') {
        await dropToken('invalid-token', ++generation);
      }
    }
  }

  return {
    state,

    async boot() {
      const current = ++generation;
      setState({ status: 'booting', notice: null });
      const stored = await deps.secrets.getToken();
      if (!isCurrent(current)) return;
      if (!stored) {
        setState({ status: 'needs-token' });
        return;
      }
      deps.token.set(stored);
      const saved = await readSavedAccount(stored);
      if (!isCurrent(current)) return;
      if (saved) {
        enterReady(saved, null);
        void revalidate(current);
        return;
      }
      try {
        const account = await loadAccount();
        if (!isCurrent(current)) return;
        enterReady(account, null);
        rememberAccount(account);
      } catch (error) {
        if (!isCurrent(current)) return;
        if (isUnauthorized(error)) {
          await dropToken('invalid-token', current);
          return;
        }
        setState({ status: 'offline-error', notice: 'network' });
      }
    },

    async submitToken(raw) {
      const candidate = normalizeToken(raw);
      if (!TOKEN_PATTERN.test(candidate)) return 'invalid-format';

      const current = ++generation;
      deps.token.set(candidate);
      let account: { user: SessionUser; workspaces: Workspace[] };
      try {
        account = await loadAccount();
      } catch (error) {
        if (!isCurrent(current)) return 'network';
        deps.token.set(null);
        setState({ status: 'needs-token' });
        return isUnauthorized(error) ? 'invalid-token' : 'network';
      }
      if (!isCurrent(current)) return 'network';
      const { persisted } = await deps.secrets.setToken(candidate);
      if (!isCurrent(current)) return 'network';
      enterReady(account, persisted ? null : 'storage');
      rememberAccount(account);
      return 'ok';
    },

    async signOut() {
      await dropToken(null, ++generation);
    },

    selectWorkspace(id) {
      if (!state.workspaces.some((workspace) => workspace.id === id)) return;
      setState({ workspaceId: id });
      writePref(id);
    },

    async handleUnauthorized() {
      // Durante a abertura, quem trata o 401 é o próprio boot.
      if (state.status !== 'ready') return;
      await dropToken('invalid-token', ++generation);
    },
  };
}
