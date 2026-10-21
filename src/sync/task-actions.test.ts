import { describe, expect, it } from 'vitest';
import { ApiError, TaskCreationConfirmationError } from '../api/errors';
import type { TaskDetail } from '../domain/task-detail';
import { createTasksStore } from '../store/tasks';
import { deferred, detail, detailApi } from '../test/task-detail-fixtures';
import { createTaskActionsService } from './task-actions';
import { createTaskDetailsService } from './task-detail';

function setup(online = true) {
  const api = detailApi();
  const store = createTasksStore();
  store.upsertTasks([detail().task]);
  store.setMeta({ cursor: 7 });
  const saved: string[] = [];
  const details = createTaskDetailsService({ api, store, workspaceId: 'w', userId: 1 });
  const actions = createTaskActionsService({
    api,
    store,
    details,
    isOnline: () => online,
    onChange: () => saved.push(store.snapshot().tasks.a?.name ?? ''),
  });
  return { api, store, details, actions, saved };
}

describe('task actions', () => {
  it('patches immediately, blocks pending same field, confirms only owned fields without advancing cursor', async () => {
    const { api, store, actions, saved } = setup();
    const response = deferred<TaskDetail>();
    api.updateTask.mockReturnValue(response.promise);
    const operation = actions.update('a', { name: 'edited' });
    expect(store.state.tasks.a?.name).toBe('edited');
    expect(store.snapshot().tasks.a?.name).toBe('a');
    expect(actions.pending('a', 'name')).toBe(true);
    expect((await actions.update('a', { name: 'twice' })).ok).toBe(false);
    expect(api.updateTask).toHaveBeenCalledTimes(1);
    response.resolve(detail('a', 'edited', 20));
    expect((await operation).ok).toBe(true);
    expect(store.snapshot().tasks.a?.name).toBe('edited');
    expect(saved).toContain('edited');
    expect(store.state.meta.cursor).toBe(7);
    expect(actions.pending('a')).toBe(false);
  });
  it('failure removes only its overlay and never undoes newer server delta or another field', async () => {
    const { api, store, actions } = setup();
    const name = deferred<TaskDetail>();
    const priority = deferred<TaskDetail>();
    api.updateTask.mockImplementation((_id, changes) =>
      changes.name ? name.promise : priority.promise,
    );
    const first = actions.update('a', { name: 'draft' });
    const second = actions.update('a', { priority: 'high' });
    store.upsertTasks([{ ...detail('a', 'delta', 30).task, priority: 'low' }]);
    name.reject(new ApiError('http', 'bad', { status: 400 }));
    await first;
    expect(store.state.tasks.a?.name).toBe('delta');
    expect(store.state.tasks.a?.priority).toBe('high');
    priority.resolve({
      ...detail('a', 'old name', 20),
      task: { ...detail('a', 'old name', 20).task, priority: 'high' },
    });
    await second;
    expect(store.state.tasks.a?.name).toBe('delta');
    expect(store.state.tasks.a?.priority).toBe('low');
  });
  it('concurrent edits settle on the newest server version in either response order', async () => {
    const { api, store, actions } = setup();
    const name = deferred<TaskDetail>();
    const priority = deferred<TaskDetail>();
    api.updateTask.mockImplementation((_id, changes) =>
      changes.name ? name.promise : priority.promise,
    );
    const first = actions.update('a', { name: 'edited' });
    const second = actions.update('a', { priority: 'high' });
    // O servidor aplicou o nome na versão 20 e a prioridade na 21; a resposta da 21 chega antes.
    const both = detail('a', 'edited', 21);
    priority.resolve({ ...both, task: { ...both.task, priority: 'high' } });
    await second;
    name.resolve(detail('a', 'edited', 20));
    await first;
    expect(store.state.tasks.a).toMatchObject({
      name: 'edited',
      priority: 'high',
      dateUpdated: 21,
    });
  });
  it('a confirmed edit adopts the whole server version, keeping remote changes to other fields', async () => {
    const { api, store, actions } = setup();
    const edited = detail('a', 'edited', 20);
    const server = {
      ...edited,
      task: { ...edited.task, priority: 'urgent' as const, dueDate: 5_000 },
    };
    api.updateTask.mockResolvedValue(server);
    api.getTask.mockResolvedValue(server);
    expect((await actions.update('a', { name: 'edited' })).ok).toBe(true);
    expect(store.snapshot().tasks.a).toMatchObject({
      name: 'edited',
      priority: 'urgent',
      dueDate: 5_000,
      dateUpdated: 20,
    });
  });
  it('shows the chosen status with its color and type while the write is pending', async () => {
    const { api, store, actions } = setup();
    const response = deferred<TaskDetail>();
    api.updateTask.mockReturnValue(response.promise);
    const chosen = { name: 'fazendo', color: '#5f55ee', type: 'custom' as const, orderindex: 1 };
    const write = actions.update('a', { status: 'fazendo' }, { status: chosen });
    expect(store.state.tasks.a?.status).toEqual(chosen);
    expect(api.updateTask).toHaveBeenCalledWith('a', { status: 'fazendo' }, expect.anything());
    response.resolve(detail('a', 'a', 20));
    await write;
  });
  it('offline sends nothing; uncertain POST is exposed without retry or modifying the draft', async () => {
    const offline = setup(false);
    const draft = { segments: [{ text: 'draft' }] };
    const result = await offline.actions.comment('a', draft);
    expect(result).toMatchObject({ ok: false, error: { kind: 'offline' } });
    expect(offline.api.addComment).not.toHaveBeenCalled();
    const { api, actions } = setup();
    api.addComment.mockRejectedValue(new ApiError('timeout', 'timeout'));
    expect(await actions.comment('a', draft)).toMatchObject({
      ok: false,
      error: { kind: 'uncertain' },
    });
    expect(api.addComment).toHaveBeenCalledTimes(1);
    expect(draft).toEqual({ segments: [{ text: 'draft' }] });
  });
  it('successful comment receipt stays successful even when refresh fails', async () => {
    const { api, actions, details } = setup();
    await details.open('a');
    api.getComments.mockRejectedValue(new Error('offline'));
    expect(await actions.comment('a', { segments: [{ text: 'sent' }] })).toMatchObject({
      ok: true,
      value: { id: 'new-comment' },
    });
    expect(details.state.errors.comments).toBeDefined();
    expect(api.addComment).toHaveBeenCalledTimes(1);
  });
  it('dispose removes optimism and ignores late confirmation/account writes', async () => {
    const { api, store, actions, saved } = setup();
    const response = deferred<TaskDetail>();
    api.updateTask.mockReturnValue(response.promise);
    const operation = actions.update('a', { name: 'draft' });
    actions.dispose();
    response.resolve(detail('a', 'late', 20));
    expect(await operation).toMatchObject({ ok: false, error: { kind: 'disposed' } });
    expect(store.state.tasks.a?.name).toBe('a');
    expect(saved).toEqual([]);
  });
});

