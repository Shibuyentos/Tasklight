import { ApiError } from '../api/errors';
import type { ApiTeam, ApiUser } from '../api/types';
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

export interface SessionDeps {
  secrets: SecretStore;
  token: TokenHolder;
  api: { getCurrentUser(): Promise<ApiUser>; getWorkspaces(): Promise<ApiTeam[]> };
  prefs?: Prefs | null;
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

  async function dropToken(notice: SessionState['notice']) {
    deps.token.set(null);
    await deps.secrets.clearToken();
    setState({ status: 'needs-token', notice, user: null, workspaces: [], workspaceId: null });
  }

  return {
    state,

    async boot() {
      setState({ status: 'booting', notice: null });
      const stored = await deps.secrets.getToken();
      if (!stored) {
        setState({ status: 'needs-token' });
        return;
      }
      deps.token.set(stored);
      try {
        enterReady(await loadAccount(), null);
      } catch (error) {
        if (isUnauthorized(error)) {
          await dropToken('invalid-token');
          return;
        }
        setState({ status: 'offline-error', notice: 'network' });
      }
    },

    async submitToken(raw) {
      const candidate = normalizeToken(raw);
      if (!TOKEN_PATTERN.test(candidate)) return 'invalid-format';

      deps.token.set(candidate);
      let account: { user: SessionUser; workspaces: Workspace[] };
      try {
        account = await loadAccount();
      } catch (error) {
        deps.token.set(null);
        setState({ status: 'needs-token' });
        return isUnauthorized(error) ? 'invalid-token' : 'network';
      }
      const { persisted } = await deps.secrets.setToken(candidate);
      enterReady(account, persisted ? null : 'storage');
      return 'ok';
    },

    async signOut() {
      await dropToken(null);
    },

    selectWorkspace(id) {
      if (!state.workspaces.some((workspace) => workspace.id === id)) return;
      setState({ workspaceId: id });
      writePref(id);
    },

    async handleUnauthorized() {
      await dropToken('invalid-token');
    },
  };
}
