import { cleanup, fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Services, ServicesProvider, type WorkspaceServices } from '../../app/ServicesContext';
import type { Task, TaskStatus } from '../../domain/task';
import { createTasksStore } from '../../store/tasks';
import type { SessionService } from '../../sync/session';
import type { SyncStatus, TaskSync } from '../../sync/tasks';
import { task } from '../../test/fixtures';
import { MyTasksPage } from './MyTasksPage';

const ME = 111;
// Quarta-feira, 21/10/2026, 15:00 em São Paulo.
const NOW = Date.parse('2026-10-21T15:00:00-03:00');
const day = (iso: string) => Date.parse(`${iso}T04:00:00-03:00`);

const STATUS = {
  programado: { name: 'programado', color: 'rgb(51, 151, 221)', type: 'open', orderindex: 0 },
  pausado: { name: 'pausado', color: 'rgb(245, 183, 36)', type: 'custom', orderindex: 4 },
  aceite: { name: 'aceite usuário', color: 'rgb(39, 181, 105)', type: 'done', orderindex: 18 },
  concluido: { name: 'concluído', color: 'rgb(0, 136, 68)', type: 'closed', orderindex: 21 },
} satisfies Record<string, TaskStatus>;

function fakeSync(status: SyncStatus) {
  return {
    status: () => status,
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    refresh: vi.fn(async () => {}),
    pollOnce: vi.fn(async () => {}),
    requestRowDetails: vi.fn<TaskSync['requestRowDetails']>(),
  } satisfies TaskSync;
}

function renderPage(
  tasks: Task[],
  options: { filter?: 'all' | 'today'; status?: SyncStatus } = {},
) {
  const store = createTasksStore();
  store.upsertTasks(tasks);
  store.setTaskTypes([{ id: 1020, name: 'Bug', icon: 'bug' }]);
  const sync = fakeSync(options.status ?? 'idle');
  const workspace: WorkspaceServices = {
    workspaceId: '42',
    userId: ME,
    store,
    sync,
    dateContext: () => ({ now: NOW, timeZone: 'America/Sao_Paulo', weekStartDay: 0 }),
  };
  const services: Services = { session: {} as SessionService, workspace: () => workspace };
  render(() => (
    <ServicesProvider services={services}>
      <MyTasksPage filter={options.filter} />
    </ServicesProvider>
  ));
  return { store, sync };
}

const pills = () => screen.queryAllByTestId('status-pill').map((pill) => pill.textContent);
const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('[data-ui="task-row"]');
  if (!(row instanceof HTMLElement)) throw new Error(`Linha "${name}" não encontrada`);
  return row;
};
const rowNames = () => screen.queryAllByTestId('task-name').map((link) => link.textContent);

// O jsdom não calcula layout; a lista virtual precisa de uma altura para saber o que cabe na tela.
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

