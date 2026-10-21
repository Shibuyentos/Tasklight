import { render, screen, waitFor, within } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createStore } from 'solid-js/store';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { TaskDetailModalProps } from '../features/task-detail/TaskDetailModal';
import type { SessionState } from '../store/session';
import { createTasksStore } from '../store/tasks';
import type { SessionService, SubmitResult } from '../sync/session';
import type { TaskSync } from '../sync/tasks';
import { task } from '../test/fixtures';
import type { WorkspaceServices } from './ServicesContext';

vi.mock('../features/task-detail/TaskDetailModal', () => ({
  default: (props: TaskDetailModalProps) => (
    <div role="dialog" aria-label={`Detalhe ${props.taskId}`}>
      <button type="button" onClick={() => props.onClose()}>
        Fechar detalhe
      </button>
      <button type="button" disabled={!props.hasPrevious} onClick={() => props.onStep(-1)}>
        Tarefa anterior
      </button>
      <button type="button" disabled={!props.hasNext} onClick={() => props.onStep(1)}>
        Próxima tarefa
      </button>
    </div>
  ),
}));

const WS = '3143793';
const ME = 1;
// Quarta-feira, 21/10/2026, 15:00 em São Paulo.
const NOW = Date.parse('2026-10-21T15:00:00-03:00');
const day = (iso: string) => Date.parse(`${iso}T04:00:00-03:00`);

function readySession(): SessionService {
  const [state, setState] = createStore<SessionState>({
    status: 'ready',
    notice: null,
    user: {
      id: ME,
      username: 'Ana Teste',
      initials: 'AT',
      color: 'rgb(0, 145, 255)',
      profilePicture: null,
      timezone: 'America/Sao_Paulo',
      weekStartDay: 0,
    },
    workspaces: [{ id: WS, name: 'MMLabbers', color: 'rgb(7, 160, 146)', avatar: null }],
    workspaceId: WS,
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

function workspace(): WorkspaceServices {
  const store = createTasksStore();
  store.upsertTasks([
    task({ id: 'a', name: 'Alfa', assigneeIds: [ME], dueDate: day('2026-12-03') }),
    task({ id: 'b', name: 'Beta', assigneeIds: [ME], dueDate: day('2026-12-02') }),
    task({ id: 'c', name: 'Gama', assigneeIds: [ME], dueDate: day('2026-12-01') }),
  ]);
  const sync: TaskSync = {
    status: () => 'idle',
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    refresh: vi.fn(async () => {}),
    pollOnce: vi.fn(async () => {}),
    requestRowDetails: vi.fn(),
  };
  return {
    workspaceId: WS,
    userId: ME,
    store,
    sync,
    dateContext: () => ({ now: NOW, timeZone: 'America/Sao_Paulo', weekStartDay: 0 }),
  };
}

async function renderAt(path: string) {
  window.history.replaceState(null, '', path);
  const ws = workspace();
  render(() => <App services={{ session: readySession(), workspace: () => ws }} />);
  await screen.findByRole('link', { name: 'Alfa' });
}

const list = () => document.querySelector('[data-ui="task-list"]');

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1500,
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

beforeEach(() => {
  localStorage.clear();
});

describe('navegação do detalhe', () => {
  it('abre a tarefa por cima da mesma lista e volta para ela ao fechar', async () => {
    const user = userEvent.setup();
    await renderAt(`/${WS}/my-work/tasks`);
    const scroller = list();

    await user.click(screen.getByRole('link', { name: 'Alfa' }));

    expect(await screen.findByRole('dialog', { name: 'Detalhe a' })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/t/${WS}/a`);
    expect(list()).toBe(scroller);

    await user.click(screen.getByRole('button', { name: 'Fechar detalhe' }));

    await waitFor(() => expect(window.location.pathname).toBe(`/${WS}/my-work/tasks`));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(list()).toBe(scroller);
  });

  it('o link da tarefa aponta para o detalhe e respeita Ctrl para abrir em outra aba', async () => {
    const user = userEvent.setup();
    await renderAt(`/${WS}/my-work/tasks`);
    const link = screen.getByRole('link', { name: 'Alfa' });

    expect(link).toHaveAttribute('href', `/t/${WS}/a`);
    // Depois do app decidir, impede o jsdom de tentar navegar de verdade.
    const stopNavigation = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('click', stopNavigation);
    await user.keyboard('{Control>}');
    await user.click(link);
    await user.keyboard('{/Control}');
    window.removeEventListener('click', stopNavigation);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe(`/${WS}/my-work/tasks`);
  });

  it('anterior e próxima seguem a ordem da lista na abertura sem empilhar histórico', async () => {
    const user = userEvent.setup();
    await renderAt(`/${WS}/my-work/tasks`);

    await user.click(screen.getByRole('link', { name: 'Alfa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Detalhe a' });
    expect(within(dialog).getByRole('button', { name: 'Tarefa anterior' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Próxima tarefa' }));
    await screen.findByRole('dialog', { name: 'Detalhe b' });
    await user.click(screen.getByRole('button', { name: 'Próxima tarefa' }));
    await screen.findByRole('dialog', { name: 'Detalhe c' });
    expect(screen.getByRole('button', { name: 'Próxima tarefa' })).toBeDisabled();

    window.history.back();

    await waitFor(() => expect(window.location.pathname).toBe(`/${WS}/my-work/tasks`));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('link direto abre o detalhe sobre "Atribuídas a mim" e fecha sem sair do app', async () => {
    const user = userEvent.setup();
    await renderAt(`/t/${WS}/b`);

    const dialog = await screen.findByRole('dialog', { name: 'Detalhe b' });
    expect(within(dialog).getByRole('button', { name: 'Próxima tarefa' })).toBeDisabled();
    const before = window.history.length;
    await user.click(screen.getByRole('button', { name: 'Fechar detalhe' }));

    await waitFor(() => expect(window.location.pathname).toBe(`/${WS}/my-work/tasks`));
    expect(window.history.length).toBe(before);
  });

  it('aberto a partir de "Hoje e atrasadas", o fundo continua sendo essa visão', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', `/${WS}/my-work/today`);
    const ws = workspace();
    ws.store.upsertTasks([
      task({ id: 'h', name: 'Atrasada', assigneeIds: [ME], dueDate: day('2026-10-20') }),
    ]);
    render(() => <App services={{ session: readySession(), workspace: () => ws }} />);

    await user.click(await screen.findByRole('link', { name: 'Atrasada' }));
    await screen.findByRole('dialog', { name: 'Detalhe h' });

    expect(screen.queryByRole('link', { name: 'Alfa' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Atrasada' })).toBeInTheDocument();
  });
});
