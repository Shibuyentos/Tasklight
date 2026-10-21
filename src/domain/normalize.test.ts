// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../api/types';
import { normalizeTask } from './normalize';

function apiTask(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'abc123',
    custom_id: 'DEMO-1',
    custom_item_id: 1025,
    name: 'Tarefa de exemplo',
    text_content: 'Descrição',
    url: 'https://app.clickup.com/t/abc123',
    status: { status: 'pendente analise pr', color: '#0c9395', type: 'custom', orderindex: 8 },
    orderindex: '10001786690816.91659',
    date_created: '1751286240000',
    date_updated: '1755154800000',
    date_closed: null,
    date_done: null,
    archived: false,
    assignees: [{ id: 111 }, { id: 222 }],
    parent: null,
    priority: { id: '3', priority: 'normal' },
    due_date: '1762412400000',
    start_date: null,
    list: { id: '901' },
    space: { id: '90' },
    ...overrides,
  };
}

describe('normalizeTask', () => {
  it('converte a tarefa da API para o modelo do app', () => {
    expect(normalizeTask(apiTask())).toEqual({
      id: 'abc123',
      customId: 'DEMO-1',
      name: 'Tarefa de exemplo',
      url: 'https://app.clickup.com/t/abc123',
      status: { name: 'pendente analise pr', color: '#0c9395', type: 'custom', orderindex: 8 },
      priority: 'normal',
      customItemId: 1025,
      parentId: null,
      listId: '901',
      spaceId: '90',
      assigneeIds: [111, 222],
      dueDate: 1762412400000,
      startDate: null,
      orderindex: Number('10001786690816.91659'),
      hasDescription: true,
      dateCreated: 1751286240000,
      dateUpdated: 1755154800000,
      dateClosed: null,
      dateDone: null,
      archived: false,
    });
  });

  it.each([
    ['1', 'urgent'],
    ['2', 'high'],
    ['3', 'normal'],
    ['4', 'low'],
  ])('prioridade %s vira %s', (id, expected) => {
    expect(normalizeTask(apiTask({ priority: { id, priority: 'x' } })).priority).toBe(expected);
  });

  it('sem prioridade fica null', () => {
    expect(normalizeTask(apiTask({ priority: null })).priority).toBeNull();
  });

  it('tipo de tarefa nulo vira a Tarefa padrão (0)', () => {
    expect(normalizeTask(apiTask({ custom_item_id: null })).customItemId).toBe(0);
  });

  it('tipo de status desconhecido vira custom', () => {
    const status = { status: 'x', color: '#000', type: 'weird', orderindex: 1 };
    expect(normalizeTask(apiTask({ status })).status.type).toBe('custom');
  });

  it('descrição só com espaços não conta como descrição', () => {
    expect(normalizeTask(apiTask({ text_content: '   ' })).hasDescription).toBe(false);
  });

  it('orderindex inválido vira 0', () => {
    expect(normalizeTask(apiTask({ orderindex: 'abc' })).orderindex).toBe(0);
  });

  it('guarda a mãe das subtarefas', () => {
    expect(normalizeTask(apiTask({ parent: 'mae1' })).parentId).toBe('mae1');
  });
});