it('invalid custom field input fails before exposing an overlay that can crash the detail', async () => {
  const { api, actions, details } = setup();
  const field = {
    id: 'f',
    name: 'Number',
    type: 'number',
    typeConfig: {},
    options: [],
    appliedTaskTypeIds: null,
    value: 1,
    displayValue: '1',
    editable: true,
    required: false,
  };
  api.getTask.mockResolvedValue({ ...detail(), customFields: [field] });
  await details.open('a');
  const result = actions.setField('a', field, 'not a number');
  expect(() => details.state.detail).not.toThrow();
  expect(await result).toMatchObject({ ok: false, error: { kind: 'failed' } });
  expect(api.setField).not.toHaveBeenCalled();
  details.dispose();
});
it('a successful numeric zero field and checklist persist only refetched state', async () => {
  const { api, actions, details } = setup();
  const field = {
    id: 'f',
    name: 'Number',
    type: 'number',
    typeConfig: {},
    options: [],
    appliedTaskTypeIds: null,
    value: 1,
    displayValue: '1',
    editable: true,
    required: false,
  };
  const original = {
    ...detail(),
    customFields: [field],
    checklists: [
      {
        id: 'c',
        name: 'Checklist',
        items: [{ id: 'i', name: 'Item', resolved: true, assignee: null, parentId: null }],
      },
    ],
  };
  api.getTask.mockResolvedValue(original);
  await details.open('a');
  const sent = deferred<void>();
  api.setField.mockReturnValue(sent.promise);
  const setting = actions.setField('a', field, 0);
  expect(details.state.detail?.customFields[0]?.value).toBe(0);
  expect(details.peek('a')?.customFields[0]?.value).toBe(1);
  api.getTask.mockResolvedValue({
    ...original,
    customFields: [{ ...field, value: 0, displayValue: '0' }],
  });
  sent.resolve();
  expect((await setting).ok).toBe(true);
  expect(details.peek('a')?.customFields[0]?.value).toBe(0);
  const toggle = deferred<void>();
  api.setChecklistItem.mockReturnValue(toggle.promise);
  const toggling = actions.toggleChecklist('a', 'c', 'i', false);
  expect(details.state.detail?.checklists[0]?.items[0]?.resolved).toBe(false);
  toggle.reject(new ApiError('http', 'denied'));
  await toggling;
  expect(details.state.detail?.checklists[0]?.items[0]?.resolved).toBe(true);
  details.dispose();
});
it('creation retains a nonassigned result and rejects an uncertain outcome without a second POST', async () => {
  const { api, store, actions } = setup();
  const input = { listId: 'list', name: 'Created', priority: null };
  expect((await actions.create(input)).ok).toBe(true);
  expect(store.state.tasks.created?.name).toBe('created');
  expect(store.state.retainedUntil?.created).toBeGreaterThan(Date.now());
  expect(store.state.meta.cursor).toBe(7);
  api.createTask.mockRejectedValue(new ApiError('server', 'oops', { status: 503 }));
  expect(await actions.create(input)).toMatchObject({ ok: false, error: { kind: 'uncertain' } });
  expect(api.createTask).toHaveBeenCalledTimes(2);
});

