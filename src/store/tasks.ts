import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { compareTasks } from '../domain/grouping';
import type { Task } from '../domain/task';

export interface TaskType {
  id: number;
  name: string;
  /** Nome do ícone no Font Awesome (ex.: 'code'); `null` usa o ícone padrão. */
  icon: string | null;
}

/** Indicadores carregados sob demanda para as linhas visíveis. */
export interface RowDetail {
  subtasksCheckedAt: number | null;
  attachments: number | null;
  attachmentsCheckedAt: number | null;
  /** `dateUpdated` da tarefa quando os indicadores foram lidos. */
  forUpdated: number;
}

export interface SyncMeta {
  /** Maior `dateUpdated` já recebido: base da próxima consulta de alterações. */
  cursor: number | null;
  lastFullSync: number | null;
}

export interface TasksState {
  tasks: Record<string, Task>;
  taskTypes: Record<number, TaskType>;
  rowDetails: Record<string, RowDetail>;
  meta: SyncMeta;
}

export interface TasksStore {
  readonly state: TasksState;
  upsertTasks(tasks: Task[]): void;
  removeTasks(ids: string[]): void;
  setTaskTypes(types: TaskType[]): void;
  setRowDetail(taskId: string, patch: Partial<RowDetail>): void;
  setMeta(patch: Partial<SyncMeta>): void;
  replace(state: TasksState): void;
  /** Cópia simples, sem proxies, pronta para ser persistida. */
  snapshot(): TasksState;
}

const EMPTY_ROW_DETAIL: RowDetail = {
  subtasksCheckedAt: null,
  attachments: null,
  attachmentsCheckedAt: null,
  forUpdated: 0,
};

export function emptyTasksState(): TasksState {
  return { tasks: {}, taskTypes: {}, rowDetails: {}, meta: { cursor: null, lastFullSync: null } };
}

export function createTasksStore(initial: TasksState = emptyTasksState()): TasksStore {
  const [state, setState] = createStore<TasksState>(initial);

  return {
    state,

    upsertTasks(tasks) {
      setState(
        'tasks',
        produce((stored) => {
          for (const task of tasks) {
            // Mesma versão (ou uma mais antiga que chegou atrasada): nada a re-renderizar.
            const current = stored[task.id];
            if (current && current.dateUpdated >= task.dateUpdated) continue;
            stored[task.id] = task;
          }
        }),
      );
    },

    removeTasks(ids) {
      setState(
        produce((draft) => {
          for (const id of ids) {
            delete draft.tasks[id];
            delete draft.rowDetails[id];
          }
        }),
      );
    },

    setTaskTypes(types) {
      setState('taskTypes', reconcile(Object.fromEntries(types.map((type) => [type.id, type]))));
    },

    setRowDetail(taskId, patch) {
      setState('rowDetails', taskId, (current) => ({ ...EMPTY_ROW_DETAIL, ...current, ...patch }));
    },

    setMeta(patch) {
      setState('meta', patch);
    },

    replace(next) {
      setState(reconcile(next));
    },

    snapshot() {
      return structuredClone(unwrap(state));
    },
  };
}

/** Linhas da aba Tarefas: tarefas raiz, não arquivadas, com o usuário entre os responsáveis. */
export function assignedRoots(state: TasksState, userId: number): Task[] {
  return Object.values(state.tasks).filter(
    (task) => task.parentId === null && !task.archived && task.assigneeIds.includes(userId),
  );
}

/** Subtarefas que contam no "⤷ N": de qualquer responsável, menos as fechadas e as arquivadas. */
export function openSubtasks(state: TasksState, parentId: string): Task[] {
  return Object.values(state.tasks)
    .filter((task) => task.parentId === parentId && task.status.type !== 'closed' && !task.archived)
    .sort(compareTasks);
}

/** `null` enquanto as subtarefas da tarefa ainda não foram conferidas na API. */
export function openSubtaskCount(state: TasksState, parentId: string): number | null {
  const checkedAt = state.rowDetails[parentId]?.subtasksCheckedAt ?? null;
  if (checkedAt === null) return null;
  return openSubtasks(state, parentId).length;
}
