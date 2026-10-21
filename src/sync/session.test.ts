import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import type { ApiTeam, ApiUser } from '../api/types';
import type { SessionCache } from '../persistence/snapshot';
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
  weekStartDay: 0,
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

function fakeSessionCache(initial: SessionCache | null = null) {
  let saved = initial;
  return {
    load: vi.fn(async () => saved),
    save: vi.fn(async (cache: SessionCache) => {
      saved = cache;
    }),
    clear: vi.fn(async () => {
      saved = null;
    }),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const CACHED: SessionCache = {
  userId: 1,
  user: {
    id: 1,
    username: 'Ana (salva)',
    initials: 'AT',
    color: 'rgb(0, 145, 255)',
    profilePicture: null,
    timezone: 'America/Sao_Paulo',
    weekStartDay: 0,
  },
  workspaces: [{ id: '3143793', name: 'MMLabbers', color: 'rgb(7, 160, 146)', avatar: null }],
  savedAt: 1,
};

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
  sessionCache?: ReturnType<typeof fakeSessionCache>;
  /** Segura as respostas da API até ser liberado. */
  gate?: Promise<void>;
  user?: ApiUser;
}

function setup(options: SetupOptions = {}) {
  const secrets = fakeSecrets(options.stored ?? null, options.persisted ?? true);
  const token = createTokenHolder();
  const tokensSeenByApi: Array<string | null> = [];
  const api = {
    getCurrentUser: vi.fn(async () => {
      tokensSeenByApi.push(token.get());
      await options.gate;
      if (options.apiError) throw options.apiError;
      return options.user ?? USER;
    }),
    getWorkspaces: vi.fn(async () => {
      await options.gate;
      return options.workspaces ?? teams('900', DEFAULT_WORKSPACE_ID);
    }),
  };
  const prefs = options.prefs ?? memoryPrefs();
  const service = createSessionService({
    secrets,
    token,
    api,
    prefs,
    sessionCache: options.sessionCache,
  });
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

describe('boot com sessão salva', () => {
  it.each(['success', 'unauthorized'] as const)(
    'ignora a revalidação antiga (%s) depois de entrar com outra conta',
    async (outcome) => {
      const oldReply = deferred();
      const cache = fakeSessionCache(CACHED);
      const { service, api, token } = setup({ stored: 'pk_1_ABC123', sessionCache: cache });
      api.getCurrentUser
        .mockImplementationOnce(async () => {
          await oldReply.promise;
          if (outcome === 'unauthorized') {
            throw new ApiError('unauthorized', 'token antigo recusado', { status: 401 });
          }
          return USER;
        })
        .mockResolvedValue({ ...USER, id: 2, username: 'Bruno Teste' });
      api.getWorkspaces.mockImplementationOnce(async () => {
        await oldReply.promise;
        return teams(DEFAULT_WORKSPACE_ID);
      });

      await service.boot();
      await service.signOut();
      await expect(service.submitToken('pk_2_DEF456')).resolves.toBe('ok');
      const savedCount = cache.save.mock.calls.length;

      oldReply.resolve();
      await flush();

      expect(service.state.status).toBe('ready');
      expect(service.state.user).toMatchObject({ id: 2, username: 'Bruno Teste' });
      expect(token.get()).toBe('pk_2_DEF456');
      expect(cache.save).toHaveBeenCalledTimes(savedCount);
      expect(cache.clear).toHaveBeenCalledTimes(1);
    },
  );

  it('uma abertura sem cache não restaura a conta depois de sair', async () => {
    const gate = deferred();
    const cache = fakeSessionCache(null);
    const { service, token } = setup({
      stored: 'pk_1_ABC123',
      sessionCache: cache,
      gate: gate.promise,
    });
    const opening = service.boot();
    await flush();

    await service.signOut();
    gate.resolve();
    await opening;

    expect(service.state.status).toBe('needs-token');
    expect(service.state.user).toBeNull();
    expect(token.get()).toBeNull();
    expect(cache.save).not.toHaveBeenCalled();
  });

  it('fica pronto na hora, sem esperar a API', async () => {
    const gate = deferred();
    const { service, api } = setup({
      stored: 'pk_1_ABC123',
      sessionCache: fakeSessionCache(CACHED),
      gate: gate.promise,
    });

    await service.boot();

    expect(service.state.status).toBe('ready');
    expect(service.state.user?.username).toBe('Ana (salva)');
    expect(service.state.workspaceId).toBe('3143793');
    expect(api.getCurrentUser).toHaveBeenCalled();
    gate.resolve();
  });

  it('a validação em segundo plano atualiza o usuário e guarda a sessão', async () => {
    const cache = fakeSessionCache(CACHED);
    const { service } = setup({ stored: 'pk_1_ABC123', sessionCache: cache });

    await service.boot();
    await vi.waitFor(() => expect(cache.save).toHaveBeenCalled());

    expect(service.state.user?.username).toBe('Ana Teste');
    expect(cache.save.mock.calls[0]?.[0]).toMatchObject({
      userId: 1,
      user: { username: 'Ana Teste' },
    });
  });

  it('token recusado na validação volta a pedir o token e apaga a sessão salva', async () => {
    const cache = fakeSessionCache(CACHED);
    const { service, secrets } = setup({
      stored: 'pk_1_ABC123',
      sessionCache: cache,
      apiError: new ApiError('unauthorized', 'recusado', { status: 401 }),
    });

    await service.boot();
    await vi.waitFor(() => expect(service.state.status).toBe('needs-token'));

    expect(service.state.notice).toBe('invalid-token');
    expect(secrets.clearToken).toHaveBeenCalled();
    expect(cache.clear).toHaveBeenCalled();
  });

  it('sem rede na validação, continua com a conta salva', async () => {
    const { service, api } = setup({
      stored: 'pk_1_ABC123',
      sessionCache: fakeSessionCache(CACHED),
      apiError: new ApiError('network', 'sem rede'),
    });

    await service.boot();
    await vi.waitFor(() => expect(api.getCurrentUser).toHaveBeenCalled());
    await flush();

    expect(service.state.status).toBe('ready');
    expect(service.state.user?.username).toBe('Ana (salva)');
  });

  it('ignora a sessão salva de outra conta', async () => {
    const gate = deferred();
    const { service } = setup({
      stored: 'pk_2_ABC123',
      sessionCache: fakeSessionCache(CACHED),
      gate: gate.promise,
    });

    const booting = service.boot();
    await flush();
    expect(service.state.status).toBe('booting');

    gate.resolve();
    await booting;
    expect(service.state.status).toBe('ready');
  });

  it('sem sessão salva, guarda a sessão depois de validar', async () => {
    const cache = fakeSessionCache(null);
    const { service } = setup({ stored: 'pk_1_ABC123', sessionCache: cache });

    await service.boot();

    await vi.waitFor(() =>
      expect(cache.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 })),
    );
  });

  it('o usuário traz o fuso e o primeiro dia da semana', async () => {
    const { service } = setup({
      stored: 'pk_1_ABC123',
      user: { ...USER, timezone: 'America/Recife', weekStartDay: 1 },
    });

    await service.boot();

    expect(service.state.user).toMatchObject({ timezone: 'America/Recife', weekStartDay: 1 });
  });

  it('sem fuso informado, usa o do sistema', async () => {
    const { service } = setup({ stored: 'pk_1_ABC123' });

    await service.boot();

    expect(service.state.user?.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('submitToken', () => {
  it('guarda a sessão do token aceito', async () => {
    const cache = fakeSessionCache(null);
    const { service } = setup({ sessionCache: cache });

    await service.submitToken('pk_1_ABC123');

    await vi.waitFor(() => expect(cache.save).toHaveBeenCalled());
  });

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

  it('signOut apaga a sessão salva', async () => {
    const cache = fakeSessionCache(null);
    const context = setup({ stored: 'pk_1_ABC123', sessionCache: cache });
    await context.service.boot();

    await context.service.signOut();

    expect(cache.clear).toHaveBeenCalled();
  });

  it('handleUnauthorized trata como token recusado', async () => {
    const { service, secrets } = await readySession();

    await service.handleUnauthorized();

    expect(secrets.clearToken).toHaveBeenCalled();
    expect(service.state.status).toBe('needs-token');
    expect(service.state.notice).toBe('invalid-token');
  });

  it('handleUnauthorized fora de uma sessão pronta não faz nada', async () => {
    const { service, secrets } = setup({ stored: 'pk_42_ABC123' });

    await service.handleUnauthorized();

    expect(secrets.clearToken).not.toHaveBeenCalled();
    expect(service.state.status).toBe('booting');
  });

  it('selectWorkspace troca o workspace e lembra a escolha', async () => {
    const { service, prefs } = await readySession();

    service.selectWorkspace('900');

    expect(service.state.workspaceId).toBe('900');
    expect(prefs.getItem(WORKSPACE_PREF_KEY)).toBe('900');
  });
});
