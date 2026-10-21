import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type { WorkspaceServices } from '../../app/ServicesContext';
import type { SessionState } from '../../store/session';
import { createTasksStore } from '../../store/tasks';
import type { SessionService, SubmitResult } from '../../sync/session';
import type { SyncStatus, TaskSync } from '../../sync/tasks';
import { SIDEBAR_PREF_KEY } from './sidebar-state';

function readySession(): SessionService {
  const [state, setState] = createStore<SessionState>({
    status: 'ready',
    notice: null,
    user: {
      id: 1,
      username: 'Ana Teste',
      initials: 'AT',
      color: 'rgb(0, 145, 255)',
      profilePicture: null,
      timezone: 'America/Sao_Paulo',
      weekStartDay: 0,
    },
    workspaces: [
      { id: '3143793', name: 'MMLabbers', color: 'rgb(7, 160, 146)', avatar: null },
      { id: '900', name: 'Outro espaço', color: 'rgb(64, 188, 134)', avatar: null },
    ],
    workspaceId: '3143793',
  });
  return {
    state,
    boot: vi.fn(async () => {}),
    submitToken: vi.fn(async (): Promise<SubmitResult> => 'ok'),
    signOut: vi.fn(async () => {}),
    selectWorkspace: vi.fn((id: string) => setState({ workspaceId: id })),
    handleUnauthorized: vi.fn(async () => {}),
  };
}

function workspaceWith(status: SyncStatus, workspaceId = '3143793'): WorkspaceServices {
  const sync: TaskSync = {
    status: () => status,
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    refresh: vi.fn(async () => {}),
    pollOnce: vi.fn(async () => {}),
    requestRowDetails: vi.fn(),
  };
  return {
    workspaceId,
    userId: 1,
    store: createTasksStore(),
    sync,
    dateContext: () => ({ now: 0, timeZone: 'America/Sao_Paulo', weekStartDay: 0 }),
  };
}

async function renderShell(session = readySession()) {
  render(() => <App services={{ session }} />);
  await screen.findByRole('status', { name: 'Carregando tarefas' });
  return session;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('casca do app', () => {
  it('mostra barra global, trilho, barra lateral e cabeçalho', async () => {
    await renderShell();

    for (const part of ['topbar', 'rail', 'sidebar', 'search', 'main-header']) {
      expect(document.querySelector(`[data-ui="${part}"]`)).not.toBeNull();
    }
    expect(screen.getByRole('heading', { name: 'Ana Teste' })).toBeInTheDocument();
  });

  it('abre nas tarefas atribuídas do workspace atual', async () => {
    await renderShell();

    expect(window.location.pathname).toBe('/3143793/my-work/tasks');
  });

  it.each([
    ['tasks', 'Nenhuma tarefa atribuída a você'],
    ['today', 'Nada para hoje'],
  ])(
    'o link direto para /%s seleciona o workspace da URL e aguarda seus dados',
    async (view, empty) => {
      const session = readySession();
      const previous = workspaceWith('idle');
      const [workspace, setWorkspace] = createSignal(previous);
      window.history.replaceState(null, '', `/900/my-work/${view}`);

      render(() => <App services={{ session, workspace }} />);

      expect(document.querySelector('[data-ui="my-tasks"]')).toBeNull();
      await waitFor(() => expect(session.state.workspaceId).toBe('900'));
      expect(session.selectWorkspace).toHaveBeenCalledWith('900');
      expect(document.querySelector('[data-ui="my-tasks"]')).toBeNull();
      expect(previous.sync.requestRowDetails).not.toHaveBeenCalled();

      setWorkspace(workspaceWith('idle', '900'));

      expect(await screen.findByText(empty)).toBeInTheDocument();
      expect(window.location.pathname).toBe(`/900/my-work/${view}`);
      expect(screen.getByRole('button', { name: 'Outro espaço' })).toBeInTheDocument();
    },
  );

  it.each(['tasks', 'today'])(
    'redireciona workspace não autorizado preservando /%s',
    async (view) => {
      const session = readySession();
      window.history.replaceState(null, '', `/999/my-work/${view}`);

      await renderShell(session);

      await waitFor(() => expect(window.location.pathname).toBe(`/3143793/my-work/${view}`));
      expect(session.selectWorkspace).not.toHaveBeenCalled();
      expect(session.state.workspaceId).toBe('3143793');
    },
  );

  it('a barra lateral leva às tarefas atribuídas e às de hoje', async () => {
    await renderShell();

    expect(screen.getByRole('link', { name: 'Atribuídas a mim' })).toHaveAttribute(
      'href',
      '/3143793/my-work/tasks',
    );
    expect(screen.getByRole('link', { name: 'Hoje e atrasadas' })).toHaveAttribute(
      'href',
      '/3143793/my-work/today',
    );
  });

  it('Ctrl+\\ no teclado ABNT2 recolhe a barra lateral e lembra a escolha', async () => {
    await renderShell();

    fireEvent.keyDown(window, { key: '\\', code: 'IntlBackslash', ctrlKey: true });

    expect(document.querySelector('[data-ui="sidebar"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expandir barra lateral' })).toBeInTheDocument();
    expect(localStorage.getItem(SIDEBAR_PREF_KEY)).toBe('true');
  });

  it('o botão de recolher e o de expandir alternam a barra lateral', async () => {
    const user = userEvent.setup();
    await renderShell();

    await user.click(screen.getByRole('button', { name: 'Recolher barra lateral' }));
    expect(document.querySelector('[data-ui="sidebar"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Expandir barra lateral' }));
    expect(document.querySelector('[data-ui="sidebar"]')).not.toBeNull();
  });

  it('troca de workspace pelo seletor da barra global', async () => {
    const user = userEvent.setup();
    const session = await renderShell();

    await user.click(screen.getByRole('button', { name: 'MMLabbers' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Outro espaço' }));

    expect(session.selectWorkspace).toHaveBeenCalledWith('900');
    await waitFor(() => expect(window.location.pathname).toBe('/900/my-work/tasks'));
  });

  it('"Trocar token" desconecta a sessão', async () => {
    const user = userEvent.setup();
    const session = await renderShell();

    await user.click(screen.getByRole('button', { name: 'Ana Teste' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Trocar token' }));

    expect(session.signOut).toHaveBeenCalledOnce();
  });

  it('sem conexão, avisa que mostra os dados salvos', async () => {
    const workspace = workspaceWith('offline');
    render(() => <App services={{ session: readySession(), workspace: () => workspace }} />);

    expect(
      await screen.findByRole('status', { name: 'Sem conexão — mostrando dados salvos' }),
    ).toBeInTheDocument();
  });

  it('com conexão, não mostra o aviso', async () => {
    const workspace = workspaceWith('idle');
    render(() => <App services={{ session: readySession(), workspace: () => workspace }} />);

    await screen.findByText('Nenhuma tarefa atribuída a você');
    expect(screen.queryByText('Sem conexão — mostrando dados salvos')).toBeNull();
  });

  it('a busca aparece, mas fica inativa até existir', async () => {
    await renderShell();

    expect(document.querySelector('[data-ui="search"]')).toHaveAttribute('aria-disabled', 'true');
  });
});
