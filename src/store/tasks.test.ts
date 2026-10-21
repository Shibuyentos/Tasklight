import { createMemo, createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import type { TaskStatus } from '../domain/task';
import { task } from '../test/fixtures';
import {
  assignedRoots,
  createTasksStore,
  emptyTasksState,
  openSubtaskCount,
  openSubtasks,
} from './tasks';

const ME = 111;
const OTHER = 222;
const CLOSED: TaskStatus = { name: 'concluído', color: '#008844', type: 'closed', orderindex: 21 };
const DONE: TaskStatus = { name: 'aceite', color: '#27b569', type: 'done', orderindex: 18 };

describe('createTasksStore', () => {
  it('uma tarefa nova atribuída ao usuário aparece entre as raízes', () => {
    const store = createTasksStore();
    const mine = task({ assigneeIds: [ME] });

    store.upsertTasks([
      mine,
      task({ assigneeIds: [OTHER] }),
      task({ assigneeIds: [ME], parentId: mine.id }),
      task({ assigneeIds: [ME], archived: true }),
    ]);

    expect(assignedRoots(store.state, ME).map((t) => t.id)).toEqual([mine.id]);
  });

  it('quem observa as raízes é avisado quando chega uma tarefa nova', () => {
    createRoot((dispose) => {
      const store = createTasksStore();
      const count = createMemo(() => assignedRoots(store.state, ME).length);
      expect(count()).toBe(0);

      store.upsertTasks([task({ assigneeIds: [ME] })]);

      expect(count()).toBe(1);
      dispose();
    });
  });

  it('a tarefa que deixou de ser do usuário sai das raízes, mas continua guardada', () => {
    const store = createTasksStore();
    const original = task({ assigneeIds: [ME], dateUpdated: 1 });
    store.upsertTasks([original]);

    store.upsertTasks([{ ...original, assigneeIds: [OTHER], dateUpdated: 2 }]);

    expect(assignedRoots(store.state, ME)).toEqual([]);
    expect(store.state.tasks[original.id]?.assigneeIds).toEqual([OTHER]);
  });

  it('ignora uma versão com a mesma data de atualização', () => {
    const store = createTasksStore();
    const original = task({ name: 'Antes', dateUpdated: 5 });
    store.upsertTasks([original]);

    store.upsertTasks([{ ...original, name: 'Depois' }]);

    expect(store.state.tasks[original.id]?.name).toBe('Antes');
  });

  it('não volta para uma versão mais antiga que chegou atrasada', () => {
    const store = createTasksStore();
    const original = task({ name: 'Nova', dateUpdated: 5 });
    store.upsertTasks([original]);

    store.upsertTasks([{ ...original, name: 'Velha', dateUpdated: 4 }]);

    expect(store.state.tasks[original.id]?.name).toBe('Nova');
  });

  it('removeTasks apaga a tarefa e o detalhe da linha', () => {
    const store = createTasksStore();
    const gone = task();
    const kept = task();
    store.upsertTasks([gone, kept]);
    store.setRowDetail(gone.id, { attachments: 1 });

    store.removeTasks([gone.id]);

    expect(Object.keys(store.state.tasks)).toEqual([kept.id]);
    expect(store.state.rowDetails[gone.id]).toBeUndefined();
  });

  it('setTaskTypes troca a lista inteira de tipos', () => {
    const store = createTasksStore();
    store.setTaskTypes([
      { id: 1, name: 'Defeito', icon: 'bug' },
      { id: 2, name: 'Marco', icon: null },
    ]);

    store.setTaskTypes([{ id: 2, name: 'Marco', icon: null }]);

    expect(store.state.taskTypes).toEqual({ 2: { id: 2, name: 'Marco', icon: null } });
  });

  it('setRowDetail completa o detalhe com valores vazios e depois mescla', () => {
    const store = createTasksStore();

    store.setRowDetail('x', { attachments: 2, forUpdated: 7 });
    store.setRowDetail('x', { subtasksCheckedAt: 10 });

    expect(store.state.rowDetails.x).toEqual({
      subtasksCheckedAt: 10,
      attachments: 2,
      attachmentsCheckedAt: null,
      forUpdated: 7,
    });
  });

  it('setMeta mescla o cursor e a última sincronização completa', () => {
    const store = createTasksStore();

    store.setMeta({ cursor: 100 });
    store.setMeta({ lastFullSync: 200 });

    expect(store.state.meta).toEqual({ cursor: 100, lastFullSync: 200 });
  });

  it('replace troca todo o estado', () => {
    const store = createTasksStore();
    store.upsertTasks([task()]);
    const next = emptyTasksState();
    const arrived = task();
    next.tasks[arrived.id] = arrived;
    next.meta.cursor = 300;

    store.replace(next);

    expect(Object.keys(store.state.tasks)).toEqual([arrived.id]);
    expect(store.state.meta.cursor).toBe(300);
  });

  it('snapshot devolve uma cópia simples, que pode ser clonada e não altera o store', () => {
    const store = createTasksStore();
    const saved = task();
    store.upsertTasks([saved]);
    store.setRowDetail(saved.id, { attachments: 1 });

    const copy = store.snapshot();
    expect(() => structuredClone(copy)).not.toThrow();
    copy.meta.cursor = 99;

    expect(copy.tasks[saved.id]).toEqual(saved);
    expect(store.state.meta.cursor).toBeNull();
  });
});

describe('openSubtasks', () => {
  it('lista as subtarefas não fechadas da mãe, na ordem da lista', () => {
    const store = createTasksStore();
    const parent = task();
    const later = task({ parentId: parent.id, dueDate: 2000 });
    const earlier = task({ parentId: parent.id, dueDate: 1000 });
    const done = task({ parentId: parent.id, status: DONE });
    store.upsertTasks([
      parent,
      earlier,
      task({ parentId: parent.id, status: CLOSED }),
      later,
      task({ parentId: 'outra-mae' }),
      task({ parentId: parent.id, archived: true }),
      done,
    ]);

    expect(openSubtasks(store.state, parent.id).map((t) => t.id)).toEqual([
      later.id,
      earlier.id,
      done.id,
    ]);
  });
});

describe('openSubtaskCount', () => {
  it('é null até as subtarefas serem conferidas', () => {
    const store = createTasksStore();
    const parent = task();
    store.upsertTasks([parent, task({ parentId: parent.id })]);

    expect(openSubtaskCount(store.state, parent.id)).toBeNull();
  });

  it('conta as subtarefas não fechadas depois da conferência', () => {
    const store = createTasksStore();
    const parent = task();
    store.upsertTasks([
      parent,
      task({ parentId: parent.id, assigneeIds: [OTHER] }),
      task({ parentId: parent.id }),
      task({ parentId: parent.id, status: CLOSED }),
    ]);

    store.setRowDetail(parent.id, { subtasksCheckedAt: 1 });

    expect(openSubtaskCount(store.state, parent.id)).toBe(2);
  });
});
