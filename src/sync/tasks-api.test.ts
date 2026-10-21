// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Requester, ScheduledRequestOptions } from '../api/scheduler';
import { apiTask } from '../test/fixtures';
import { createTasksApi } from './tasks-api';

const ME = 111;

interface Call {
  path: string;
  options: ScheduledRequestOptions;
}

function fakeRequester(respond: (path: string, options: ScheduledRequestOptions) => unknown) {
  const calls: Call[] = [];
  const requester: Requester = {
    get: async <T>(path: string, options: ScheduledRequestOptions = {}) => {
      calls.push({ path, options });
      return respond(path, options) as T;
    },
  };
  return { requester, calls };
}

describe('createTasksApi', () => {
  it('carrega as raízes atribuídas página a página, já no modelo do app', async () => {
    const first = Array.from({ length: 100 }, () => apiTask({ due_date: '1762412400000' }));
    const second = [apiTask()];
    const { requester, calls } = fakeRequester((_path, options) =>
      options.query?.page === 0
        ? { tasks: first, last_page: false }
        : { tasks: second, last_page: true },
    );
    const pages: number[] = [];

    const tasks = await createTasksApi(requester, '42', ME).fetchAssignedRoots((page) =>
      pages.push(page.length),
    );

    expect(pages).toEqual([100, 1]);
    expect(tasks).toHaveLength(101);
    expect(tasks[0]).toMatchObject({ id: first[0]?.id, dueDate: 1762412400000, parentId: null });
    expect(calls[0]).toEqual({
      path: '/team/42/task',
      options: {
        query: { page: 0, 'assignees[]': [ME], subtasks: false, include_closed: true },
        priority: 'visible',
      },
    });
  });

  it('busca o que mudou no workspace inteiro, sem filtro de responsável', async () => {
    const { requester, calls } = fakeRequester(() => ({ tasks: [apiTask()], last_page: true }));

    const tasks = await createTasksApi(requester, '42', ME).fetchUpdatedSince(1755154800000);

    expect(tasks).toHaveLength(1);
    expect(calls[0]?.options).toEqual({
      query: {
        page: 0,
        subtasks: true,
        include_closed: true,
        date_updated_gt: 1755154800000,
        order_by: 'updated',
      },
      priority: 'background',
    });
  });

  it('busca as subtarefas não fechadas de uma tarefa', async () => {
    const { requester, calls } = fakeRequester(() => ({
      tasks: [apiTask({ parent: 'mae1' })],
      last_page: true,
    }));

    const subtasks = await createTasksApi(requester, '42', ME).fetchOpenSubtasks('mae1');

    expect(subtasks[0]?.parentId).toBe('mae1');
    expect(calls[0]?.options).toEqual({
      query: { page: 0, parent: 'mae1', subtasks: true, include_closed: false },
      priority: 'background',
    });
  });

  it('conta os anexos em segundo plano', async () => {
    const { requester, calls } = fakeRequester(() => ({ attachments: [{}, {}, {}] }));

    await expect(createTasksApi(requester, '42', ME).fetchAttachmentsCount('abc')).resolves.toBe(3);
    expect(calls).toEqual([{ path: '/task/abc', options: { priority: 'background' } }]);
  });

  it('lê os tipos de tarefa e só aproveita ícones do Font Awesome', async () => {
    const { requester, calls } = fakeRequester(() => ({
      custom_items: [
        { id: 1, name: 'Defeito', avatar: { source: 'fas', value: 'bug' } },
        { id: 2, name: 'Marca', avatar: { source: 'fab', value: 'stripe-s' } },
        { id: 3, name: 'Marco', avatar: { source: null, value: null } },
        { id: 4, name: 'Imagem', avatar: { source: 'url', value: 'https://exemplo.com/x.png' } },
        { id: 5, name: 'Sem avatar', avatar: null },
      ],
    }));

    await expect(createTasksApi(requester, '42', ME).fetchTaskTypes()).resolves.toEqual([
      { id: 1, name: 'Defeito', icon: 'bug' },
      { id: 2, name: 'Marca', icon: 'stripe-s' },
      { id: 3, name: 'Marco', icon: null },
      { id: 4, name: 'Imagem', icon: null },
      { id: 5, name: 'Sem avatar', icon: null },
    ]);
    expect(calls[0]).toEqual({ path: '/team/42/custom_item', options: { priority: 'background' } });
  });
});