it('schedules confirmed persistence before the follow-up detail read finishes', async () => {
  const { api, actions, store, saved } = setup();
  const pendingRead = deferred<TaskDetail>();
  api.updateTask.mockResolvedValue(detail('a', 'saved', 20));
  api.getTask.mockReturnValue(pendingRead.promise);
  const write = actions.update('a', { name: 'saved' });
  await Promise.resolve();
  await Promise.resolve();
  expect(store.snapshot().tasks.a?.name).toBe('saved');
  expect(saved).toContain('saved');
  actions.dispose();
  pendingRead.resolve(detail('a', 'saved', 20));
  await write;
});
it('optimistic custom fields preserve definitions and users hold the resulting list', async () => {
  const { api, actions, details } = setup();
  const field = {
    id: 'users',
    name: 'Users',
    type: 'users',
    typeConfig: {},
    options: [],
    appliedTaskTypeIds: [0],
    value: [{ id: 1 }, { id: 2 }],
    displayValue: '',
    editable: true,
    required: true,
  };
  api.getTask.mockResolvedValue({ ...detail(), customFields: [field] });
  await details.open('a');
  const sending = deferred<void>();
  api.setField.mockReturnValue(sending.promise);
  const write = actions.setField('a', field, { add: [3], rem: [1] });
  const displayed = details.state.detail?.customFields[0];
  expect(displayed?.value).toEqual([{ id: 2 }, { id: 3 }]);
  expect(displayed?.required).toBe(true);
  expect(displayed?.appliedTaskTypeIds).toEqual([0]);
  sending.reject(new ApiError('http', 'denied'));
  await write;
  expect(details.state.detail?.customFields[0]?.value).toEqual([{ id: 1 }, { id: 2 }]);
  details.dispose();
});

it('creation reports uncertainty if confirmation fails after a possibly accepted POST', async () => {
  const { api, actions } = setup();
  api.createTask.mockRejectedValue(
    new TaskCreationConfirmationError(
      'created-id',
      new ApiError('unauthorized', 'GET confirmation denied', { status: 401 }),
    ),
  );
  const result = await actions.create({ listId: 'list', name: 'Keep draft' });
  expect(result).toMatchObject({
    ok: false,
    error: { kind: 'uncertain', createdTaskId: 'created-id' },
  });
  expect(api.createTask).toHaveBeenCalledTimes(1);
  api.createTask.mockRejectedValue(new ApiError('http', 'POST rejected', { status: 400 }));
  expect(await actions.create({ listId: 'list', name: 'Rejected' })).toMatchObject({
    ok: false,
    error: { kind: 'failed' },
  });
});
