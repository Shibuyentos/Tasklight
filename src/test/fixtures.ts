import type { ApiTask } from '../api/types';
import type { Task } from '../domain/task';

let sequence = 0;

/** Tarefa sintética no formato da API; cada chamada recebe um id novo. */
export function apiTask(overrides: Partial<ApiTask> = {}): ApiTask {
  sequence += 1;
  return {
    id: `t${sequence}`,
    custom_id: null,
    custom_item_id: null,
    name: `Tarefa ${sequence}`,
    text_content: '',
    url: `https://app.clickup.com/t/t${sequence}`,
    status: { status: 'to do', color: '#87909e', type: 'open', orderindex: 0 },
    orderindex: String(sequence),
    date_created: '1750000000000',
    date_updated: '1750000000000',
    date_closed: null,
    date_done: null,
    archived: false,
    assignees: [{ id: 111 }],
    parent: null,
    priority: null,
    due_date: null,
    start_date: null,
    list: { id: 'lista' },
    space: { id: 'espaco' },
    ...overrides,
  };
}

/** Tarefa sintética já no modelo do app; cada chamada recebe um id novo. */
export function task(overrides: Partial<Task> = {}): Task {
  sequence += 1;
  return {
    id: `t${sequence}`,
    customId: null,
    name: `Tarefa ${sequence}`,
    url: `https://app.clickup.com/t/t${sequence}`,
    status: { name: 'to do', color: '#87909e', type: 'open', orderindex: 0 },
    priority: null,
    customItemId: 0,
    parentId: null,
    listId: 'lista',
    spaceId: 'espaco',
    assigneeIds: [111],
    dueDate: null,
    startDate: null,
    orderindex: sequence,
    hasDescription: false,
    dateCreated: 1750000000000,
    dateUpdated: 1750000000000,
    dateClosed: null,
    dateDone: null,
    archived: false,
    ...overrides,
  };
}