describe('MyTasksPage', () => {
  it('mostra os grupos na ordem do ClickUp, com os contadores', () => {
    renderPage([
      task({ status: STATUS.concluido }),
      task({ status: STATUS.aceite }),
      task({ status: STATUS.pausado }),
      task({ status: STATUS.pausado }),
      task({ status: STATUS.programado }),
    ]);

    expect(pills()).toEqual(['programado', 'pausado', 'aceite usuário', 'concluído']);
    expect(screen.getAllByTestId('group-count').map((count) => count.textContent)).toEqual([
      '1',
      '2',
      '1',
      '1',
    ]);
  });

  it('traduz os status padrão do ClickUp, como a interface em português', () => {
    renderPage([
      task({ status: { name: 'to do', color: '#87909e', type: 'open', orderindex: 0 } }),
      task({ status: { name: 'in progress', color: '#5f55ee', type: 'custom', orderindex: 1 } }),
    ]);

    expect(pills()).toEqual(['pendente', 'em progresso']);
    expect(screen.getByRole('button', { name: 'Recolher pendente' })).toBeInTheDocument();
  });

  it('mostra "Hoje" e a data atrasada em vermelho, mas não a de tarefa concluída', () => {
    renderPage([
      task({ name: 'Vence hoje', dueDate: day('2026-10-21') }),
      task({ name: 'Atrasada', dueDate: day('2026-08-28') }),
      task({ name: 'Concluída', dueDate: day('2026-08-28'), status: STATUS.concluido }),
    ]);

    expect(within(rowOf('Vence hoje')).getByText('Hoje').className).toMatch(/normal/);
    expect(within(rowOf('Atrasada')).getByText('8/28/26').className).toMatch(/overdue/);
    expect(within(rowOf('Concluída')).getByText('8/28/26').className).toMatch(/complete/);
  });

  it('mostra a prioridade com o rótulo', () => {
    renderPage([task({ name: 'Importante', priority: 'high' }), task({ name: 'Sem prioridade' })]);

    expect(within(rowOf('Importante')).getByText('Alta')).toBeInTheDocument();
    expect(within(rowOf('Sem prioridade')).queryByText('Alta')).toBeNull();
  });

  it('o chip de fechadas esconde o grupo fechado e lembra a escolha', () => {
    const tasks = [task({ status: STATUS.programado }), task({ status: STATUS.concluido })];
    renderPage(tasks);
    const chip = screen.getByRole('button', { name: 'Tarefas fechadas' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(chip);

    expect(pills()).toEqual(['programado']);
    expect(localStorage.getItem('tasklight.myTasks.showClosed')).toBe('false');

    cleanup();
    renderPage(tasks);
    expect(pills()).toEqual(['programado']);
  });

  it('recolher um grupo esconde as linhas e fica lembrado', () => {
    renderPage([task({ name: 'Visível', status: STATUS.programado })]);

    fireEvent.click(screen.getByRole('button', { name: 'Recolher programado' }));

    expect(screen.queryByText('Visível')).toBeNull();
    expect(screen.queryByText('Adicionar Tarefa')).toBeNull();
    expect(localStorage.getItem('tasklight.myTasks.collapsedGroups')).toBe('["programado"]');

    fireEvent.click(screen.getByRole('button', { name: 'Expandir programado' }));
    expect(screen.getByText('Visível')).toBeInTheDocument();
  });

  it('o nome abre a tarefa no ClickUp em outra aba', () => {
    renderPage([task({ name: 'Abrir no ClickUp', url: 'https://app.clickup.com/t/abc' })]);

    const link = screen.getByRole('link', { name: 'Abrir no ClickUp' });
    expect(link).toHaveAttribute('href', 'https://app.clickup.com/t/abc');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('pede os indicadores das linhas que estão na tela', async () => {
    const first = task();
    const second = task();
    const { sync } = renderPage([first, second]);

    await waitFor(() => expect(sync.requestRowDetails).toHaveBeenCalled());

    expect(sync.requestRowDetails.mock.calls[0]?.[0].slice().sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it('expande as subtarefas abertas de uma linha', () => {
    const parent = task({ name: 'Mãe' });
    const { store } = renderPage([
      parent,
      task({ name: 'Filha', parentId: parent.id }),
      task({ name: 'Filha fechada', parentId: parent.id, status: STATUS.concluido }),
    ]);
    expect(screen.queryByText('Filha')).toBeNull();

    store.setRowDetail(parent.id, { subtasksCheckedAt: NOW });
    expect(within(rowOf('Mãe')).getByLabelText('1 subtarefa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar subtarefas de Mãe' }));

    expect(rowNames()).toEqual(['Mãe', 'Filha']);
  });

  it('usa o ícone do tipo de tarefa na cor do status, ou o ícone do status', () => {
    renderPage([
      task({ name: 'Defeito', customItemId: 1020, status: STATUS.pausado }),
      task({ name: 'Comum', customItemId: 0, status: STATUS.pausado }),
      task({ name: 'Tipo novo', customItemId: 9999, status: STATUS.pausado }),
    ]);

    const bug = within(rowOf('Defeito')).getByTestId('type-icon');
    expect(bug).toHaveAttribute('data-icon', 'bug');
    expect(bug).toHaveStyle({ color: 'rgb(245, 183, 36)' });
    expect(within(rowOf('Comum')).getByTestId('type-icon')).toHaveAttribute(
      'data-status-icon',
      'custom',
    );
    expect(within(rowOf('Tipo novo')).getByTestId('type-icon')).toHaveAttribute(
      'data-status-icon',
      'custom',
    );
  });

  it('em "Hoje e atrasadas", só ficam as vencidas ou de hoje que não estão completas', () => {
    renderPage(
      [
        task({ name: 'Vence hoje', dueDate: day('2026-10-21') }),
        task({ name: 'Atrasada', dueDate: day('2026-10-01') }),
        task({ name: 'Vence amanhã', dueDate: day('2026-10-22') }),
        task({ name: 'Sem data' }),
        task({ name: 'Aceita', dueDate: day('2026-10-01'), status: STATUS.aceite }),
      ],
      { filter: 'today' },
    );

    expect(rowNames().sort()).toEqual(['Atrasada', 'Vence hoje']);
  });

  it('sem nada para hoje, avisa', () => {
    renderPage([task({ name: 'Vence amanhã', dueDate: day('2026-10-22') })], { filter: 'today' });

    expect(screen.getByText('Nada para hoje')).toBeInTheDocument();
  });

  it('sem tarefas, avisa que não há nada atribuído', () => {
    renderPage([]);

    expect(screen.getByText('Nenhuma tarefa atribuída a você')).toBeInTheDocument();
  });

  it('carregando pela primeira vez, mostra linhas-esqueleto', () => {
    renderPage([], { status: 'loading' });

    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(8);
    expect(screen.queryByText('Nenhuma tarefa atribuída a você')).toBeNull();
  });

  it('durante a reconciliação, mostra "Sincronizando…" sem esconder a lista', () => {
    renderPage([task({ name: 'Continua aqui' })], { status: 'syncing' });

    expect(screen.getByText('Sincronizando…')).toBeInTheDocument();
    expect(screen.getByText('Continua aqui')).toBeInTheDocument();
  });

  it('parado, não mostra o aviso de sincronização', () => {
    renderPage([task()]);

    expect(screen.queryByText('Sincronizando…')).toBeNull();
  });

  it('"Adicionar Tarefa" aparece desativado', () => {
    renderPage([task()]);

    expect(screen.getByRole('button', { name: 'Adicionar Tarefa' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
