import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import type { ApiTeam, ApiUser } from '../api/types';
import type { SecretStore } from '../platform/types';
import {
  createSessionService,
  createTokenHolder,
  DEFAULT_WORKSPACE_ID,
  normalizeToken,
  TOKEN_PATTERN,
  WORKSPACE_PREF_KEY,
} from './session';

const USER: ApiUser = {
  id: 1,
  username: 'Ana Teste',
  email: 'ana@exemplo.com',
  color: null,
  initials: 'AT',
  profilePicture: null,
};

function teams(...ids: string[]): ApiTeam[] {
  return ids.map((id) => ({ id, name: `Workspace ${id}`, color: null, avatar: null }));
}

function fakeSecrets(initial: string | null, persisted: boolean) {
  let stored = initial;
  return {
    getToken: vi.fn(async () => stored),
    setToken: vi.fn(async (token: string) => {
      stored = token;
      return { persisted };
    }),
    clearToken: vi.fn(async () => {
      stored = null;
    }),
  } satisfies SecretStore;
}

function memoryPrefs(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

interface SetupOptions {
  stored?: string | null;
  persisted?: boolean;
  workspaces?: ApiTeam[];
  apiError?: unknown;
  prefs?: Pick<Storage, 'getItem' | 'setItem'>;
}

function setup(options: SetupOptions = {}) {
  const secrets = fakeSecrets(options.stored ?? null, options.persisted ?? true);
  const token = createTokenHolder();
  const tokensSeenByApi: Array<string | null> = [];
  const api = {
    getCurrentUser: vi.fn(async () => {
      tokensSeenByApi.push(token.get());
      if (options.apiError) throw options.apiError;
      return USER;
    }),
    getWorkspaces: vi.fn(async () => options.workspaces ?? teams('900', DEFAULT_WORKSPACE_ID)),
  };
  const prefs = options.prefs ?? memoryPrefs();
  const service = createSessionService({ secrets, token, api, prefs });
  return { service, secrets, token, api, prefs, tokensSeenByApi };
}

describe('normalizeToken', () => {
  it.each([
    ['  pk_42_ABC123  ', 'pk_42_ABC123'],
    ['"pk_42_ABC123"\n', 'pk_42_ABC123'],
    ["  'pk_42_ABC123' ", 'pk_42_ABC123'],
  ])('%j → %s', (raw, expected) => {
    expect(normalizeToken(raw)).toBe(expected);
  });

  it('o formato aceito é pk_<número>_<código>', () => {
    expect(TOKEN_PATTERN.test('pk_42_ABC123')).toBe(true);
    expect(TOKEN_PATTERN.test('abc')).toBe(false);
    expect(TOKEN_PATTERN.test('pk_42_')).toBe(false);
  });
});

describe('boot', () => {
  it('sem token salvo, pede o token', async () => {
    const { service } = setup();

    await service.boot();

    expect(service.state.status).toBe('needs-token');
  });

  it('com token válido, carrega usuário e escolhe o MMLabbers por padrão', async () => {
    const { service, token } = setup({ stored: 'pk_42_ABC123' });

    await service.boot();

    expect(service.state.status).toBe('ready');
    expect(service.state.user?.username).toBe('Ana Teste');
    expect(service.state.user?.color).toBe('rgb(99, 71, 234)');
    expect(service.state.workspaceId).toBe('3143793');
    expect(service.state.workspaces[0]?.color).toBe('rgb(99, 71, 234)');
    expect(token.get()).toBe('pk_42_ABC123');
  });

  it('usa o workspace salvo quando ele ainda existe', async () => {
    const { service } = setup({
      stored: 'pk_42_ABC123',
      prefs: memoryPrefs({ [WORKSPACE_PREF_KEY]: '900' }),
    });

    await service.boot();

    expect(service.state.workspaceId).toBe('900');
  });

  it('workspace salvo que não existe mais cai para o MMLabbers', async () => {
    const { service } = setup({
      stored: 'pk_42_ABC123',
      prefs: memoryPrefs({ [WORKSPACE_PREF_KEY]: '999' }),
    });

    await service.boot();

    expect(service.state.workspaceId).toBe('3143793');
  });

  it('sem o salvo e sem o MMLabbers, usa o primeiro workspace', async () => {
    const { service } = setup({
      stored: 'pk_42_ABC123',
      workspaces: teams('900', '901'),
      prefs: memoryPrefs({ [WORKSPACE_PREF_KEY]: '999' }),
    });

    await service.boot();

    expect(service.state.workspaceId).toBe('900');
  });

  it('preferências inacessíveis não impedem a escolha do workspace', async () => {
    const brokenPrefs = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    const { service } = setup({ stored: 'pk_42_ABC123', prefs: brokenPrefs });

    await service.boot();

    expect(service.state.workspaceId).toBe('3143793');
  });

  it('token recusado (401) é apagado e o app pede outro', async () => {
    const { service, secrets, token } = setup({
      stored: 'pk_42_ABC123',
      apiError: new ApiError('unauthorized', 'recusado', { status: 401 }),
    });

    await service.boot();

    expect(secrets.clearToken).toHaveBeenCalled();
    expect(service.state.status).toBe('needs-token');
    expect(service.state.notice).toBe('invalid-token');
    expect(token.get()).toBeNull();
  });

  it('sem rede, mostra erro de conexão e NÃO apaga o token', async () => {
    const { service, secrets } = setup({
      stored: 'pk_42_ABC123',
      apiError: new ApiError('network', 'sem rede'),
    });

    await service.boot();

    expect(service.state.status).toBe('offline-error');
    expect(service.state.notice).toBe('network');
    expect(secrets.clearToken).not.toHaveBeenCalled();
  });
});

describe('submitToken', () => {
  it('normaliza o token colado antes de validar', async () => {
    const { service, secrets, tokensSeenByApi } = setup();

    await expect(service.submitToken('  "pk_42_ABC123"\n')).resolves.toBe('ok');

    expect(tokensSeenByApi).toEqual(['pk_42_ABC123']);
    expect(secrets.setToken).toHaveBeenCalledWith('pk_42_ABC123');
    expect(service.state.status).toBe('ready');
  });

  it('formato inválido não chama a API', async () => {
    const { service, api } = setup();

    await expect(service.submitToken('abc')).resolves.toBe('invalid-format');

    expect(api.getCurrentUser).not.toHaveBeenCalled();
  });

  it('token válido que não pôde ser salvo deixa o app pronto com aviso', async () => {
    const { service } = setup({ persisted: false });

    await expect(service.submitToken('pk_42_ABC123')).resolves.toBe('ok');

    expect(service.state.status).toBe('ready');
    expect(service.state.notice).toBe('storage');
  });

  it('token recusado devolve invalid-token e não salva nada', async () => {
    const { service, secrets, token } = setup({
      apiError: new ApiError('unauthorized', 'recusado', { status: 401 }),
    });

    await expect(service.submitToken('pk_42_ABC123')).resolves.toBe('invalid-token');

    expect(secrets.setToken).not.toHaveBeenCalled();
    expect(token.get()).toBeNull();
    expect(service.state.status).toBe('needs-token');
  });

  it('sem rede devolve network', async () => {
    const { service } = setup({ apiError: new ApiError('timeout', 'demorou') });

    await expect(service.submitToken('pk_42_ABC123')).resolves.toBe('network');
  });
});

describe('sessão pronta', () => {
  async function readySession() {
    const context = setup({ stored: 'pk_42_ABC123' });
    await context.service.boot();
    return context;
  }

  it('signOut apaga o token e volta para a tela do token', async () => {
    const { service, secrets, token } = await readySession();

    await service.signOut();

    expect(secrets.clearToken).toHaveBeenCalled();
    expect(token.get()).toBeNull();
    expect(service.state.status).toBe('needs-token');
    expect(service.state.user).toBeNull();
  });

  it('handleUnauthorized trata como token recusado', async () => {
    const { service, secrets } = await readySession();

    await service.handleUnauthorized();

    expect(secrets.clearToken).toHaveBeenCalled();
    expect(service.state.status).toBe('needs-token');
    expect(service.state.notice).toBe('invalid-token');
  });

  it('selectWorkspace troca o workspace e lembra a escolha', async () => {
    const { service, prefs } = await readySession();

    service.selectWorkspace('900');

    expect(service.state.workspaceId).toBe('900');
    expect(prefs.getItem(WORKSPACE_PREF_KEY)).toBe('900');
  });
});
