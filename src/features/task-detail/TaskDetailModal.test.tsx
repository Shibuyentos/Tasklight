import { render, screen, waitFor, within } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceServices } from '../../app/ServicesContext';
import { dateOnlyTime } from '../../domain/dates';
import type { TaskStatus } from '../../domain/task';
import { normalizeDetail, type TaskDetail, type TaskUser } from '../../domain/task-detail';
import { createTasksStore } from '../../store/tasks';
import { createTaskActionsService } from '../../sync/task-actions';
import { createTaskDetailsService } from '../../sync/task-detail';
import type { TaskSync } from '../../sync/tasks';
import { task } from '../../test/fixtures';
import { detailApi } from '../../test/task-detail-fixtures';
import TaskDetailModal from './TaskDetailModal';

const ME = 1;
const TZ = 'America/Sao_Paulo';
// Quarta-feira, 21/10/2026, 15:00 em São Paulo.
const NOW = Date.parse('2026-10-21T15:00:00-03:00');

const TODO: TaskStatus = { name: 'to do', color: '#87909e', type: 'open', orderindex: 0 };
const DOING: TaskStatus = { name: 'fazendo', color: '#5f55ee', type: 'custom', orderindex: 1 };
const DONE: TaskStatus = { name: 'feito', color: '#008844', type: 'closed', orderindex: 2 };

const user = (id: number, name: string): TaskUser => ({
  id,
  name,
  email: null,
  color: '#7b68ee',
  initials: name.slice(0, 2).toUpperCase(),
  avatarUrl: null,
});

function detailFor(overrides: Partial<TaskDetail> = {}, taskOverrides = {}): TaskDetail {
  return {
    ...normalizeDetail({ id: 'a' }),
    task: task({
      id: 'a',
      name: 'Revisar contrato',
      customId: 'SUP-42',
      status: TODO,
      assigneeIds: [ME],
      listId: 'lista',
      spaceId: 'espaco',
      dateCreated: Date.parse('2026-10-21T09:45:00-03:00'),
      dateUpdated: 10,
      ...taskOverrides,
    }),
    assignees: [user(ME, 'Ana Souza')],
    // O GET da tarefa traz o espaço só com o id; o nome vem da lista.
    breadcrumb: {
      space: { id: 'espaco', name: '' },
      folder: { id: 'pasta', name: 'Projetos' },
      list: { id: 'lista', name: 'Contratos' },
    },
    tags: [{ name: 'jurídico', foreground: '#4466ff', background: '#4466ff' }],
    timeSpent: 19 * 3_600_000 + 26 * 60_000,
    ...overrides,
  };
}

function setup(detail = detailFor()) {
  const api = detailApi();
  api.getTask.mockResolvedValue(detail);
  api.updateTask.mockImplementation(async () => detail);
  api.getList.mockResolvedValue({
    id: 'lista',
    name: 'Contratos',
    statuses: [TODO, DOING, DONE],
    customFields: [],
    members: [user(ME, 'Ana Souza'), user(2, 'Bruno Lima')],
    breadcrumb: {
      space: { id: 'espaco', name: 'Suporte' },
      folder: { id: 'pasta', name: 'Projetos' },
      list: { id: 'lista', name: 'Contratos' },
    },
    permissionLevel: null,
  });
  const store = createTasksStore();
  store.upsertTasks([detail.task]);
  const details = createTaskDetailsService({ api, store, workspaceId: 'w', userId: ME });
  const actions = createTaskActionsService({ api, store, details });
  const sync: TaskSync = {
    status: () => 'idle',
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    refresh: vi.fn(async () => {}),
    pollOnce: vi.fn(async () => {}),
    requestRowDetails: vi.fn(),
  };
  const workspace: WorkspaceServices = {
    workspaceId: 'w',
    userId: ME,
    store,
    sync,
    details,
    actions,
    dateContext: () => ({ now: NOW, timeZone: TZ, weekStartDay: 0 }),
  };
  const onClose = vi.fn();
  render(() => (
    <TaskDetailModal
      workspace={workspace}
      taskId="a"
      hasPrevious={false}
      hasNext={false}
      onStep={vi.fn()}
      onClose={onClose}
    />
  ));
  return { api, store, details, onClose };
}

/** O resumo do store aparece na hora; as propriedades esperam o detalhe chegar. */
const loaded = () => screen.findByText('Criada em out 21');

const property = (label: string) => {
  const row = screen.getByText(label, { selector: '[data-ui="property-label"] span' });
  const container = row.closest('[data-ui="property"]');
  if (!(container instanceof HTMLElement)) throw new Error(`Propriedade ${label} ausente`);
  return container;
};

