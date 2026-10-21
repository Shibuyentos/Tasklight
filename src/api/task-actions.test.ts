import { describe, expect, it } from 'vitest';
import { normalizeCustomField } from '../domain/custom-fields';
import { normalizeDetail } from '../domain/task-detail';
import type { HttpMethod } from './http';
import type { Requester, ScheduledRequestOptions } from './scheduler';
import { taskChangesBody } from './task-actions';
import { createTaskDetailApi } from './task-detail';

const fullTask = {
  id: 't',
  name: 'Nova',
  custom_id: 'DEMO-1',
  custom_item_id: 3,
  text_content: 'Descrição',
  url: 'https://app.clickup.com/t/t',
  status: { status: 'open', color: '#fff', type: 'open', orderindex: 0 },
  priority: { id: '2', priority: 'high' },
  parent: 'parent',
  due_date: '200',
  start_date: '150',
  date_created: '50',
  date_closed: null,
  date_done: null,
  archived: false,
  orderindex: '123',
  assignees: [],
  list: { id: 'l' },
  space: { id: 's' },
  date_updated: '100',
};
function fixture(response: unknown = {}) {
  const calls: Array<{ method: string; path: string; options?: ScheduledRequestOptions }> = [];
  const requester: Requester = {
    get: async <T>(path: string, options?: ScheduledRequestOptions) => {
      calls.push({ method: 'GET', path, options });
      return fullTask as T;
    },
    request: async <T>(method: HttpMethod, path: string, options?: ScheduledRequestOptions) => {
      calls.push({ method, path, options });
      return response as T;
    },
  };
  return { calls, api: createTaskDetailApi(requester, 'w') };
}
describe('escritas de tarefas', () => {
  it('confirma resposta esparsa de update/create sem apagar prioridade, datas, parent e tipo', async () => {
    const sparse = {
      id: 't',
      name: 'Nova',
      status: fullTask.status,
      assignees: [],
      list: { id: 'l' },
      space: { id: 's' },
      date_updated: '100',
    };
    const previous = normalizeDetail(fullTask).task;
    const update = fixture(sparse);
    expect((await update.api.updateTask('t', { name: 'Nova' }, previous)).task).toMatchObject({
      priority: 'high',
      dueDate: 200,
      startDate: 150,
      parentId: 'parent',
      customItemId: 3,
      dateCreated: 50,
    });
    expect(update.calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
    const creation = fixture(sparse);
    expect((await creation.api.createTask({ listId: 'l', name: 'Nova' })).task).toMatchObject({
      priority: 'high',
      dueDate: 200,
      startDate: 150,
      parentId: 'parent',
      customItemId: 3,
      dateCreated: 50,
    });
    expect(creation.calls.map(({ method }) => method)).toEqual(['POST', 'GET']);
  });
  it.each(Object.keys(fullTask))('confirma por GET quando o resumo não contém %s', async (key) => {
    const partial: Record<string, unknown> = { ...fullTask };
    delete partial[key];
    // Criação sem ID não pode refazer o POST nem descobrir qual tarefa recarregar.
    const { api, calls } = fixture(partial);
    await api.updateTask('t', { name: 'Nova' }, normalizeDetail(fullTask).task);
    expect(calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
    if (key !== 'id') {
      await api.createTask({ listId: 'l', name: 'Nova' });
      expect(calls.slice(2).map(({ method }) => method)).toEqual(['POST', 'GET']);
    }
  });
  it.each([
    ['priority', { id: '9' }],
    ['due_date', 'bad'],
    ['start_date', false],
    ['parent', 3],
    ['custom_item_id', 'bad'],
    ['date_created', null],
    ['date_closed', 'bad'],
    ['date_done', false],
    ['archived', null],
    ['status', { status: 'open' }],
    ['assignees', [{ id: 'invalid' }]],
    ['list', {}],
    ['space', {}],
    ['url', 'javascript:bad'],
    ['orderindex', 'bad'],
    ['custom_id', {}],
    ['text_content', {}],
    ['orderindex', 1.5],
    ['due_date', 1.5],
  ])('confirma por GET quando %s é inválido', async (key, value) => {
    const { api, calls } = fixture({ ...fullTask, [key as string]: value });
    await api.updateTask('t', { name: 'Nova' }, normalizeDetail(fullTask).task);
    expect(calls.map(({ method }) => method)).toEqual(['PUT', 'GET']);
  });
  it('aceita null explícito nos campos nullable sem um GET extra em update/create', async () => {
    const nullable = {
      ...fullTask,
      custom_id: null,
      custom_item_id: null,
      priority: null,
      parent: null,
      due_date: null,
      start_date: null,
      text_content: null,
    };
    const { api, calls } = fixture(nullable);
    const result = await api.updateTask('t', { priority: null }, normalizeDetail(fullTask).task);
    expect(result.task).toMatchObject({
      customId: null,
      customItemId: 0,
      priority: null,
      parentId: null,
      dueDate: null,
      startDate: null,
      hasDescription: false,
    });
    await api.createTask({ listId: 'l', name: 'Nova' });
    expect(calls.map(({ method }) => method)).toEqual(['PUT', 'POST']);
  });
  it('traduz nomes do domínio, diferenças de responsáveis e nulls confirmados', () => {
    const previous = normalizeDetail({ ...fullTask, assignees: [{ id: 1 }, { id: 2 }] }).task;
    expect(
      taskChangesBody(
        {
          name: 'Nova',
          markdownDescription: '**Descrição**',
          status: 'Feito',
          priority: null,
          assigneeIds: [2, 3],
          dueDate: null,
          dueDateTime: false,
          startDate: 0,
          startDateTime: true,
          timeEstimate: null,
          customItemId: 0,
        },
        previous,
      ),
    ).toEqual({
      name: 'Nova',
      markdown_content: '**Descrição**',
      status: 'Feito',
      priority: null,
      assignees: { add: [3], rem: [1] },
      due_date: null,
      due_date_time: false,
      start_date: 0,
      start_date_time: true,
      time_estimate: null,
      custom_item_id: 0,
    });
    expect(taskChangesBody({ priority: 'urgent', timeEstimate: 0 }, previous)).toEqual({
      priority: 1,
      time_estimate: 0,
    });
  });
  it('normaliza PUT completo e confirma por GET somente respostas parciais', async () => {
    const previous = normalizeDetail(fullTask).task;
    const complete = fixture(fullTask);
    expect((await complete.api.updateTask('t', { name: 'Nova' }, previous)).task.name).toBe('Nova');
    expect(complete.calls.map((call) => call.method)).toEqual(['PUT']);
    const partial = fixture({ id: 't' });
    expect((await partial.api.updateTask('t', { name: 'Nova' }, previous)).task.id).toBe('t');
    expect(partial.calls.map((call) => call.method)).toEqual(['PUT', 'GET']);
  });
  it('usa endpoints e payloads de campo, tag, checklist e comentário sem normalizar {}', async () => {
    const { api, calls } = fixture({ id: '99999999999999999', hist_id: 'history', date: 100 });
    await api.setField('t', normalizeCustomField({ id: 'f', type: 'number' }), 0);
    await api.removeField('t', 'f');
    await api.addTag('t', 'a/b c');
    await api.removeTag('t', 'a/b c');
    await api.setChecklistItem('c', 'i', false);
    expect(await api.addComment('t', { segments: [{ text: 'Oi' }] })).toEqual({
      id: '99999999999999999',
      histId: 'history',
      date: 100,
    });
    expect(
      await api.addReply('99999999999999999', { segments: [{ text: 'Resposta' }] }),
    ).toBeUndefined();
    expect(calls.map(({ method, path, options }) => [method, path, options?.body])).toEqual([
      ['POST', '/task/t/field/f', { value: 0 }],
      ['DELETE', '/task/t/field/f', undefined],
      ['POST', '/task/t/tag/a%2Fb%20c', undefined],
      ['DELETE', '/task/t/tag/a%2Fb%20c', undefined],
      ['PUT', '/checklist/c/checklist_item/i', { resolved: false }],
      ['POST', '/task/t/comment', { comment: [{ text: 'Oi' }], notify_all: false }],
      [
        'POST',
        '/comment/99999999999999999/reply',
        { comment: [{ text: 'Resposta' }], notify_all: false },
      ],
    ]);
    expect(
      calls.every(
        ({ options }) =>
          options?.priority === 'interactive' && options.invalidateSessionOnUnauthorized === false,
      ),
    ).toBe(true);
  });
  it('cria com responsáveis completos, campos e validação de tipo antes do POST', async () => {
    const { api, calls } = fixture(fullTask);
    const field = normalizeCustomField({
      id: 'n',
      type: 'number',
      applied_objects: [{ object_type: 19, object_id: 3 }],
    });
    await api.createTask({
      listId: 'l',
      name: 'Nova',
      assigneeIds: [1],
      priority: 'low',
      customItemId: 3,
      customFields: [{ field, value: 0 }],
    });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/list/l/task',
      options: {
        body: {
          name: 'Nova',
          assignees: [1],
          priority: 4,
          custom_item_id: 3,
          custom_fields: [{ id: 'n', value: 0 }],
          check_required_custom_fields: true,
        },
      },
    });
    await expect(
      api.createTask({
        listId: 'l',
        name: 'Nova',
        customItemId: 0,
        customFields: [{ field, value: 1 }],
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
  it('falha explicitamente antes de escrever se requester antigo não suporta request', async () => {
    const api = createTaskDetailApi({ get: async <T>() => ({}) as T }, 'w');
    await expect(api.addTag('t', 'tag')).rejects.toThrow('escrita');
  });
});
