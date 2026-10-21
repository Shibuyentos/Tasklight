// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { apiTask } from '../test/fixtures';
import type { Requester, ScheduledRequestOptions } from './scheduler';
import {
  fetchAllTeamTasks,
  fetchAttachmentsCount,
  fetchCustomTaskTypes,
  type TeamTasksQuery,
  teamTasksParams,
} from './tasks';

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

const tasks = (count: number) => Array.from({ length: count }, () => apiTask());

describe('teamTasksParams', () => {
  it('monta a consulta das tarefas raiz atribuídas', () => {
    expect(
      teamTasksParams({ assignees: [111], subtasks: false, includeClosed: true }, 1),
    ).toStrictEqual({
      page: 1,
      'assignees[]': [111],
      subtasks: false,
      include_closed: true,
    });
  });

  it('monta a consulta do que mudou desde o último cursor', () => {
    const query: TeamTasksQuery = {
      assignees: [111],
      subtasks: true,
      includeClosed: true,
      dateUpdatedGt: 1755154800000,
      orderBy: 'updated',
    };

    expect(teamTasksParams(query, 0)).toStrictEqual({
      page: 0,
      'assignees[]': [111],
      subtasks: true,
      include_closed: true,
      date_updated_gt: 1755154800000,
      order_by: 'updated',
    });
  });

  it('monta a consulta das subtarefas de uma tarefa', () => {
    expect(teamTasksParams({ parent: 'mae1', subtasks: true }, 0)).toStrictEqual({
      page: 0,
      parent: 'mae1',
      subtasks: true,
    });
  });
});

describe('fetchAllTeamTasks', () => {
  it('junta as páginas até a última e avisa a cada página', async () => {
    const pages = [
      { tasks: tasks(100), last_page: false },
      { tasks: tasks(3), last_page: true },
    ];
    const { requester, calls } = fakeRequester(
      (_path, options) => pages[Number(options.query?.page)],
    );
    const seen: Array<[number, number]> = [];

    const result = await fetchAllTeamTasks(
      requester,
      '42',
      { assignees: [111] },
      { priority: 'background', onPage: (page, index) => seen.push([page.length, index]) },
    );

    expect(result).toHaveLength(103);
    expect(result.slice(0, 100)).toEqual(pages[0]?.tasks);
    expect(seen).toEqual([
      [100, 0],
      [3, 1],
    ]);
    expect(calls.map((call) => call.path)).toEqual(['/team/42/task', '/team/42/task']);
    expect(calls.map((call) => call.options.priority)).toEqual(['background', 'background']);
  });

  it('para na página marcada como última, mesmo cheia', async () => {
    const { requester, calls } = fakeRequester(() => ({ tasks: tasks(100), last_page: true }));

    await fetchAllTeamTasks(requester, '42', {}, { priority: 'visible' });

    expect(calls).toHaveLength(1);
  });

  it('para numa página incompleta', async () => {
    const { requester, calls } = fakeRequester(() => ({ tasks: tasks(40), last_page: false }));

    await fetchAllTeamTasks(requester, '42', {}, { priority: 'visible' });

    expect(calls).toHaveLength(1);
  });

  it('maxPages interrompe uma API que nunca termina', async () => {
    const { requester, calls } = fakeRequester(() => ({ tasks: tasks(100), last_page: false }));

    const result = await fetchAllTeamTasks(
      requester,
      '42',
      {},
      { priority: 'visible', maxPages: 2 },
    );

    expect(result).toHaveLength(200);
    expect(calls).toHaveLength(2);
  });
});

describe('fetchAttachmentsCount', () => {
  it('conta os anexos do detalhe da tarefa', async () => {
    const { requester, calls } = fakeRequester(() => ({
      id: 'abc',
      attachments: [{ id: 'a1' }, { id: 'a2' }],
    }));

    await expect(fetchAttachmentsCount(requester, 'abc', 'visible')).resolves.toBe(2);
    expect(calls).toEqual([{ path: '/task/abc', options: { priority: 'visible' } }]);
  });

  it('sem a lista de anexos, conta zero', async () => {
    const { requester } = fakeRequester(() => ({ id: 'abc' }));

    await expect(fetchAttachmentsCount(requester, 'abc', 'background')).resolves.toBe(0);
  });
});

describe('fetchCustomTaskTypes', () => {
  it('lê só id, nome e ícone dos tipos de tarefa', async () => {
    const { requester, calls } = fakeRequester(() => ({
      custom_items: [
        {
          id: 1001,
          name: 'Defeito',
          name_plural: 'Defeitos',
          description: 'Algo quebrado',
          avatar: { source: 'fas', value: 'bug' },
        },
        { id: 1002, name: 'Marco', name_plural: 'Marcos', description: null, avatar: null },
      ],
    }));

    await expect(fetchCustomTaskTypes(requester, '42')).resolves.toEqual([
      { id: 1001, name: 'Defeito', avatar: { source: 'fas', value: 'bug' } },
      { id: 1002, name: 'Marco', avatar: null },
    ]);
    expect(calls[0]?.path).toBe('/team/42/custom_item');
  });
});