describe('TaskDetailModal', () => {
  it('mostra caminho, criação, tipo, id e título da tarefa', async () => {
    setup();

    await loaded();
    expect(screen.getByRole('heading', { name: 'Revisar contrato' })).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Local da tarefa' });
    await waitFor(() => expect(breadcrumb).toHaveTextContent('Suporte/Projetos/Contratos'));
    expect(screen.getByText('Criada em out 21')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar ID SUP-42' })).toBeInTheDocument();
  });

  it('renomeia pelo título com Enter e cancela com Esc', async () => {
    const actor = userEvent.setup();
    const { api, onClose } = setup();

    await loaded();
    await actor.click(screen.getByRole('heading', { name: 'Revisar contrato' }));
    const input = screen.getByRole('textbox', { name: 'Nome da tarefa' });
    await actor.clear(input);
    await actor.type(input, 'Contrato revisado{Enter}');

    await waitFor(() =>
      expect(api.updateTask).toHaveBeenCalledWith(
        'a',
        { name: 'Contrato revisado' },
        expect.anything(),
      ),
    );

    await actor.click(screen.getByRole('heading', { name: /Contrato revisado|Revisar contrato/ }));
    await actor.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Nome da tarefa' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('avança o status pelo botão de próximo e fecha pelo de concluir', async () => {
    const actor = userEvent.setup();
    const { api } = setup();

    await loaded();
    await actor.click(screen.getByRole('button', { name: 'Próximo status' }));
    await waitFor(() =>
      expect(api.updateTask).toHaveBeenCalledWith('a', { status: 'fazendo' }, expect.anything()),
    );
    await actor.click(screen.getByRole('button', { name: 'Marcar como fechada' }));
    await waitFor(() =>
      expect(api.updateTask).toHaveBeenCalledWith('a', { status: 'feito' }, expect.anything()),
    );
  });

  it('prioridade vazia mostra "Vazio" e pode ser definida', async () => {
    const actor = userEvent.setup();
    const { api } = setup();

    await loaded();
    expect(property('Prioridade')).toHaveTextContent('Vazio');
    await actor.click(within(property('Prioridade')).getByRole('button'));
    await actor.click(await screen.findByRole('option', { name: /Alta/ }));

    await waitFor(() =>
      expect(api.updateTask).toHaveBeenCalledWith('a', { priority: 'high' }, expect.anything()),
    );
  });

  it('datas aceitam os atalhos do seletor', async () => {
    const actor = userEvent.setup();
    const { api } = setup();

    await loaded();
    expect(property('Datas')).toHaveTextContent('InícioVencimento');
    await actor.click(within(property('Datas')).getByRole('button'));
    await actor.click(await screen.findByRole('button', { name: /Amanhã/ }));

    await waitFor(() =>
      expect(api.updateTask).toHaveBeenCalledWith(
        'a',
        { dueDate: dateOnlyTime({ year: 2026, month: 10, day: 22 }, TZ), dueDateTime: false },
        expect.anything(),
      ),
    );
  });

  it('estimativa aceita "1h 30m" e o tempo rastreado é só leitura', async () => {
    const actor = userEvent.setup();
    const { api } = setup();

    await loaded();
    expect(property('Rastrear tempo')).toHaveTextContent('19h 26m');
    await actor.click(within(property('Estimativa de tempo')).getByRole('button'));
    await actor.type(screen.getByRole('textbox', { name: 'Estimativa de tempo' }), '1h 30m{Enter}');

    await waitFor(() =>
      expect(api.updateTask).toHaveBeenCalledWith(
        'a',
        { timeEstimate: 5_400_000 },
        expect.anything(),
      ),
    );
  });

  it('responsáveis e etiquetas usam os seletores compartilhados', async () => {
    const actor = userEvent.setup();
    const { api } = setup();

    await loaded();
    expect(property('Responsáveis')).toHaveTextContent('Ana Souza');
    expect(property('Etiquetas')).toHaveTextContent('jurídico');

    await actor.click(within(property('Responsáveis')).getByRole('button'));
    await actor.click(await screen.findByRole('option', { name: /Bruno Lima/ }));
    await actor.keyboard('{Escape}');
    await waitFor(() =>
      expect(api.updateTask).toHaveBeenCalledWith('a', { assigneeIds: [ME, 2] }, expect.anything()),
    );
  });

  it('Esc fecha o detalhe quando nenhum menu está aberto', async () => {
    const actor = userEvent.setup();
    const { onClose } = setup();

    await loaded();
    await actor.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
