import { render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Services, ServicesProvider, type WorkspaceServices } from '../../app/ServicesContext';
import { dateOnlyTime } from '../../domain/dates';
import type { Task, TaskStatus } from '../../domain/task';
import type { ListMetadata, TaskDetail } from '../../domain/task-detail';
import { createTasksStore } from '../../store/tasks';
import type { SessionService } from '../../sync/session';
import type { ActionResult, TaskActions } from '../../sync/task-actions';
import type { TaskDetailsService } from '../../sync/task-detail';
import type { SyncStatus, TaskSync } from '../../sync/tasks';
import { task } from '../../test/fixtures';
import { MyTasksPage } from './MyTasksPage';

const ME = 111;
const TZ = 'America/Sao_Paulo';
// Quarta-feira, 21/10/2026, 15:00 em São Paulo.
const NOW = Date.parse('2026-10-21T15:00:00-03:00');

const PROGRAMADO: TaskStatus = {
  name: 'programado',
  color: 'rgb(51, 151, 221)',
  type: 'open',
  orderindex: 0,
};
const PAUSADO: TaskStatus = {
  name: 'pausado',
  color: 'rgb(245, 183, 36)',
  type: 'custom',
  orderindex: 4,
};

function fakeSync(status: SyncStatus): TaskSync {
  return {
    status: () => status,
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    refresh: vi.fn(async () => {}),
    pollOnce: vi.fn(async () => {}),
    requestRowDetails: vi.fn(),
  };
}

const done: ActionResult<TaskDetail> = { ok: true, value: {} as TaskDetail };

function fakeActions(overrides: Partial<TaskActions> = {}) {
  return {
    update: vi.fn<TaskActions['update']>(async () => done),
    setField: vi.fn(),
    clearField: vi.fn(),
    addTag: vi.fn(),
    removeTag: vi.fn(),
    toggleChecklist: vi.fn(),
    comment: vi.fn(),
    create: vi.fn(),
    pending: vi.fn<TaskActions['pending']>(() => false),
    error: () => null,
    clearError: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  } satisfies TaskActions;
}

function renderPage(
  tasks: Task[],
  options: { status?: SyncStatus; actions?: TaskActions | null } = {},
) {
  const store = createTasksStore();
  store.upsertTasks(tasks);
  const actions = options.actions === undefined ? fakeActions() : options.actions;
  const metadata: ListMetadata = {
    id: 'lista',
    name: 'Lista',
    statuses: [PROGRAMADO, PAUSADO],
    customFields: [],
    members: [],
    breadcrumb: { space: null, folder: null, list: null },
    permissionLevel: null,
  };
  const details = { listMetadata: vi.fn(async () => metadata) };
  const workspace: WorkspaceServices = {
    workspaceId: '42',
    userId: ME,
    store,
    sync: fakeSync(options.status ?? 'idle'),
    dateContext: () => ({ now: NOW, timeZone: TZ, weekStartDay: 0 }),
    ...(actions ? { actions, details: details as unknown as TaskDetailsService } : {}),
  };
  const services: Services = { session: {} as SessionService, workspace: () => workspace };
  render(() => (
    <ServicesProvider services={services}>
      <MyTasksPage />
    </ServicesProvider>
  ));
  return { store, actions, details };
}

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

const deploy = () => task({ id: 'deploy', name: 'Deploy', status: PROGRAMADO, priority: 'low' });

describe('edição na lista', () => {
  it('a célula de prioridade abre o menu e grava a escolha', async () => {
    const user = userEvent.setup();
    const { actions } = renderPage([deploy()]);

    await user.click(screen.getByRole('button', { name: 'Alterar prioridade de Deploy' }));
    await user.click(await screen.findByRole('option', { name: /Urgente/ }));

    expect(actions?.update).toHaveBeenCalledWith('deploy', { priority: 'urgent' });
  });

  it('o ícone de status usa os status da lista da tarefa', async () => {
    const user = userEvent.setup();
    const { actions, details } = renderPage([deploy()]);

    await user.click(screen.getByRole('button', { name: 'Alterar o status de Deploy' }));
    await user.click(await screen.findByRole('option', { name: 'pausado' }));

    expect(details.listMetadata).toHaveBeenCalledWith('lista');
    expect(actions?.update).toHaveBeenCalledWith(
      'deploy',
      { status: 'pausado' },
      { status: PAUSADO },
    );
  });

  it('a aba "Tipo de tarefa" do menu de status troca o tipo da tarefa', async () => {
    const user = userEvent.setup();
    const { actions, store } = renderPage([deploy()]);
    store.setTaskTypes([{ id: 1020, name: 'Bug', icon: 'bug' }]);

    await user.click(screen.getByRole('button', { name: 'Alterar o status de Deploy' }));
    await user.click(await screen.findByRole('tab', { name: 'Tipo de tarefa' }));
    await user.click(screen.getByRole('option', { name: 'Bug' }));

    expect(actions?.update).toHaveBeenCalledWith(
      'deploy',
      { customItemId: 1020 },
      { customItemId: 1020 },
    );
  });

  it('a célula de vencimento grava o atalho escolhido como data sem hora', async () => {
    const user = userEvent.setup();
    const { actions } = renderPage([deploy()]);

    await user.click(screen.getByRole('button', { name: 'Alterar datas de Deploy' }));
    await user.click(await screen.findByRole('button', { name: /Amanhã/ }));

    expect(actions?.update).toHaveBeenCalledWith('deploy', {
      dueDate: dateOnlyTime({ year: 2026, month: 10, day: 22 }, TZ),
      dueDateTime: false,
    });
  });

  it('o campo com gravação pendente fica desativado', () => {
    const actions = fakeActions({
      pending: vi.fn((_id: string, key?: string) => key === 'priority'),
    });
    renderPage([deploy()], { actions });

    expect(screen.getByRole('button', { name: 'Alterar prioridade de Deploy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Alterar datas de Deploy' })).toBeEnabled();
  });

  it('sem conexão, os editores ficam desativados e explicam o motivo', () => {
    renderPage([deploy()], { status: 'offline' });

    for (const name of [
      'Alterar o status de Deploy',
      'Alterar prioridade de Deploy',
      'Alterar datas de Deploy',
    ]) {
      const trigger = screen.getByRole('button', { name });
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveAttribute('title', 'Sem conexão');
    }
  });

  it('uma gravação recusada mostra o aviso', async () => {
    const user = userEvent.setup();
    const actions = fakeActions({
      update: vi.fn(async () => ({
        ok: false as const,
        error: { kind: 'failed' as const, taskId: 'deploy', keys: ['priority'] },
      })),
    });
    renderPage([deploy()], { actions });

    await user.click(screen.getByRole('button', { name: 'Alterar prioridade de Deploy' }));
    await user.click(await screen.findByRole('option', { name: /Alta/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar a alteração.'),
    );
  });

  it('sem os serviços de edição, a linha continua só de leitura', () => {
    renderPage([deploy()], { actions: null });

    expect(screen.queryByRole('button', { name: 'Alterar prioridade de Deploy' })).toBeNull();
    expect(screen.getByText('Baixa')).toBeInTheDocument();
  });
});
